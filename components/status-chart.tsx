'use client';

import { useMemo } from 'react';

interface StatusChartProps {
    history: any[];
    serviceName: string;
}

export function StatusChart({ history, serviceName }: StatusChartProps) {
    // Ensure we have exactly 90 bars, filling gaps if necessary
    const bars = useMemo(() => {
        const today = new Date();
        const days = [];

        for (let i = 89; i >= 0; i--) {
            const d = new Date();
            d.setDate(today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];

            const entry = history.find(h => h.date === dateStr);
            const status = entry ? entry[serviceName] : 'no_data';

            days.push({ date: dateStr, status });
        }
        return days;
    }, [history, serviceName]);

    const getColor = (status: string) => {
        switch (status) {
            case 'operational': return 'bg-emerald-500';
            case 'degraded': return 'bg-yellow-500';
            case 'down': return 'bg-red-500';
            default: return 'bg-neutral-800';
        }
    };

    const getLabel = (status: string) => {
        switch (status) {
            case 'operational': return 'Operational';
            case 'degraded': return 'Degraded Performance';
            case 'down': return 'Major Outage';
            default: return 'No Data';
        }
    };

    return (
        <div className="flex gap-[2px] h-8 w-full items-end">
            {bars.map((day) => (
                <div
                    key={day.date}
                    className={`flex-1 rounded-sm transition-all duration-200 hover:opacity-80 relative group ${getColor(day.status)}`}
                    style={{ height: day.status === 'no_data' ? '50%' : '100%' }}
                >
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 whitespace-nowrap">
                        <div className="bg-neutral-900 border border-neutral-800 text-xs rounded px-2 py-1 shadow-xl">
                            <div className="font-medium text-white">{day.date}</div>
                            <div className="text-neutral-400">{getLabel(day.status)}</div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
