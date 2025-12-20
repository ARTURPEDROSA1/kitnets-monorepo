#!/bin/bash
set -e

# Kitnets Gateway Deployment Script
# v1.3 - Seamless Update Support

INSTALL_DIR="/opt/kitnets-gateway"

echo ">>> Kitnets Gateway Deployment (v1.3) <<<"

# 1. Environment Check
echo "[1/5] Checking Environment..."
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing system dependencies..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update
        sudo apt-get install -y nodejs npm build-essential sqlite3 python3 make
    else
        echo "Error: apt-get not found and Node is missing. Please install Node.js manually."
        exit 1
    fi
else
    echo "Node.js $(node -v) found. Skipping system package install."
fi

# 2. Prepare Target Directory
echo "[2/5] Syncing files to $INSTALL_DIR..."
if [ ! -d "$INSTALL_DIR" ]; then
    sudo mkdir -p $INSTALL_DIR
fi

# Use rsync if available for safe sync (preserves .env and data/, skips .git/node_modules)
if command -v rsync &> /dev/null; then
    sudo rsync -av --exclude='.env' --exclude='data' --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='client/node_modules' --exclude='client/dist' ./ $INSTALL_DIR/
else
    echo "rsync not found. Installing..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get install -y rsync
        sudo rsync -av --exclude='.env' --exclude='data' --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='client/node_modules' --exclude='client/dist' ./ $INSTALL_DIR/
    else
        echo "Warning: Using cp. This might overwrite data if not careful."
        # Backup data if exists
        if [ -d "$INSTALL_DIR/data" ]; then
             sudo cp -r $INSTALL_DIR/data $INSTALL_DIR/data_backup_$(date +%s)
        fi
        sudo cp -r ./* $INSTALL_DIR/
        # Restore is manual if needed, but cp overwrites.
        # Ideally we just insist on rsync.
    fi
fi

# Fix permissions
sudo chown -R $USER:$USER $INSTALL_DIR

# 3. Build Backend
echo "[3/5] Building Backend Service..."
cd $INSTALL_DIR
npm install --silent
npm run build

# 4. Build Frontend
echo "[4/5] Building Frontend..."
if [ -d "client" ]; then
    cd client
    npm install --silent
    npm run build
    cd ..
fi

# 5. Service Management
echo "[5/5] Restarting Service..."
SERVICE_FILE="kitnets-gateway.service"
if [ -f "$SERVICE_FILE" ]; then
    sudo cp $SERVICE_FILE /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable kitnets-gateway
    sudo systemctl restart kitnets-gateway
else
    echo "Warning: Service file not found."
fi

echo "========================================"
echo "Deployment Complete!"
echo "Service Status: $(systemctl is-active kitnets-gateway)"
echo "========================================"
