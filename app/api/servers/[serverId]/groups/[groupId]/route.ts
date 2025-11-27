import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// PATCH /api/servers/[serverId]/groups/[groupId] - Update a group
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ serverId: string; groupId: string }> }
) {
    try {
        const { serverId, groupId } = await params;
        const body = await request.json();

        const { name, color, icon } = body;

        // Build update object with only provided fields
        const updates: any = {};
        if (name !== undefined) {
            if (typeof name !== 'string' || name.trim().length === 0) {
                return NextResponse.json(
                    { error: 'Group name cannot be empty' },
                    { status: 400 }
                );
            }
            updates.name = name.trim();
        }
        if (color !== undefined) updates.color = color;
        if (icon !== undefined) updates.icon = icon;
        updates.updated_at = new Date().toISOString();

        if (Object.keys(updates).length === 0) {
            return NextResponse.json(
                { error: 'No updates provided' },
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

        // Update the group
        const { data: updatedGroup, error } = await supabaseAdmin
            .from('device_groups')
            .update(updates)
            .eq('id', groupId)
            .select()
            .single();

        if (error) {
            console.error('[API] Error updating group:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(updatedGroup);
    } catch (error: any) {
        console.error('[API] Error in PATCH /groups/[groupId]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE /api/servers/[serverId]/groups/[groupId] - Delete a group
export async function DELETE(
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

        // Delete the group (CASCADE will delete memberships)
        const { error } = await supabaseAdmin
            .from('device_groups')
            .delete()
            .eq('id', groupId);

        if (error) {
            console.error('[API] Error deleting group:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[API] Error in DELETE /groups/[groupId]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
