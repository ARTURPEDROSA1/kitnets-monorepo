import { useEffect, useState } from 'react';

export default function Config() {
    const [config, setConfig] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch('/api/config').then(r => r.json()).then(setConfig);
    }, []);

    const save = async () => {
        setLoading(true);
        try {
            await fetch('/api/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            alert('Saved!');
        } catch (e) {
            alert('Error saving');
        }
        setLoading(false);
    };

    const updateMeter = (index: number, field: string, value: any) => {
        const newMeters = [...config.meters];
        newMeters[index] = { ...newMeters[index], [field]: value };
        setConfig({ ...config, meters: newMeters });
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

    return (
        <div style={{ paddingBottom: '3rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2>Meter Configuration</h2>
                <button className="primary" onClick={save} disabled={loading}>
                    {loading ? 'Saving...' : 'Save Changes'}
                </button>
            </div>

            <div className="card" style={{ marginBottom: '2rem' }}>
                <h3>System Settings</h3>
                <div className="grid">
                    <div className="form-group">
                        <label>Modbus Host</label>
                        <input value={config.config.MODBUS?.HOST} disabled />
                    </div>
                    <div className="form-group">
                        <label>Poll Interval (ms)</label>
                        <input value={config.config.MODBUS?.POLL_INTERVAL_MS} disabled />
                    </div>
                </div>
                <small className="text-muted">System settings are read-only in this demo. Edit .env file to change.</small>
            </div>

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
                                value={m.physical_meter_offset_m3 || 0}
                                onChange={e => updateMeter(i, 'physical_meter_offset_m3', parseFloat(e.target.value))}
                            />
                            <small className="text-muted" style={{ fontSize: '0.75rem' }}>Reading on physical meter when gateway was installed.</small>
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
