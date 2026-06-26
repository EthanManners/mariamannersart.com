# Deploying the Maria Manners shop

The app is one Node service (`server/`) that talks to Stripe and serves the static
site in `public/`. In production nginx terminates TLS and serves the static files;
Node runs behind it on `127.0.0.1:8787` and handles `/api/*`.

Current VPS: Ubuntu 22.04, repo at `/var/www/mariamannersart`, nginx + Let's Encrypt
already configured for `mariamannersart.com`.

## First-time setup

1. **Node 20 LTS**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   node -v   # >= 18
   ```

2. **Dependencies** (production only; `node_modules` is gitignored)
   ```bash
   cd /var/www/mariamannersart/server
   npm ci --omit=dev
   ```

3. **Environment** — create `server/.env` from the example and fill in real values
   (Stripe **test** keys to start). Keep it locked down.
   ```bash
   cp .env.example .env
   # edit .env: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET,
   #            PORT=8787, HOST=127.0.0.1
   chmod 600 .env
   ```

4. **Writable data dir** (subscribers + sold state; service runs as `www-data`)
   ```bash
   mkdir -p /var/www/mariamannersart/server/data
   chown -R www-data:www-data /var/www/mariamannersart/server/data
   ```

5. **systemd service**
   ```bash
   sudo cp /var/www/mariamannersart/deploy/momweb.service /etc/systemd/system/momweb.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now momweb
   systemctl status momweb
   ```

6. **nginx `/api/` proxy** — add the block in `deploy/nginx-momweb.conf` inside the
   existing HTTPS `server {}` for the domain, then:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

7. **Stripe webhook (production)** — in the Stripe Dashboard add an endpoint
   `https://mariamannersart.com/api/webhook` for `payment_intent.succeeded`, copy
   its signing secret into `STRIPE_WEBHOOK_SECRET`, then `sudo systemctl restart momweb`.

## Updating after a change

```bash
cd /var/www/mariamannersart
git pull
cd server && npm ci --omit=dev      # only if dependencies changed
sudo systemctl restart momweb
```

## Notes
- **Portfolio images** under `public/portfolio/` are gitignored, so they are not
  pulled by git. Upload them separately (e.g. `rsync`/`scp`) if the portfolio
  gallery should display them. `public/shopPictures/placeholder.jpg` IS committed.
- With `HOST=127.0.0.1`, port 8787 is reachable only via nginx — not the public
  internet. (ufw is inactive on this box.)
- Logs: `journalctl -u momweb -f`.
