import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/servers/[serverId]/groups/[groupId]/devices - Get devices in a group
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ serverId: string; groupId: string }> }
) {
    try {
        const { serverId, groupId } = await params;

        // Verify group belongs to this server
        const { data: group, error: verifyError } = await supabaseAdmin
            .from('device_groups')
            .select('id')
            .eq('id', groupId)
            .eq('server_id', serverId)
            .single();

        if (verifyError || !group) {
            return NextResponse.json(
                { error: 'Group not found' },
                { status: 404 }
            );
        }

        // Fetch devices in this group
        const { data: memberships, error } = await supabaseAdmin
            .from('device_group_members')
            .select(`
                device_id,
                smart_devices (*)
            `)
            .eq('group_id', groupId);

        if (error) {
            console.error('[API] Error fetching group devices:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Extract just the device data
        const devices = memberships?.map(m => m.smart_devices) || [];
        return NextResponse.json(devices);
    } catch (error: any) {
        console.error('[API] Error in GET /groups/[groupId]/devices:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/servers/[serverId]/groups/[groupId]/devices - Add devices to group
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ serverId: string; groupId: string }> }
) {
    try {
        const { serverId, groupId } = await params;
        const body = await request.json();

        const { deviceIds } = body;

        if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
            return NextResponse.json(
                { error: 'deviceIds must be a non-empty array' },
                { status: 400 }
            );
        }

        // Verify group belongs to this server
        const { data: group, error: verifyError } = await supabaseAdmin
            .from('device_groups')
            .select('id')
            .eq('id', groupId)
            .eq('server_id', serverId)
            .single();

        if (verifyError || !group) {
            return NextResponse.json(
                { error: 'Group not found' },
                { status: 404 }
            );
        }

        // Verify all devices belong to this server
        const { data: devices, error: devicesError } = await supabaseAdmin
            .from('smart_devices')
            .select('id')
            .eq('server_id', serverId)
            .in('id', deviceIds);

        if (devicesError) {
            console.error('[API] Error verifying devices:', devicesError);
            return NextResponse.json({ error: devicesError.message }, { status: 500 });
        }

        if (!devices || devices.length !== deviceIds.length) {
            return NextResponse.json(
                { error: 'One or more devices not found or do not belong to this server' },
                { status: 400 }
            );
        }

        // Create memberships (using upsert to handle duplicates gracefully)
        const memberships = deviceIds.map(deviceId => ({
            group_id: groupId,
            device_id: deviceId
        }));

        const { data: created, error } = await supabaseAdmin
            .from('device_group_members')
            .upsert(memberships, { onConflict: 'group_id,device_id' })
            .select();

        if (error) {
            console.error('[API] Error adding devices to group:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ added: created?.length || 0 });
    } catch (error: any) {
        console.error('[API] Error in POST /groups/[groupId]/devices:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
