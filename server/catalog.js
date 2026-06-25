// Server-side price catalog. This is the single source of truth for what an
// item costs and whether it can be bought. The browser only ever sends an
// itemId — never a price or amount.
//
// Each entry: itemId -> { name, amountCents, status }
//   name        human-readable label (handy for receipts / metadata later)
//   amountCents integer USD cents charged for this item (Stripe wants integers)
//   status      "available" | "sold"  (only "available" items can be purchased)
//
// INVARIANT: an item without a valid amountCents can never be "available".
// This mirrors the frontend rule that "no price means no sale". It is enforced
// by normalization below, so no priced-less item can ever slip through to Stripe.
//
// SOLD STATE is persisted to server/data/sold.json and applied on top of the
// seed at startup, and updated by markSold() when a webhook confirms a sale — so
// a purchased original is permanently sold across restarts.
//
// PLACEHOLDER seed data — ids/amounts match the frontend PAINTINGS so the local
// checkout flow works end to end. Replace with the real originals before launch.
const fs = require("fs");
const path = require("path");

const rawCatalog = {
  "original-001": { name: "Arctic Puppies",    amountCents: 120000, status: "available" },
  "original-002": { name: "Collection No. 1",  amountCents: 130000, status: "available" },
  "original-003": { name: "Field Study",       amountCents: 150000, status: "available" },
  "original-004": { name: "Quiet Harbor",      amountCents: 145000, status: "available" },

  // Examples that must NOT be purchasable (exercise the 400 paths):
  "original-sold-demo":     { name: "Sold Example",     amountCents: 95000, status: "sold" },
  "original-unpriced-demo": { name: "Unpriced Example", status: "available" }, // no amountCents
};

// A valid amount is a positive integer number of cents.
function hasValidAmount(item) {
  return item && Number.isInteger(item.amountCents) && item.amountCents > 0;
}

// Normalize: force any "available" item that lacks a valid amount out of the
// available state, so the invariant holds at the data layer.
const catalog = {};
for (const [id, item] of Object.entries(rawCatalog)) {
  const normalized = { ...item };
  if (normalized.status === "available" && !hasValidAmount(normalized)) {
    console.warn(
      `catalog: "${id}" is marked 'available' but has no valid amountCents — forcing 'unavailable'.`
    );
    normalized.status = "unavailable";
  }
  catalog[id] = normalized;
}

// ── Persisted sold state ──────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "data");
const SOLD_FILE = path.join(DATA_DIR, "sold.json");

function readSold() {
  try {
    const v = JSON.parse(fs.readFileSync(SOLD_FILE, "utf8"));
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return []; // missing/empty/corrupt -> nothing sold yet
  }
}

// Apply persisted sales on top of the seed at startup.
for (const id of readSold()) {
  if (catalog[id]) catalog[id].status = "sold";
}

// Mark an item sold: update memory (stops new PaymentIntents immediately) and
// persist. Idempotent — safe to call for duplicate webhook deliveries.
function markSold(itemId) {
  if (!catalog[itemId]) return false;
  catalog[itemId].status = "sold";
  const list = readSold();
  if (!list.includes(itemId)) {
    list.push(itemId);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SOLD_FILE, JSON.stringify(list, null, 2));
  }
  return true;
}

// Raw lookup. Returns the catalog entry or undefined if the id is unknown.
function getItem(itemId) {
  if (typeof itemId !== "string") return undefined;
  return Object.prototype.hasOwnProperty.call(catalog, itemId)
    ? catalog[itemId]
    : undefined;
}

// Purchasable lookup. Returns the entry ONLY if it can actually be bought:
// known, available, and priced. Used to authorize and price an order.
function getPurchasable(itemId) {
  const item = getItem(itemId);
  if (!item || item.status !== "available" || !hasValidAmount(item)) return undefined;
  return item;
}

// Status map for the frontend: itemId -> 'available' | 'sold' | 'unavailable'.
function getStatuses() {
  const out = {};
  for (const [id, item] of Object.entries(catalog)) out[id] = item.status;
  return out;
}

module.exports = { catalog, getItem, getPurchasable, markSold, getStatuses };
