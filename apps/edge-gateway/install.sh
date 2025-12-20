#!/bin/bash
set -e

# Kitnets Gateway Installer (Ubuntu/Pi)
# v1.2

echo "Installing Kitnets Smart Gateway..."

# 1. Prerequisites
echo "[1/4] Installing system dependencies..."
if command -v apt-get &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y nodejs npm build-essential sqlite3 python3 make
else
    echo "Warning: apt-get not found. Ensure Node.js and build tools are installed."
fi

# 2. Setup Directory
INSTALL_DIR="/opt/kitnets-gateway"
echo "[2/4] Setting up directory at $INSTALL_DIR..."

if [ "$PWD" != "$INSTALL_DIR" ]; then
    sudo mkdir -p $INSTALL_DIR
    # Assuming we are running from the source folder, copy everything
    # In a real curl|bash scenario, we would git clone here.
    # For now, we assume user copied files or we cp from current.
    sudo cp -r ./* $INSTALL_DIR/
fi

# Fix permissions
sudo chown -R $USER:$USER $INSTALL_DIR

# 3. Build Application
echo "[3/4] Installing Node packages and Building..."
cd $INSTALL_DIR
npm install
npm run build --if-present

# Build Frontend if present
if [ -d "client" ]; then
    echo "Building frontend..."
    cd client
    npm install
    npm run build
    cd ..
fi

# 4. Configure Service
echo "[4/4] Configuring Systemd Service..."
SERVICE_FILE="kitnets-gateway.service"
if [ -f "$SERVICE_FILE" ]; then
    sudo cp $SERVICE_FILE /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable kitnets-gateway
    sudo systemctl restart kitnets-gateway
    echo "Service started!"
else
    echo "Error: Service file not found."
    exit 1
fi

echo "========================================"
echo "Installation Complete! (v1.2)"
echo "Effective User: $USER"
echo "Service Status: $(systemctl is-active kitnets-gateway)"
echo "Web Interface: http://$(hostname -I | awk '{print $1}'):3000"
echo "========================================"
