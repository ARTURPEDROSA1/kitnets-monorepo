import { useEffect, useState } from 'react';

export default function Config() {
    const [config, setConfig] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [restartNeeded, setRestartNeeded] = useState(false);

    const [initialSystemConfig, setInitialSystemConfig] = useState<any>(null);

    useEffect(() => {
        fetch('/api/config').then(r => r.json()).then(data => {
            setConfig(data);
            setInitialSystemConfig(JSON.parse(JSON.stringify(data.config))); // Deep copy for comparison
        });
    }, []);

    const save = async () => {
        setLoading(true);
        try {
            // Save Meters
            await fetch('/api/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            // Save System Settings
            await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    MODBUS_HOST: config.config.MODBUS.HOST,
                    POLL_INTERVAL_MS: config.config.MODBUS.POLL_INTERVAL_MS,
                    MQTT_BROKER_URL: config.config.MQTT.BROKER_URL
                })
            });

            // Check if vital system settings changed (requiring restart)
            const systemChanged =
                config.config.MODBUS.HOST !== initialSystemConfig.MODBUS.HOST ||
                config.config.MODBUS.POLL_INTERVAL_MS !== initialSystemConfig.MODBUS.POLL_INTERVAL_MS ||
                config.config.MQTT.BROKER_URL !== initialSystemConfig.MQTT.BROKER_URL;

            alert('Saved successfully!');

            if (systemChanged) {
                setRestartNeeded(true);
            } else {
                // Update "initial" so subsequent saves don't think it changed from original boot if we didn't restart
                setInitialSystemConfig(JSON.parse(JSON.stringify(config.config)));
            }

        } catch (e) {
            alert('Error saving configuration');
        }
        setLoading(false);
    };

    const restartService = async () => {
        try {
            await fetch('/api/restart', { method: 'POST' });
            alert('Service is restarting... Page will reload in 10 seconds.');
            setTimeout(() => window.location.reload(), 10000);
        } catch (e) {
            alert('Failed to trigger restart.');
        }
    };
    try {
        await fetch('/api/restart', { method: 'POST' });
        alert('Service is restarting... Page will reload in 10 seconds.');
        setTimeout(() => window.location.reload(), 10000);
    } catch (e) {
        alert('Failed to trigger restart.');
    }
};

const updateMeter = (index: number, field: string, value: any) => {
    const newMeters = [...config.meters];
    newMeters[index] = { ...newMeters[index], [field]: value };
    setConfig({ ...config, meters: newMeters });
};

const updateSystem = (section: string, field: string, value: any) => {
    setConfig({
        ...config,
        config: {
            ...config.config,
            [section]: {
                ...config.config[section],
                [field]: value
            }
        }
    });
};

const resetCounter = async (id: string) => {
    if (!confirm('Are you sure you want to reset this counter? This is mostly for hardware replacement.')) return;
    try {
        const res = await fetch(`/api/meters/${id}/reset`, { method: 'POST' });
        const json = await res.json();
        if (json.success) alert(json.message);
        else alert('Error: ' + json.error);
    } catch (e) { alert('Failed to reset'); }
};

if (!config) return <div>Loading...</div>;

const mqttBroker = config.config.MQTT.BROKER_URL;
const isCustomMqtt = mqttBroker !== 'mqtt://test.mosquitto.org' && mqttBroker !== 'mqtt://mqtt.eclipseprojects.io';

