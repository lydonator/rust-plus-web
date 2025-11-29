import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
    const start = Date.now();

    // Check database connection
    const { error } = await supabase.from('servers').select('count', { count: 'exact', head: true });
    const dbStatus = error ? 'degraded' : 'operational';
    const responseTime = Date.now() - start;

    return NextResponse.json({
        status: dbStatus === 'operational' ? 'operational' : 'degraded',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        components: {
            database: dbStatus,
            web_app: 'operational'
        },
        metrics: {
            response_time_ms: responseTime
        }
    }, { status: dbStatus === 'operational' ? 200 : 503 });
}
