import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    // Get the auth token from Facepunch callback
    const authToken = searchParams.get('token') || searchParams.get('authToken');

    if (!authToken) {
        return NextResponse.json({ error: 'No auth token received from Facepunch' }, { status: 400 });
    }

    try {
        // URL-decode the token first
        const decodedToken = decodeURIComponent(authToken);
        console.log('Decoded token:', decodedToken);

        // The token is in format: base64(payload).base64(signature)
        // We only need the payload part
        const parts = decodedToken.split('.');
        if (parts.length < 2) {
            throw new Error('Invalid token format - expected JWT with payload and signature');
        }

        // Decode the payload (first part) from base64
        const payloadBase64 = parts[0];
        const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
        const decoded = JSON.parse(payloadJson);

        console.log('Decoded JWT payload:', decoded);

        // The token might have steamId directly or in 'sub' field
        const steamId = decoded.steamId || decoded.sub || decoded.SteamId;

        if (!steamId) {
            throw new Error('No Steam ID found in token');
        }

        console.log('Extracted Steam ID:', steamId);

        // Find or create user in Supabase
        const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('steam_id', steamId)
            .single();

        let userId;

        if (!existingUser) {
            // Create new user
            const { data: newUser, error: createError } = await supabaseAdmin
                .from('users')
                .insert([{
                    steam_id: steamId,
                    rustplus_auth_token: authToken
                }])
                .select()
                .single();

            if (createError) {
                console.error('Error creating user:', createError);
                throw new Error('Failed to create user');
            }
            userId = newUser.id;
        } else {
            // Update existing user with new auth token
            const { error: updateError } = await supabaseAdmin
                .from('users')
                .update({ rustplus_auth_token: authToken })
                .eq('id', existingUser.id);

            if (updateError) {
                console.error('Error updating user:', updateError);
            }
            userId = existingUser.id;
        }

        // Create JWT for our web app
        const token = jwt.sign(
            { userId, steamId },
            process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-secret',
            { expiresIn: '7d' }
        );

        // Redirect to Dashboard
        const response = NextResponse.redirect(`${process.env.STEAM_REALM}/dashboard`);

        response.cookies.set('auth-token', token, {
            httpOnly: true,
            path: '/',
            maxAge: 60 * 60 * 24 * 7, // 7 days
        });

        return response;

    } catch (error: any) {
        console.error('Auth callback error:', error);
        return NextResponse.json({
            error: 'Authentication failed',
            details: error.message
        }, { status: 500 });
    }
}
