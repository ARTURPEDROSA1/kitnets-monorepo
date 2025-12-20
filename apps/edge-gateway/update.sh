#!/bin/bash
set -e

# Resolve Repository Root (Assuming script is in apps/edge-gateway)
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
REPO_ROOT=$(realpath "$SCRIPT_DIR/../..")

echo ">>> Kitnets Gateway Updater <<<"

# 1. Reset critical scripts to avoid merge conflicts
echo "[1/3] Resetting scripts to avoid conflicts..."
cd "$REPO_ROOT"
git checkout apps/edge-gateway/install.sh
git checkout apps/edge-gateway/update.sh 2>/dev/null || true

# 2. Pull latest code
echo "[2/3] Pulling latest source code..."
git pull

# 3. Execute Installer
echo "[3/3] Launching installer..."
cd apps/edge-gateway
chmod +x install.sh
sudo ./install.sh
