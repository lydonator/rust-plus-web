import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
    try {
        const { userId, steamId, authToken } = await request.json();

        if (!userId || !steamId || !authToken) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Get the user from database
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (userError || !user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // The worker's FCM listener will handle the actual registration
        // We just need to make sure the user has the authToken
        console.log(`[FCM Register API] Triggering FCM registration for user ${steamId}`);

        return NextResponse.json({
            success: true,
            message: 'FCM registration initiated'
        });

    } catch (error: any) {
        console.error('[FCM Register API] Error:', error);
        return NextResponse.json({
            error: 'Failed to register FCM',
            details: error.message
        }, { status: 500 });
    }
}
