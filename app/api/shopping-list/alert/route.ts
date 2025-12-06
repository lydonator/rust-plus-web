import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/**
 * PATCH /api/shopping-list/alert
 * Update price alert settings for a shopping list item
 */
export async function PATCH(req: NextRequest) {
    try {
        // Get user from JWT
        const cookieStore = await cookies();
        const token = cookieStore.get('token');

        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await verifyToken(token.value);
        const userId = payload.userId;

        // Parse request body
        const { id, alertEnabled, targetPrice } = await req.json();

        if (!id) {
            return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
        }

        // Verify ownership and update
        const { data: item, error: fetchError } = await supabaseAdmin
            .from('shopping_lists')
            .select('user_id')
            .eq('id', id)
            .single();

        if (fetchError || !item) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        if (item.user_id !== userId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Build update object
        const updates: any = {};
        if (typeof alertEnabled === 'boolean') {
            updates.alert_enabled = alertEnabled;
        }
        if (typeof targetPrice === 'number') {
            updates.target_price = targetPrice;
        }

        // Update the item
        const { error: updateError } = await supabaseAdmin
            .from('shopping_lists')
            .update(updates)
            .eq('id', id);

        if (updateError) {
            console.error('Failed to update price alert:', updateError);
            return NextResponse.json({ error: 'Failed to update price alert' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error updating price alert:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
