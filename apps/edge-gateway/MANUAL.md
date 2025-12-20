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

* **Modbus Host**: The IP address of your PLC (e.g., `192.168.1.50`).
- **Poll Interval**: How often to read Modbus registers (default: `1000ms`).
- **MQTT Broker URL**:
  - **Default**: `mqtt://test.mosquitto.org` (Public test broker).
  - **Custom**: You can enter your own broker URL (e.g., `mqtt://192.168.1.10:1883` or a cloud URL).
  - ***Note**: Changing System Settings requires a restart (prompted automatically).*

### Meter Configuration

You can add or modify Pulse Meters connected to the PLC.
- **Meter ID**: Unique identifier (e.g., `HIDROMETRO35`).
- **Display Name**: Friendly name shown on reports.
- **Pulse Volume**: Liters per pulse (usually `10`).
- **Registers**: Mosbus register addresses for LSB and MSB.
- **Physical Offset (m³)**: (New in v1.2) - Enter the initial reading from the physical meter so the digital display matches the real world.
  - ***Note**: Changing Meter settings is applied **INSTANTLY** and does NOT require a service restart.*

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

## 4. Accessing MQTT Data

The Gateway publishes live consumption data to an MQTT broker. You can subscribe to these topics to integrate with Home Assistant, external dashboards, or for debugging.

### Connection Details

* **Broker**: `test.mosquitto.org` (or your verified custom broker).
- **Port**: `1883` (TCP).
- **Base Topic**: `kitnets/property_1`
- **QoS**: 1 (At least once).

### Data Topics

#### 1. Live Updates (Every 2 Minutes)

Shows the current snapshot of meter readings.

- **Topic**: `kitnets/property_1/meters/<METER_ID>/live`
- **Example Payload**:

    ```json
    {
      "meter": "HIDROMETRO35",
      "timestamp": "2025-12-20T16:20:00.000Z",
      "pulse_count": 12345,
      "raw_gateway_m3": 123.45,
      "offset_m3": 1000.0,
      "effective_m3": 1123.45,  // (raw + offset) -> The value on the physical display
      "daily_liters_so_far": 50
    }
    ```

#### 2. Daily Report (At 23:59)

Finalized consumption for the day.

- **Topic**: `kitnets/property_1/meters/<METER_ID>/daily`
- **Example Payload**:

    ```json
    {
      "date": "2025-12-20",
      "liters": 500,
      "counter": 12345
    }
    ```

#### 3. Monthly Report (1st of Month)

Finalized consumption for the previous month.

- **Topic**: `kitnets/property_1/meters/<METER_ID>/monthly`

### How to View Data (MQTT Explorer)

1. Download **[MQTT Explorer](http://mqtt-explorer.com/)**.
2. Connect to Host: `test.mosquitto.org`, Port: `1883`.
3. In the "Advance" (Subscription) section, add topic: `kitnets/#`
4. Expand the tree: `kitnets` -> `property_1` -> `meters`.
5. You will see data appearing live (wait up to 2 minutes for the first "live" packet).

---

## 5. Troubleshooting

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
