import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#38bdf8', '#4ade80', '#facc15', '#f87171', '#a78bfa', '#fb923c', '#e879f9', '#2dd4bf'];

export default function History() {
    const [meters, setMeters] = useState<any[]>([]);
    const [data, setData] = useState<any[]>([]);
    const [view, setView] = useState<'daily' | 'monthly'>('daily');

    useEffect(() => {
        // Fetch config to know which bars to render
        fetch('/api/config').then(r => r.json()).then(d => {
            setMeters(d.meters);
        });
    }, []);

    useEffect(() => {
        fetch(`/api/history-consolidated/${view}`).then(r => r.json()).then(d => {
            // Data is already shaped: [{ date: '...', meter1: 10, meter2: 20 }, ...]
            setData(d);
        });
    }, [view]);

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Consumption History</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className={view === 'daily' ? 'primary' : ''} onClick={() => setView('daily')} style={{ padding: '0.5rem', background: view === 'daily' ? '#38bdf8' : 'transparent', border: '1px solid #333', color: view === 'daily' ? 'black' : 'white', cursor: 'pointer', borderRadius: '4px' }}>Daily</button>
                    <button className={view === 'monthly' ? 'primary' : ''} onClick={() => setView('monthly')} style={{ padding: '0.5rem', background: view === 'monthly' ? '#38bdf8' : 'transparent', border: '1px solid #333', color: view === 'monthly' ? 'black' : 'white', cursor: 'pointer', borderRadius: '4px' }}>Monthly</button>
                </div>
            </div>

            <div className="card" style={{ height: '500px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        key={view}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis
                            dataKey="date"
                            stroke="#94a3b8"
                        />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                            itemStyle={{ color: '#f8fafc' }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />

                        {meters.map((m, index) => (
                            <Bar
                                key={m.meter_id}
                                dataKey={m.meter_id}
                                name={m.display_name}
                                fill={COLORS[index % COLORS.length]}
                                radius={[4, 4, 0, 0]}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
                {data.length === 0 && (
                    <div style={{ textAlign: 'center', marginTop: '-250px', color: '#94a3b8' }}>No data history available yet.</div>
                )}
            </div>
        </div>
    );
}
