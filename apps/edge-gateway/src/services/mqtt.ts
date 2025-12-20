import mqtt from 'mqtt';
import { CONFIG } from '../config';
import { GatewayStatusPayload, GatewayHealth } from '../types';

export class MqttService {
    private client: mqtt.MqttClient;

    constructor() {
        this.client = mqtt.connect(CONFIG.MQTT.BROKER_URL, {
            reconnectPeriod: 5000,
        });

        this.client.on('connect', () => {
            console.log(`Connected to MQTT Broker at ${CONFIG.MQTT.BROKER_URL}`);
            this.publishEvent({
                event: 'gateway_status',
                status: 'HEALTHY', // Should get actual status
                gateway_ip: CONFIG.MODBUS.HOST, // Or local IP
                timestamp: new Date().toISOString()
            });
        });

        this.client.on('error', (err) => {
            console.error("MQTT Error:", err);
        });
    }

    public publishEvent(payload: GatewayStatusPayload) {
        const topic = `${CONFIG.MQTT.TOPIC_PREFIX}/gateway/events`;
        this.client.publish(topic, JSON.stringify(payload), { qos: 1 });
    }

    public publishDaily(meterId: string, data: any) {
        const topic = `${CONFIG.MQTT.TOPIC_PREFIX}/meters/${meterId}/daily`;
        this.client.publish(topic, JSON.stringify(data), { qos: 1 });
    }

    public publishMonthly(meterId: string, data: any) {
        const topic = `${CONFIG.MQTT.TOPIC_PREFIX}/meters/${meterId}/monthly`;
        this.client.publish(topic, JSON.stringify(data), { qos: 1 });
    }

    public publishLive(meterId: string, data: any) {
        const topic = `${CONFIG.MQTT.TOPIC_PREFIX}/meters/${meterId}/live`;
        this.client.publish(topic, JSON.stringify(data), { qos: 1 });
    }
}

export const mqttService = new MqttService();
