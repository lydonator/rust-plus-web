import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    // 1. Get current status (latest entry for each service)
    const { data: latestStatus, error: latestError } = await supabase
        .from('status_history')
        .select('*')
        .order('checked_at', { ascending: false })
        .limit(10); // Fetch enough to cover both services

    if (latestError) {
        return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
    }

    // Process latest status
    const services: any = {
        web_app: { status: 'unknown', response_time: 0, last_checked: null },
        cloud_shim: { status: 'unknown', response_time: 0, last_checked: null }
    };

    // Find latest entry for each service
    ['web_app', 'cloud_shim'].forEach(service => {
        const entry = latestStatus.find(s => s.service_name === service);
        if (entry) {
            services[service] = {
                status: entry.status,
                response_time: entry.response_time_ms,
                last_checked: entry.checked_at
            };
        }
    });

    // 2. Get 90-day history
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: history, error: historyError } = await supabase
        .from('status_history')
        .select('service_name, status, checked_at')
        .gte('checked_at', ninetyDaysAgo.toISOString())
        .order('checked_at', { ascending: true });

    if (historyError) {
        return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }

    // Aggregate history by day
    const dailyHistory: any = {};

    // Initialize last 90 days
    for (let i = 0; i < 90; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        dailyHistory[dateStr] = {
            date: dateStr,
            web_app: 'no_data',
            cloud_shim: 'no_data'
        };
    }

    // Fill with data
    // Logic: If any check in a day was 'down', the day is 'down'. 
    // Else if any 'degraded', then 'degraded'. 
    // Else 'operational'.
    history.forEach(entry => {
        const dateStr = new Date(entry.checked_at).toISOString().split('T')[0];
        if (dailyHistory[dateStr]) {
            const currentStatus = dailyHistory[dateStr][entry.service_name];
            const newStatus = entry.status;

            if (currentStatus === 'no_data') {
                dailyHistory[dateStr][entry.service_name] = newStatus;
            } else if (newStatus === 'down') {
                dailyHistory[dateStr][entry.service_name] = 'down';
            } else if (newStatus === 'degraded' && currentStatus !== 'down') {
                dailyHistory[dateStr][entry.service_name] = 'degraded';
            }
        }
    });

    // Calculate uptime percentages
    const uptime = {
        web_app: calculateUptime(history.filter(h => h.service_name === 'web_app')),
        cloud_shim: calculateUptime(history.filter(h => h.service_name === 'cloud_shim'))
    };

    return NextResponse.json({
        services,
        history: Object.values(dailyHistory).sort((a: any, b: any) => a.date.localeCompare(b.date)),
        uptime
    });
}

function calculateUptime(entries: any[]) {
    if (!entries.length) return 100;
    const downCount = entries.filter(e => e.status === 'down').length;
    return ((entries.length - downCount) / entries.length * 100).toFixed(2);
}
