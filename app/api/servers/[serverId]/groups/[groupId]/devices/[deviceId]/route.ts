import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// DELETE /api/servers/[serverId]/groups/[groupId]/devices/[deviceId] - Remove device from group
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ serverId: string; groupId: string; deviceId: string }> }
) {
    try {
        const { serverId, groupId, deviceId } = await params;

        // Verify group belongs to this server
        const { data: group, error: groupError } = await supabaseAdmin
            .from('device_groups')
            .select('id')
            .eq('id', groupId)
            .eq('server_id', serverId)
            .single();

        if (groupError || !group) {
            return NextResponse.json(
                { error: 'Group not found' },
                { status: 404 }
            );
        }

        // Verify device belongs to this server
        const { data: device, error: deviceError } = await supabaseAdmin
            .from('smart_devices')
            .select('id')
            .eq('id', deviceId)
            .eq('server_id', serverId)
            .single();

        if (deviceError || !device) {
            return NextResponse.json(
                { error: 'Device not found' },
                { status: 404 }
            );
        }

        // Delete the membership
        const { error } = await supabaseAdmin
            .from('device_group_members')
            .delete()
            .eq('group_id', groupId)
            .eq('device_id', deviceId);

        if (error) {
            console.error('[API] Error removing device from group:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[API] Error in DELETE /groups/[groupId]/devices/[deviceId]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
