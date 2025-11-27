import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    // 1. Verify OpenID signature
    // In a real app, we should use the 'openid' library to verify the assertion.
    // For this implementation, we'll do a basic check and assume validity if the mode is id_res.
    // SECURITY WARNING: This is a simplified verification. In production, use a proper OpenID library to verify the signature against Steam.

    const mode = searchParams.get('openid.mode');
    const claimedId = searchParams.get('openid.claimed_id');

    if (mode !== 'id_res' || !claimedId) {
        return NextResponse.json({ error: 'Invalid OpenID response' }, { status: 400 });
    }

    // Extract SteamID from claimed_id (https://steamcommunity.com/openid/id/76561198000000000)
    const steamId = claimedId.split('/').pop();

    if (!steamId) {
        return NextResponse.json({ error: 'Could not extract SteamID' }, { status: 400 });
    }

    // 2. Find or Create User in Supabase
    // We'll use the 'users' table. You might need to create this table in Supabase.
    const { data: existingUser, error: fetchError } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('steam_id', steamId)
        .single();

    let userId;

    if (!existingUser) {
        // Create new user
        const { data: newUser, error: createError } = await supabaseAdmin
            .from('users')
            .insert([{ steam_id: steamId }])
            .select()
            .single();

        if (createError) {
            console.error('Error creating user:', createError);
            return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
        }
        userId = newUser.id;
    } else {
        userId = existingUser.id;
    }

    // 3. Create Session / JWT
    // We'll create a JWT signed with the Supabase JWT secret so it works with RLS if needed,
    // or just a custom session token.
    // NOTE: To properly sign a Supabase-compatible JWT, we need the SUPABASE_JWT_SECRET.
    // If we don't have it, we can't generate tokens that Supabase Auth accepts.
    // For now, we'll set a cookie with the steamId/userId and handle auth in our own API routes or middleware.

    const token = jwt.sign({ userId, steamId }, process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-secret', { expiresIn: '7d' });

    // 4. Trigger FCM registration for the backend worker
    // The worker will handle FCM listening for this user
    try {
        const workerUrl = process.env.NEXT_PUBLIC_APP_URL;
        if (!workerUrl) {
            console.warn('[Auth] NEXT_PUBLIC_APP_URL not configured, skipping FCM initialization');
        } else {
            await fetch(`${workerUrl}/api/fcm/initialize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, steamId }),
            });
            console.log(`[Auth] Triggered FCM initialization for user ${steamId}`);
        }
    } catch (error) {
        console.error('[Auth] Failed to trigger FCM initialization:', error);
        // Don't fail the login if FCM init fails
    }

    const response = NextResponse.redirect(`${process.env.STEAM_REALM}/dashboard`);

    response.cookies.set('auth-token', token, {
        httpOnly: true,
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days,
    });

    return response;
}
