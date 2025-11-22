import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

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

    const { authToken, expoPushToken, fcmToken } = await request.json();

    if (!authToken || !expoPushToken) {
        return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    // Update user with FCM credentials
    const { error } = await supabaseAdmin
        .from('users')
        .update({
            rustplus_auth_token: authToken,
            expo_push_token: expoPushToken,
            fcm_token: fcmToken
        })
        .eq('id', user.userId);

    if (error) {
        console.error('Error saving FCM credentials:', error);
        return NextResponse.json({ error: 'Failed to save credentials' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Credentials saved' });
}
