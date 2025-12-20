import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function History() {
    const [meters, setMeters] = useState<any[]>([]);
    const [selectedMeter, setSelectedMeter] = useState<string>('');
    const [dailyData, setDailyData] = useState<any[]>([]);
    const [monthlyData, setMonthlyData] = useState<any[]>([]);
    const [view, setView] = useState<'daily' | 'monthly'>('daily');

    useEffect(() => {
        fetch('/api/config').then(r => r.json()).then(d => {
            setMeters(d.meters);
            if (d.meters.length > 0) setSelectedMeter(d.meters[0].meter_id);
        });
    }, []);

    useEffect(() => {
        if (!selectedMeter) return;
        fetch(`/api/meters/${selectedMeter}/${view}`).then(r => r.json()).then(d => {
            // Transform data if needed
            // For monthly, we have year/month.
            const formatted = d.map((item: any) => ({
                ...item,
                date: view === 'daily' ? item.date : `${item.year}-${item.month}`
            }));

            if (view === 'daily') setDailyData(formatted);
            else setMonthlyData(formatted);
        });
    }, [selectedMeter, view]);

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <select
                    value={selectedMeter}
                    onChange={e => setSelectedMeter(e.target.value)}
                    style={{ maxWidth: '300px', background: 'rgba(0,0,0,0.2)', color: 'white', padding: '0.5rem', border: '1px solid #333' }}
                >
                    {meters.map(m => (
                        <option key={m.meter_id} value={m.meter_id}>{m.display_name}</option>
                    ))}
                </select>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className={view === 'daily' ? 'primary' : ''} onClick={() => setView('daily')} style={{ padding: '0.5rem', background: view === 'daily' ? '#38bdf8' : 'transparent', border: '1px solid #333', color: view === 'daily' ? 'black' : 'white' }}>Daily</button>
                    <button className={view === 'monthly' ? 'primary' : ''} onClick={() => setView('monthly')} style={{ padding: '0.5rem', background: view === 'monthly' ? '#38bdf8' : 'transparent', border: '1px solid #333', color: view === 'monthly' ? 'black' : 'white' }}>Monthly</button>
                </div>
            </div>

            <div className="card" style={{ height: '400px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={view === 'daily' ? dailyData : monthlyData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        key={view} // force redraw on view change
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis
                            dataKey="date"
                            stroke="#94a3b8"
                        />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
                            itemStyle={{ color: '#f8fafc' }}
                        />
                        <Legend />
                        <Bar
                            dataKey={view === 'daily' ? 'daily_liters' : 'monthly_m3'}
                            name={view === 'daily' ? 'Liters' : 'm³'}
                            fill="#38bdf8"
                            radius={[4, 4, 0, 0]}
                        />
                    </BarChart>
                </ResponsiveContainer>
                {((view === 'daily' && dailyData.length === 0) || (view === 'monthly' && monthlyData.length === 0)) && (
                    <div style={{ textAlign: 'center', marginTop: '-200px', color: '#94a3b8' }}>No data history available yet.</div>
                )}
            </div>
        </div>
    );
}
