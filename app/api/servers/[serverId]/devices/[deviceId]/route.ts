import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ serverId: string; deviceId: string }> }
) {
    try {
        const { serverId, deviceId } = await params;
        const body = await request.json();
        const { name } = body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
        }

        // Update the device name
        // RLS policies will ensure the user owns this device via their server
        const { data: device, error } = await supabaseAdmin
            .from('smart_devices')
            .update({
                name: name.trim(),
                updated_at: new Date().toISOString()
            })
            .eq('id', deviceId)
            .eq('server_id', serverId)
            .select()
            .single();

        if (error) {
            console.error('Error updating device:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!device) {
            return NextResponse.json({ error: 'Device not found' }, { status: 404 });
        }

        return NextResponse.json(device);
    } catch (error) {
        console.error('Error updating device:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
