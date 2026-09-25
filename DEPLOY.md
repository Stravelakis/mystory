# Deployment

## How it runs today (mini PC, tailnet only)

This is the live install, set up 25 Sep 2026. Everything below it in this file
is the general guide.

| | |
|---|---|
| Address | `https://<machine>.<tailnet>.ts.net:38726` — tailnet only |
| Code | `~/apps/mystory` (a git checkout) |
| Settings and keys | `~/.config/mystory/.env`, mode 600 |
| Your writing | `~/.local/share/mystory/vault` |
| Service | `systemctl --user status mystory` (starts on boot via linger) |
| Logs | `journalctl --user -u mystory -f` |

The settings and the vault live **outside** the code folder on purpose: a
`git pull` or a rebuild can replace every file in `~/apps/mystory` and cannot
reach a single entry.

### Update it

```bash
cd ~/apps/mystory && git pull --ff-only
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci && npm run build
systemctl --user restart mystory
```

`ELECTRON_SKIP_BINARY_DOWNLOAD` skips a ~100 MB download the server never uses.

### Why it is safe to reach

- The app binds **127.0.0.1** only. Nothing on the LAN can reach port 38726.
- The single way in is `tailscale serve --https=38726`, which is **tailnet
  only**. Check any time with `tailscale serve status` — the line must say
  `(tailnet only)`.

> **⚠️ Never serve this on port 443 of a machine with Funnel on.** Funnel
> publishes a port to the whole internet. If a machine already has Funnel on
> 443 (for n8n, say), anything added to 443 is public too. Use a separate
> HTTPS port, as above.

### Set a passcode

Tailnet-only is not the same as private: every device on your tailnet can
reach it, including a phone that gets lost. Settings → The lock.

---


To ensure "My Story" runs continuously on your MiniPC (surviving power outages), follow these simple bash copy-paste instructions.

### 1. Initial Setup
Make sure Node.js is installed on your MiniPC. Navigate to your project folder:
```bash
cd /path/to/my-story
npm install
npm run build
```

### 2. Create the Systemd Caretaker Service
We will create a service that automatically starts the app on port 38726.

Copy and paste this exact block into your terminal:

```bash
sudo bash -c 'cat << EOF > /etc/systemd/system/mystory.service
[Unit]
Description=My Story - Silent Vault Journaling App
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
# We use the built production server file
ExecStart=$(which node) dist/server.cjs
Environment="NODE_ENV=production"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF'
```

### 3. Activate the Service
Run these two commands to tell your MiniPC to turn it on permanently:

```bash
sudo systemctl daemon-reload
sudo systemctl enable mystory.service
sudo systemctl start mystory.service
```

### 4. Access via Tailscale
Open your browser on your phone or laptop connected to your Tailscale network and navigate to:
`http://<YOUR_MINIPC_TAILSCALE_IP>:38726`

**Set a passcode, and bind to the tailnet.** Do both.

Open **Settings → The lock** and set a passcode the first time you load the app;
until you do, anyone who can reach the port can read every entry, and the boot
log will keep saying so.

By default the server also listens on every interface, so on a MiniPC that is
also on your home Wi-Fi the vault answers to anything on the LAN. Add the
Tailscale address to the service so it publishes there and nowhere else:

```
Environment="HOST=<YOUR_MINIPC_TAILSCALE_IP>"
```

Put that line beside the other `Environment=` line in the unit file above, then
`sudo systemctl daemon-reload && sudo systemctl restart mystory`.

### 5. Back up the vault
Your entries live in `vault/` inside the project folder — plain markdown plus
the original recordings. That folder is the only irreplaceable thing on this
machine. A nightly copy to another disk is enough:

```bash
(crontab -l 2>/dev/null; echo "30 3 * * * cp -a $(pwd)/vault /path/to/backup/mystory-$(date +\%F)") | crontab -
```

Set `Environment="VAULT_DIR=/path/to/somewhere"` in the service file to keep the
vault outside the project folder.

### 6. Your phone

Recording needs the microphone, and no browser will grant it on a plain
`http://` address that is not localhost. Over Tailscale you get a real
certificate for free, which is the whole fix:

```bash
sudo tailscale cert "$(tailscale status --json | sed -n 's/.*"DNSName":"\([^"]*\)\..*/\1/p' | head -1).$(tailscale status --json | sed -n 's/.*"MagicDNSSuffix":"\([^"]*\)".*/\1/p')"
```

If that is fiddly, `tailscale status` prints the machine's full name and you
can pass it to `tailscale cert` by hand. Then publish the app on it:

```bash
sudo tailscale serve --bg 38726
```

`tailscale serve` puts the app behind your tailnet's HTTPS hostname —
something like `https://my-server.tailnet-name.ts.net`. Open that on the phone
and the microphone works.

Then **Share → Add to Home Screen**. It gets its own icon, opens full screen
with no address bar, and behaves like an app.

Nothing is published to the internet by any of this: the hostname resolves only
for devices signed into your tailnet. This is also the redirect origin to
register with Google if you want Drive archiving from the phone — Google
accepts an https hostname, and will not accept a bare Tailscale IP.

While you are here, bind the app to the tailnet as well, so it is not also
answering on your home Wi-Fi. Add this beside the other `Environment=` line in
the unit file, using the address `tailscale ip -4` prints:

```
Environment="HOST=100.x.y.z"
```

### 7. API Keys
Once the app is open, navigate to the **Settings** tab. Input your Gemini, Groq,
Mistral, NVIDIA, and Cerebras keys there. They are written to the `.env` file
inside this directory, owner-readable only, and are never sent anywhere except
to the provider they belong to.
