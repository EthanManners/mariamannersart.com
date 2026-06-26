// Backend payment service for the Maria Manners shop.
//
// This is the ONLY component that touches the Stripe SECRET key. It also serves
// the static site so the browser and the API share one origin (no CORS).
//
// ── Why the publishable key is safe in the browser but the secret key is not ──
// The publishable key (pk_...) can only do client-safe things: create/confirm a
// PaymentIntent that the SERVER already authorized and priced. It cannot read
// your account, move money to arbitrary amounts, issue refunds, or list other
// customers. It is meant to ship in client code.
// The secret key (sk_...) can do ALL of that — full account access. If it ever
// reached a browser, anyone could read it from devtools and drain/charge the
// account. So sk_ is read from the server environment at startup, never logged,
// never sent in a response, and the file holding it lives outside the served
// tree. The browser only ever receives pk_ (via GET /api/config).
//
// Endpoints:
//   GET  /api/healthz                -> { status: "ok" }
//   GET  /api/config                 -> { publishableKey }
//   GET  /api/catalog                -> { itemId: status, ... }
//   POST /api/create-payment-intent  { itemIds: [...] } -> { clientSecret }
//   POST /api/subscribe              { email }          -> { ok: true }
//   POST /api/webhook                Stripe events (raw body, signature-verified)

const path = require("path");
const fs = require("fs");
const express = require("express");
const Stripe = require("stripe");
const { getPurchasable, markSold, getStatuses } = require("./catalog");

// ── Config (environment variables only) ──────────────────────────────────────
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const PORT = process.env.PORT || 8787;
// Bind address. Default 0.0.0.0; set HOST=127.0.0.1 in production so the port is
// only reachable via the local reverse proxy (nginx), never the public internet.
const HOST = process.env.HOST || "0.0.0.0";

if (!STRIPE_SECRET_KEY) {
  console.error(
    "FATAL: STRIPE_SECRET_KEY is not set. Provide it via the environment " +
      "(e.g. a .env file loaded by your process manager) and restart."
  );
  process.exit(1);
}
if (!STRIPE_PUBLISHABLE_KEY) {
  // Not fatal — the API still runs — but the browser can't init Stripe.js.
  console.warn(
    "WARNING: STRIPE_PUBLISHABLE_KEY is not set. GET /api/config will return an " +
      "empty key and the checkout form won't load until it is provided."
  );
}
if (!STRIPE_WEBHOOK_SECRET) {
  // Not fatal — the rest of the service runs — but webhook events can't be verified.
  console.warn(
    "WARNING: STRIPE_WEBHOOK_SECRET is not set. POST /api/webhook will reject " +
      "events (503) until it is provided."
  );
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

const app = express();
app.set("trust proxy", 1); // behind nginx in prod, so req.ip reflects the real client

// Parse JSON for every route EXCEPT the Stripe webhook, which needs the RAW body
// for signature verification (a parsed body breaks the signature check). The
// webhook route applies its own express.raw() parser below.
app.use((req, res, next) => {
  if (req.path === "/api/webhook") return next();
  express.json()(req, res, next);
});

// ── Static site (the ONLY served tree; server/, node_modules, .env are siblings) ──
const PUBLIC_DIR = path.join(__dirname, "..", "public");
app.use(express.static(PUBLIC_DIR));

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/api/healthz", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// ── Public config: hands the browser the publishable key only ────────────────
app.get("/api/config", (req, res) => {
  res.json({ publishableKey: STRIPE_PUBLISHABLE_KEY || "" });
});

// ── Catalog status: lets the shop render sold pieces as sold ──────────────────
app.get("/api/catalog", (req, res) => {
  res.json(getStatuses());
});

// ── Create PaymentIntent ─────────────────────────────────────────────────────
// The browser sends a list of itemIds only. The server looks each up, rejects
// anything not purchasable, and SUMS the authoritative amounts. The amount is
// never trusted from the client.
app.post("/api/create-payment-intent", async (req, res) => {
  const { itemIds } = req.body || {};

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return res.status(400).json({ error: "itemIds must be a non-empty array." });
  }

  // Originals are unique — dedupe defensively.
  const ids = [...new Set(itemIds)];

  let amount = 0;
  for (const id of ids) {
    const item = getPurchasable(id);
    if (!item) {
      // Unknown, sold, or unpriced — reject the whole order.
      return res.status(400).json({ error: `Item not available for purchase: ${id}` });
    }
    amount += item.amountCents;
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { itemIds: ids.join(",") },
    });
    return res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("Failed to create PaymentIntent:", err.message);
    return res.status(500).json({ error: "Could not create payment." });
  }
});

