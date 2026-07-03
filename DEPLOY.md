# Deployment on MiniPC

To ensure "My Story" runs continuously on your MiniPC (surviving power outages), follow these simple bash copy-paste instructions.

### 1. Initial Setup
Make sure Node.js is installed on your MiniPC. Navigate to your project folder:
```bash
cd /path/to/my-story
npm install
npm run build
```

### 2. Create the Systemd Caretaker Service
We will create a service that automatically starts the app on port 3000 (standard for the web interface).

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
`http://<YOUR_MINIPC_TAILSCALE_IP>:3000`

### 5. API Keys
Once the app is open, navigate to the **Settings** tab. Input your Google, NVIDIA, and Mistral keys there. They will be saved securely to `config.json` inside this directory.