return (
    <div style={{ paddingBottom: '3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>Configuration</h2>
            <button className="primary" onClick={save} disabled={loading}>
                {loading ? 'Saving...' : 'Save & Apply'}
            </button>
        </div>

        {restartNeeded && (
            <div style={{
                position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
                background: 'var(--accent)', color: 'white', padding: '1rem 2rem', borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '1rem'
            }}>
                <strong>Settings changed! Restart required.</strong>
                <button style={{ background: 'white', color: 'var(--accent)', padding: '0.5rem 1rem', border: 'none', borderRadius: '4px', cursor: 'pointer' }} onClick={restartService}>
                    Restart Service
                </button>
            </div>
        )}

        <div className="card" style={{ marginBottom: '2rem' }}>
            <h3>System Settings</h3>
            <div className="grid">
                <div className="form-group">
                    <label>Modbus Host (PLC IP)</label>
                    <input
                        value={config.config.MODBUS.HOST}
                        onChange={(e) => updateSystem('MODBUS', 'HOST', e.target.value)}
                    />
                </div>
                <div className="form-group">
                    <label>Poll Interval (ms)</label>
                    <input
                        type="number"
                        value={config.config.MODBUS.POLL_INTERVAL_MS}
                        onChange={(e) => updateSystem('MODBUS', 'POLL_INTERVAL_MS', parseInt(e.target.value))}
                    />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>MQTT Broker URL</label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <select
                            value={isCustomMqtt ? 'custom' : mqttBroker}
                            onChange={(e) => {
                                if (e.target.value !== 'custom') updateSystem('MQTT', 'BROKER_URL', e.target.value);
                            }}
                            style={{ padding: '0.5rem', borderRadius: '4px', background: '#334155', color: 'white', border: '1px solid #475569' }}
                        >
                            <option value="mqtt://test.mosquitto.org">test.mosquitto.org (Public)</option>
                            <option value="mqtt://mqtt.eclipseprojects.io">mqtt.eclipseprojects.io (Public)</option>
                            <option value="custom">Custom...</option>
                        </select>
                        <input
                            style={{ flex: 1, minWidth: '200px' }}
                            value={config.config.MQTT.BROKER_URL}
                            onChange={(e) => updateSystem('MQTT', 'BROKER_URL', e.target.value)}
                            placeholder="mqtt://broker:1883"
                        />
                    </div>
                </div>
            </div>
        </div>

        <h3>Meters</h3>
        <div className="grid">
            {config.meters.map((m: any, i: number) => (
                <div className="card" key={m.meter_id}>
                    <div className="form-group">
                        <label>Meter ID</label>
                        <input value={m.meter_id} disabled />
                    </div>
                    <div className="form-group">
                        <label>Display Name</label>
                        <input
                            value={m.display_name}
                            onChange={e => updateMeter(i, 'display_name', e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label>Pulse Volume (L)</label>
                        <input
                            type="number"
                            value={m.pulse_volume_liters}
                            onChange={e => updateMeter(i, 'pulse_volume_liters', parseFloat(e.target.value))}
                        />
                    </div>
                    <div className="form-group">
                        <label>Registers (LSB / MSB)</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                type="number"
                                value={m.counter_lsb_register}
                                onChange={e => updateMeter(i, 'counter_lsb_register', parseInt(e.target.value))}
                            />
                            <input
                                type="number"
                                value={m.counter_msb_register}
                                onChange={e => updateMeter(i, 'counter_msb_register', parseInt(e.target.value))}
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Physical Offset (m³) <span style={{ color: 'var(--accent)', fontSize: '0.7em' }}>NEW (v1.2)</span></label>
                        <input
                            type="number"
                            step="0.001"
                            placeholder="0.000"
                            value={m.physical_meter_offset_m3 === undefined || m.physical_meter_offset_m3 === null ? '' : m.physical_meter_offset_m3}
                            onChange={e => {
                                const val = e.target.value;
                                // Store as string temporarily to allow deletion
                                updateMeter(i, 'physical_meter_offset_m3', val);
                            }}
                            onBlur={e => {
                                // Ensure it's a number on blur
                                let val = parseFloat(e.target.value);
                                if (isNaN(val)) val = 0;
                                updateMeter(i, 'physical_meter_offset_m3', val);
                            }}
                        />
                        <small className="text-muted" style={{ fontSize: '0.75rem' }}>Reading on physical meter.</small>
                    </div>
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <button className="danger" style={{ width: '100%' }} onClick={() => resetCounter(m.meter_id)}>
                            Reset Counter
                        </button>
                    </div>
                </div>
            ))}
        </div>
    </div>
);
}
