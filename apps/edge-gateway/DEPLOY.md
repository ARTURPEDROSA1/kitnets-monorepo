# Kitnets Smart Meter Gateway - Deployment Guide

This guide details how to deploy the Kitnets Smart Meter Gateway on **Ubuntu 24.04 LTS**.

## 1. Prerequisites

Ensure your Raspberry Pi / Server has internet access and is running Ubuntu 24.04.

### Install Node.js (v20 LTS recommended)
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install tools
sudo apt install -y curl build-essential

# Install Node.js via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v
npm -v
```

## 2. Prepare Application Directory

We will install the application to `/opt/kitnets-gateway`.

```bash
# Create directory
sudo mkdir -p /opt/kitnets-gateway

# Set permissions (replace 'ubuntu' with your actual username if different)
sudo chown -R ubuntu:ubuntu /opt/kitnets-gateway
```

## 3. Transfer Files

You need to transfer the built application to the target machine. You can use `scp`, `rsync`, or git.

**Files required:**
- `package.json`
- `dist/` (The built backend files)
- `client/dist/` (The built frontend files)
- `.env` (Create or copy your configuration)
- `kitnets-gateway.service` (The systemd file)

### Example transfer using SCP (run this from your dev machine):
```bash
# Assuming you are in apps/edge-gateway folder
scp package.json .env kitnets-gateway.service ubuntu@<RPI_IP>:/opt/kitnets-gateway/
scp -r dist ubuntu@<RPI_IP>:/opt/kitnets-gateway/
scp -r client/dist ubuntu@<RPI_IP>:/opt/kitnets-gateway/client/
```

*Note: You do not need to copy `node_modules` or `src`. We will install dependencies on the target.*

## 4. Install Dependencies

On the Raspberry Pi / Server:

```bash
cd /opt/kitnets-gateway

# Install production dependencies only
npm install --omit=dev

# Install sqlite3 specifically if binary compat issues arise
npm install sqlite3 --build-from-source
```

## 5. Configure Systemd Service

1. **Move service file**:
   ```bash
   sudo cp kitnets-gateway.service /etc/systemd/system/
   ```

2. **Edit service file (Optional)**:
   If your node path is different or you want to run as a different user, edit the file:
   ```bash
   sudo nano /etc/systemd/system/kitnets-gateway.service
   ```
   *Make sure `WorkingDirectory` and `ExecStart` paths are correct.*

3. **Reload Systemd and Enable**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable kitnets-gateway
   sudo systemctl start kitnets-gateway
   ```

## 6. Verify Installation

Check the status of the service:
```bash
sudo systemctl status kitnets-gateway
```

View logs:
```bash
# Follow logs in real-time
journalctl -u kitnets-gateway -f
```

### Access the Interface
Open a browser and navigate to:
`http://<RPI_IP>:3000`

## 7. Troubleshooting

- **Database permissions**: Ensure the user running the service acts write permission on the `data` directory (which will be created inside `/opt/kitnets-gateway`).
  ```bash
  mkdir -p /opt/kitnets-gateway/data
  sudo chown -R ubuntu:ubuntu /opt/kitnets-gateway/data
  ```

- **Port 502**: If connecting to a local Modbus slave on port 502, ensure no firewall blocks it.
- **Serial Port access**: If using Modbus RTU (Serial) instead of TCP, ensure user is in `dialout` group.
