import { CalendarEntry, parseCalendarDate, getToday } from '@/lib/release-calendars';

interface ReleaseCalendarTableProps {
    /** Title shown above the table, e.g. "Calendário de divulgação IPCA 2026" */
    title: string;
    /** Ordered list of release dates to display */
    items: CalendarEntry[];
    /**
     * Fixed "Pesquisa" column text applied to every row.
     * If omitted, falls back to `item.label` per row.
     */
    pesquisa?: string;
}

export function ReleaseCalendarTable({ title, items, pesquisa }: ReleaseCalendarTableProps) {
    const today = getToday();
    const nextIdx = items.findIndex(item => parseCalendarDate(item.date) >= today);

    return (
        <div id="calendario" className="md:col-span-3 min-w-0 scroll-mt-20">
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                <div className="flex flex-col space-y-1.5 p-3 md:p-6">
                    <h3 className="text-lg md:text-2xl font-semibold leading-none tracking-tight">{title}</h3>
                </div>
                <div className="p-3 md:p-6 pt-0 overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="text-muted-foreground bg-muted/50 text-xs uppercase">
                            <tr className="border-b">
                                <th className="p-4 font-medium min-w-[120px]">Prev. divulgação</th>
                                <th className="p-4 font-medium min-w-[200px]">Pesquisa</th>
                                <th className="p-4 font-medium min-w-[150px]">Referência</th>
                                <th className="p-4 font-medium">Horário</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {items.map((item, i) => {
                                const isNext = i === nextIdx;
                                const isPast = nextIdx === -1 ? true : i < nextIdx;

                                return (
                                    <tr
                                        key={i}
                                        className={
                                            isNext
                                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-l-emerald-500 font-semibold'
                                                : isPast
                                                    ? 'opacity-50 hover:opacity-75 transition-opacity'
                                                    : 'hover:bg-muted/50 transition-colors'
                                        }
                                    >
                                        <td className={`p-4 ${isNext ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'font-medium'}`}>
                                            {item.date}
                                            {isNext && <span className="ml-2 text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full">Próxima</span>}
                                        </td>
                                        <td className={`p-4 ${isNext ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                                            {pesquisa ?? item.label ?? ''}
                                        </td>
                                        <td className={`p-4 ${isNext ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>{item.ref}</td>
                                        <td className={`p-4 ${isNext ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>{item.time}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
