import { useEffect, useState } from 'react';

export default function DataTable() {
    const [data, setData] = useState<any[]>([]);
    const [meters, setMeters] = useState<any[]>([]);

    useEffect(() => {
        const load = () => {
            // Fetch Config, History, and Dashboard in parallel
            Promise.all([
                fetch('/api/config').then(r => r.json()),
                fetch('/api/history-consolidated/daily').then(r => r.json()),
                fetch('/api/dashboard').then(r => r.json())
            ]).then(([configData, historyData, dashboardData]) => {
                const currentMeters = configData.meters;
                setMeters(currentMeters);

                // Generate last 30 days
                const last30: any[] = [];
                const today = new Date(); // Local

                for (let i = 0; i < 30; i++) {
                    const dObj = new Date(today);
                    dObj.setDate(today.getDate() - i);

                    const year = dObj.getFullYear();
                    const month = String(dObj.getMonth() + 1).padStart(2, '0');
                    const day = String(dObj.getDate()).padStart(2, '0');
                    const dateStr = `${year}-${month}-${day}`;

                    let row = historyData.find((r: any) => r.date === dateStr);

                    // If today, try to use live data if history is missing or empty
                    if (i === 0 && dashboardData && dashboardData.meters) {
                        const liveRow: any = { date: dateStr };
                        let hasLive = false;
                        currentMeters.forEach((m: any) => {
                            if (dashboardData.meters[m.meter_id]) {
                                liveRow[m.meter_id] = dashboardData.meters[m.meter_id].daily_liters;
                                hasLive = true;
                            }
                        });
                        // Prefer live data for today
                        if (hasLive) {
                            row = { ...row, ...liveRow };
                        }
                    }

                    last30.push(row || { date: dateStr });
                }
                setData(last30);
            });
        };

        load();
        const interval = setInterval(load, 300000); // 5 minutes
        return () => clearInterval(interval);
    }, []);

    if (data.length === 0 || meters.length === 0) return <div className="card">Loading data...</div>;

    return (
        <div className="card" style={{ overflowX: 'auto' }}>
            <h3>Last 30 Days Data (Liters)</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #333' }}>Date</th>
                        {meters.map(m => (
                            <th key={m.meter_id} style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #333' }}>
                                {m.display_name}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, i) => (
                        <tr key={row.date} style={{ background: i % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'transparent' }}>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid #333' }}>
                                {row.date.split('-').reverse().join('/')}
                            </td>
                            {meters.map(m => {
                                const val = row[m.meter_id];
                                return (
                                    <td key={m.meter_id} style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '1px solid #333', color: val > 0 ? 'white' : '#64748b' }}>
                                        {val !== undefined ? Math.round(val).toLocaleString('pt-BR') : '-'} L
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
