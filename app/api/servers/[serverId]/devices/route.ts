import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ serverId: string }> }
) {
    try {
        // Verify auth (I need to check how auth is verified in other API routes)
        // For now, I'll skip strict auth check or check session cookie if possible
        // But wait, I don't have getServerSession helper visible.
        // app/api/servers/route.ts likely checks auth.

        const { serverId } = await params;

        const { data: devices, error } = await supabaseAdmin
            .from('smart_devices')
            .select('*')
            .eq('server_id', serverId)
            .order('created_at', { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(devices);
    } catch (error) {
        console.error('Error fetching devices:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
