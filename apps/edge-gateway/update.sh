#!/bin/bash
set -e

# Kitnets Gateway Updater
# v1.2

INSTALL_DIR="/opt/kitnets-gateway"

echo "Updating Kitnets Gateway..."

if [ ! -d "$INSTALL_DIR" ]; then
    echo "Error: Directory $INSTALL_DIR not found. Is it installed?"
    exit 1
fi

cd $INSTALL_DIR

# 1. Pull latest code (Assumes git)
echo "[1/3] Pulling latest changes..."
# If it's a git repo
if [ -d ".git" ]; then
    git pull
else
    echo "Not a git repository. Skipping git pull. Please copy new files manually if not using git."
fi

# 2. Rebuild
echo "[2/3] Rebuilding..."
npm install
npm run build --if-present

if [ -d "client" ]; then
    cd client
    npm install
    npm run build
    cd ..
fi

# 3. Restart
echo "[3/3] Restarting Service..."
sudo systemctl restart kitnets-gateway

echo "========================================"
echo "Update Complete!"
echo "Version: $(node -p "require('./package.json').version")"
echo "========================================"
