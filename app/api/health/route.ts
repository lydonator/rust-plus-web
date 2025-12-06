import { NextResponse } from 'next/server';

export async function GET() {
    const start = Date.now();
    const responseTime = Date.now() - start;

    // Lightweight health check - just verify the web app is responding
    // Database checks are expensive with RLS, so we skip them for health monitoring
    return NextResponse.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        components: {
            web_app: 'operational'
        },
        metrics: {
            response_time_ms: responseTime
        }
    }, { status: 200 });
}

export const dynamic = 'force-dynamic';
