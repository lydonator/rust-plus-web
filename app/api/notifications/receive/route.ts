import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
    try {
        // Get user session from cookies
        const cookieStore = await cookies();
        const authCookie = cookieStore.get('rust-plus-auth');

        if (!authCookie) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { userId } = JSON.parse(authCookie.value);

        // Get notification from request
        const body = await request.json();
        const { type, data, timestamp } = body;

        console.log(`[Notifications API] Received ${type} notification for user ${userId}:`, data);

        // Save notification to database
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { error } = await supabase
            .from('notifications')
            .insert([{
                user_id: userId,
                type: type,
                data: data,
                timestamp: new Date(timestamp).toISOString(),
                read: false
            }]);

        if (error) {
            console.error('[Notifications API] Error saving notification:', error);
            return NextResponse.json(
                { error: 'Failed to save notification' },
                { status: 500 }
            );
        }

        // TODO: Send real-time update via WebSocket or SSE

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Notifications API] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
