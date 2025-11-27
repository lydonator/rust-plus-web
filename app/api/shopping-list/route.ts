import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

// GET - Fetch shopping list items for a specific server
export async function GET(request: Request) {
    const token = request.headers.get('cookie')?.split('auth-token=')[1]?.split(';')[0];

    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let user;
    try {
        user = jwt.verify(token, process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-secret') as any;
    } catch (e) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const serverId = searchParams.get('serverId');

    if (!serverId) {
        return NextResponse.json({ error: 'Server ID required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from('shopping_lists')
        .select('*')
        .eq('user_id', user.userId)
        .eq('server_id', serverId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching shopping list:', error);
        return NextResponse.json({ error: 'Failed to fetch shopping list' }, { status: 500 });
    }

    return NextResponse.json(data);
}

// POST - Add item to shopping list
export async function POST(request: Request) {
    const token = request.headers.get('cookie')?.split('auth-token=')[1]?.split(';')[0];

    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let user;
    try {
        user = jwt.verify(token, process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-secret') as any;
    } catch (e) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { serverId, itemId, itemName } = body;

    console.log('[Shopping List] POST request received');
    console.log('[Shopping List] serverId:', serverId, 'type:', typeof serverId);
    console.log('[Shopping List] itemId:', itemId, 'type:', typeof itemId);
    console.log('[Shopping List] itemName:', itemName);
    console.log('[Shopping List] user.userId:', user.userId, 'type:', typeof user.userId);

    if (!serverId || !itemId || !itemName) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify server belongs to user
    const { data: serverData, error: serverError } = await supabaseAdmin
        .from('servers')
        .select('id')
        .eq('id', serverId)
        .eq('user_id', user.userId)
        .single();

    console.log('[Shopping List] Server verification result:', { serverData, serverError });

    if (serverError || !serverData) {
        console.error('Server verification error:', serverError);
        console.error('Looking for server:', serverId, 'user:', user.userId);
        return NextResponse.json({ error: 'Server not found or unauthorized', details: serverError?.message }, { status: 403 });
    }

    console.log('[Shopping List] Server verified, attempting insert...');

    // Insert or ignore if already exists (due to unique constraint)
    const { data, error } = await supabaseAdmin
        .from('shopping_lists')
        .insert([{
            user_id: user.userId,
            server_id: serverId,
            item_id: itemId,
            item_name: itemName
        }])
        .select()
        .single();

    if (error) {
        // If duplicate, return existing item
        if (error.code === '23505') {
            console.log('Item already in shopping list, fetching existing...');
            const { data: existingData } = await supabaseAdmin
                .from('shopping_lists')
                .select('*')
                .eq('user_id', user.userId)
                .eq('server_id', serverId)
                .eq('item_id', itemId)
                .single();

            return NextResponse.json(existingData);
        }
        console.error('Error adding to shopping list:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
        return NextResponse.json({
            error: 'Failed to add item',
            message: error.message,
            code: error.code
        }, { status: 500 });
    }

    return NextResponse.json(data);
}

// DELETE - Remove item from shopping list
export async function DELETE(request: Request) {
    const token = request.headers.get('cookie')?.split('auth-token=')[1]?.split(';')[0];

    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let user;
    try {
        user = jwt.verify(token, process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-secret') as any;
    } catch (e) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('id');

    if (!itemId) {
        return NextResponse.json({ error: 'Item ID required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
        .from('shopping_lists')
        .delete()
        .eq('id', itemId)
        .eq('user_id', user.userId);

    if (error) {
        console.error('Error removing from shopping list:', error);
        return NextResponse.json({ error: 'Failed to remove item' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
