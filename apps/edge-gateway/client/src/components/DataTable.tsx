import { useEffect, useState } from 'react';

export default function DataTable() {
    const [data, setData] = useState<any[]>([]);
    const [meters, setMeters] = useState<any[]>([]);

    useEffect(() => {
        // Fetch config to get meter names/IDs
        fetch('/api/config').then(r => r.json()).then(d => {
            setMeters(d.meters);
        });

        // Fetch history
        fetch('/api/history-consolidated/daily').then(r => r.json()).then(d => {
            // Sort by date descending and take top 30
            const sorted = d.sort((a: any, b: any) => b.date.localeCompare(a.date)).slice(0, 30);
            setData(sorted);
        });
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
                                {new Date(row.date).toLocaleDateString('pt-BR')}
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
