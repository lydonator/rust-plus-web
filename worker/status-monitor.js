const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Configuration
const CHECK_INTERVAL_MS = 60000; // 1 minute
const WEB_APP_URL = process.env.WEB_APP_URL || 'http://localhost:3000';
const CLOUD_SHIM_URL = process.env.CLOUD_SHIM_URL || 'http://localhost:4001';

// Initialize Supabase client (needs service role key for writing)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkService(name, url) {
    const start = Date.now();
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        const responseTime = Date.now() - start;

        if (!response.ok) {
            return {
                status: 'degraded',
                responseTime,
                metadata: { error: `HTTP ${response.status}` }
            };
        }

        const data = await response.json();
        return {
            status: data.status === 'ok' || data.status === 'operational' ? 'operational' : 'degraded',
            responseTime,
            metadata: data
        };
    } catch (error) {
        return {
            status: 'down',
            responseTime: Date.now() - start,
            metadata: { error: error.message }
        };
    }
}

async function runHealthChecks() {
    console.log(`[${new Date().toISOString()}] Running health checks...`);

    const services = [
        { name: 'web_app', url: `${WEB_APP_URL}/api/health` },
        { name: 'cloud_shim', url: `${CLOUD_SHIM_URL}/heartbeat` }
    ];

    for (const service of services) {
        const result = await checkService(service.name, service.url);

        console.log(`[${service.name}] Status: ${result.status} (${result.responseTime}ms)`);

        // Record to database
        const { error } = await supabase
            .from('status_history')
            .insert({
                service_name: service.name,
                status: result.status,
                response_time_ms: result.responseTime,
                metadata: result.metadata
            });

        if (error) {
            console.error(`Failed to record status for ${service.name}:`, error.message);
        }
    }

    // Cleanup old data (keep 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { error: cleanupError } = await supabase
        .from('status_history')
        .delete()
        .lt('checked_at', ninetyDaysAgo.toISOString());

    if (cleanupError) {
        console.error('Failed to cleanup old status data:', cleanupError.message);
    }
}

// Start monitoring
console.log('Starting Status Monitor Service...');
console.log(`Web App: ${WEB_APP_URL}`);
console.log(`Cloud Shim: ${CLOUD_SHIM_URL}`);

runHealthChecks();
setInterval(runHealthChecks, CHECK_INTERVAL_MS);
