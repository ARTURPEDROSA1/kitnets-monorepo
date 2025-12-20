import { useEffect, useState } from 'react';

interface MeterData {
    meter_id: string;
    display_name: string;
    current_counter: number;
    pulse_volume_liters: number;
    physical_meter_offset_m3: number;
    status: string;
}

export default function Dashboard() {
    const [data, setData] = useState<any>(null);

    const fetchData = async () => {
        try {
            const res = await fetch('/api/dashboard');
            const json = await res.json();
            setData(json);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 2000);
        return () => clearInterval(interval);
    }, []);

    if (!data) return <div className="card">Loading...</div>;

    const { gateway_status, digital_input, meters, last_update, uptime } = data;

    return (
        <div className="dashboard">
            <div className="grid" style={{ marginBottom: '2rem' }}>
                <div className="card">
                    <h3>Gateway Health</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <span className={`status-badge status-${gateway_status === 'HEALTHY' ? 'ok' : 'down'}`}>
                                PLC: {gateway_status}
                            </span>
                            <span className={`status-badge status-${(data as any).db_status === 'OK' ? 'ok' : 'down'}`}>
                                DB: {(data as any).db_status || 'Checking...'}
                            </span>
                        </div>
                        <div>
                            <small className="text-muted" style={{ display: 'block' }}>
                                Last Update: {new Date(last_update).toLocaleTimeString()}
                            </small>
                            <small className="text-muted" style={{ display: 'block' }}>
                                Started: {uptime ? new Date(Date.now() - (uptime * 1000)).toLocaleString() : 'Loading...'}
                            </small>
                        </div>
                    </div>
                </div>
                <div className="card">
                    <h3>Digital Input</h3>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', marginTop: '0.5rem', fontFamily: 'monospace' }}>
                        {(digital_input || 0).toString(2).padStart(16, '0').match(/.{1,4}/g)?.join(' ')}
                    </div>
                    <small className="text-muted">Register 30016</small>
                </div>
                {data.aggregates && (
                    <div className="card" style={{ gridColumn: '1 / -1' }}>
                        <h3>Aggregated Consumption</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                            {/* 1st Line: Total */}
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                                <div className="text-muted" style={{ fontSize: '1rem' }}>Current Total</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--accent)' }}>{data.aggregates.total_effective_m3.toFixed(3)} m³</div>
                            </div>

                            {/* 2nd Line: Today */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
                                    <div className="text-muted" style={{ fontSize: '0.9rem' }}>Today (Liters)</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{Math.round(data.aggregates.today_liters).toLocaleString()} L</div>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
                                    <div className="text-muted" style={{ fontSize: '0.9rem' }}>Today (m³)</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{data.aggregates.today_m3.toFixed(3)} m³</div>
                                </div>
                            </div>

                            {/* 3rd Line: Monthly */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
                                    <div className="text-muted" style={{ fontSize: '0.9rem' }}>This Month</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{data.aggregates.month_m3.toFixed(3)} m³</div>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
                                    <div className="text-muted" style={{ fontSize: '0.9rem' }}>Last Month</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{data.aggregates.prev_month_m3.toFixed(3)} m³</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <h2>Live Meters</h2>
            <div className="grid">
                {meters.map((m: MeterData) => (
                    <div className="card" key={m.meter_id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <small>{m.meter_id}</small>
                            <span className={`status-badge status-${m.status === 'OK' ? 'ok' : 'waiting'}`}>{m.status}</span>
                        </div>
                        <h3 style={{ margin: '0.5rem 0' }}>{m.display_name}</h3>
                        <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                            {m.current_counter.toLocaleString()} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>pulses</span>
                        </div>
                        <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#38bdf8' }}>
                            ~ {(m.current_counter * m.pulse_volume_liters / 1000).toFixed(3)} m³
                        </div>
                        <div style={{ marginTop: '0.25rem', fontSize: '1.2rem', color: 'var(--accent)', fontWeight: 'bold' }}>
                            {((m.physical_meter_offset_m3 || 0) + (m.current_counter * m.pulse_volume_liters / 1000)).toFixed(3)} m³ <span style={{ fontSize: '0.7rem', color: 'white' }}>EFFECTIVE</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