// ── Subscribe ────────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post("/api/subscribe", subscribeRateLimit, async (req, res) => {
  const raw = req.body && typeof req.body.email === "string" ? req.body.email : "";
  const email = raw.trim().toLowerCase();

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  try {
    const added = await addSubscriber(email);
    if (added) forwardToEmailProvider(email); // only forward genuinely new addresses
    // Always report success — don't reveal whether the address was already known.
    return res.json({ ok: true });
  } catch (err) {
    console.error("Failed to save subscriber:", err.message);
    return res.status(500).json({ error: "Could not subscribe right now." });
  }
});

// ── Stripe webhook ───────────────────────────────────────────────────────────
// Confirms sales server-side. Stripe signs each event; we verify it against the
// RAW body (parsed bodies fail verification), so this route uses express.raw and
// the global JSON parser skips this path. Once the signature is valid we ack with
// 200 immediately and run fulfillment off the response path — never block on it.
app.post("/api/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.warn("Webhook received but STRIPE_WEBHOOK_SECRET is not set; ignoring.");
    return res.status(503).json({ error: "Webhook not configured." });
  }

  let event;
  try {
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Signature valid — acknowledge right away.
  res.json({ received: true });

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object;
    const itemIds = (pi.metadata && pi.metadata.itemIds ? pi.metadata.itemIds : "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    console.log(
      `SALE: payment_intent ${pi.id} succeeded for [${itemIds.join(", ")}] ` +
        `(${pi.amount} ${pi.currency}).`
    );
    // Run fulfillment outside the response path so we never block the 200.
    setImmediate(() => fulfillOrder(itemIds, pi));
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Payment service + site listening on ${HOST}:${PORT}`);
});

// Single fulfillment hook for a confirmed sale. Marks each piece sold (so it
// shows as sold and can't be bought again) and is the one place to add buyer/
// artist notifications later. Called only after a verified payment_intent.succeeded.
function fulfillOrder(itemIds, paymentIntent) {
  for (const id of itemIds) {
    const ok = markSold(id);
    console.log(ok ? `fulfillment: flagged sold ${id}` : `fulfillment: unknown item ${id}`);
  }
  // TODO: notify Maria (email/SMS) with the order + shipping details from
  // paymentIntent.shipping (name, address, phone) and paymentIntent.receipt_email.
}

// ── Subscriber persistence (flat JSON file; swap for a DB later if needed) ────
const DATA_DIR = path.join(__dirname, "data");
const SUBSCRIBERS_FILE = path.join(DATA_DIR, "subscribers.json");

function readSubscribers() {
  try {
    return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, "utf8"));
  } catch {
    return []; // missing/empty/corrupt -> start fresh
  }
}

// Serialize writes so concurrent requests can't clobber each other's read-modify-write.
let writeChain = Promise.resolve();
function addSubscriber(email) {
  const run = writeChain.then(() => {
    const list = readSubscribers();
    if (list.some((s) => s.email === email)) return false; // dedupe
    list.push({ email, ts: new Date().toISOString() });
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(list, null, 2));
    return true;
  });
  writeChain = run.catch(() => {}); // keep the chain alive even if one write fails
  return run;
}

// Stub: wire this to your email provider (Mailchimp / Buttondown / etc.) later.
// Called once per newly-added subscriber.
function forwardToEmailProvider(email) {
  // TODO: integrate provider API here.
  console.log(`subscriber added (forward stub): ${email}`);
}

// ── Light rate limit for /api/subscribe (in-memory, per-IP sliding window) ────
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;
const rateHits = new Map(); // ip -> timestamps[]

function subscribeRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (rateHits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    return res.status(429).json({ error: "Too many requests. Please try again shortly." });
  }
  recent.push(now);
  rateHits.set(ip, recent);
  next();
}
