# Kitnets Smart Gateway - User Manual (v1.3)

This document provides complete instructions for installing, configuring, updating, and monitoring the Kitnets Smart Gateway.

## 1. Installation

The gateway is designed to run on a Linux environment (e.g., Raspberry Pi, Debian/Ubuntu server) that has access to the Modbus PLC and the Internet.

### Prerequisites

- A Linux system (Debian 10+, Ubuntu 20.04+, or Raspberry Pi OS).
- Node.js v18+.
- Internet connection.
- Access to the PLC (Modbus TCP) on the local network.

### Installation Steps

1. **Clone the Repository** (if not already done):

    ```bash
    git clone https://github.com/ARTURPEDROSA1/kitnets-monorepo.git
    cd kitnets-monorepo/apps/edge-gateway
    ```

2. **Run the Installer**:
    The installation script handles dependencies, building the app, and setting up the systemd service.

    ```bash
    chmod +x install.sh
    sudo ./install.sh
    ```

3. **Verify Installation**:
    After the script finishes, the service should be running. Check its status:

    ```bash
    sudo systemctl status kitnets-gateway
    ```

    The web dashboard should be accessible at: `http://<YOUR-GATEWAY-IP>:3000`

---

## 2. Configuration

All configuration is managed via the **Web Dashboard** (`http://<IP>:3000`).

### System Settings

- **Modbus Host**: The IP address of your PLC (e.g., `192.168.1.50`).

- **Poll Interval**: How often to read Modbus registers (default: `1000ms`).

### Cloud Sync Settings (New)

The Gateway now uses a "Store-and-Forward" architecture. Data is stored locally and pushed to the cloud via an HTTP API. This ensures no data is lost during internet outages.

- **Ingestion API URL**: The endpoint where data is sent (e.g., `https://kitnets.com/api/gateways/ingest`).
- **Gateway Token**: A secure key provided by the system administrator to authenticate data uploads.
- **Sync Status**: The dashboard shows the timestamp of the last successful sync.

**Self-Healing / Auto-Reboot**:
If the gateway fails to sync with the cloud **10 consecutive times** (approx. 50 minutes of downtime), the system will automatically **REBOOT the Raspberry Pi/Server**. This is designed to force a fresh Wi-Fi/Network connection attempt without human intervention.

### Debug & Maintenance Tools

1. **Reset Today's Data (Fix Spikes)**:
    - Use this if you see impossibly high consumption values for the current day (e.g., millions of liters due to a glitch).
    - **Action**: Deletes today's history from the database and resets the internal "Start of Day" counters to the *current* meter reading.
    - **Result**: Today's consumption will reset to `0` and start counting fresh from this moment.

2. **Delete ALL Monthly History**:
    - **Warning**: This action is irreversible.
    - **Action**: Wipes **ALL** historical monthly records from the database.
    - **Result**: The "History (Monthly)" charts and tables will be empty until new months are generated.

3. **Restart Service manually**:
    - Forces the gateway service to reboot. The page will reload after 10 seconds.

---

## 3. Updating the Gateway

The Gateway supports "Safe Updates," meaning your configuration and database (history) are preserved during updates.

### Update Command

Run the following command on your gateway server:

```bash
cd ~/kitnets-monorepo
git pull
cd apps/edge-gateway
sudo ./install.sh
```

**What happens during an update?**

1. Latest code is downloaded.
2. The installer backs up your configuration.
3. The backend and frontend are rebuilt.
4. The database schema is automatically migrated (new columns added if needed).
5. The service is restarted.

---

## 4. Troubleshooting

**Check Logs:**

```bash
sudo journalctl -u kitnets-gateway -f
```

**Restart Service Manually:**

```bash
sudo systemctl restart kitnets-gateway
```

**Database Location:**
The SQLite database file is located at `/opt/kitnets-gateway/data/kitnets-gateway.db`.
