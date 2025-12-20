import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
    MODBUS: {
        HOST: process.env.MODBUS_HOST || '192.168.1.123',
        PORT: parseInt(process.env.MODBUS_PORT || '502'),
        UNIT_ID: parseInt(process.env.MODBUS_UNIT_ID || '1'),
        TIMEOUT: parseInt(process.env.MODBUS_TIMEOUT || '2000'),
        POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS || '1000'),
    },
    MQTT: {
        BROKER_URL: process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1883', // Default local, change to cloud if needed
        TOPIC_PREFIX: process.env.MQTT_TOPIC_PREFIX || 'kitnets/property_123'
    },
    SERVER: {
        PORT: parseInt(process.env.PORT || '3000'),
        HOST: '0.0.0.0'
    }
};
