'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * EXPERIMENTAL: Alternative Facepunch authentication page
 * This uses a popup window approach to extract the Facepunch token
 */
export default function FacepunchAuthPage() {
    const router = useRouter();
    const [status, setStatus] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const startAuth = () => {
        setStatus('waiting');
        setMessage('Opening Facepunch login...');

        // Open Facepunch login in popup
        const popup = window.open(
            'https://companion-rust.facepunch.com/login',
            'facepunch-login',
            'width=500,height=700,left=100,top=100'
        );

        if (!popup) {
            setStatus('error');
            setMessage('Failed to open popup. Please allow popups for this site.');
            return;
        }

        // Poll the popup to check if it's on the success page
        const pollInterval = setInterval(() => {
            try {
                // Try to access popup's location (will fail due to CORS until it redirects back)
                const popupUrl = popup.location.href;

                // If we can access it and it contains the success page
                if (popupUrl.includes('companion-rust.facepunch.com')) {
                    // Try to extract the token from the page
                    const popupDoc = popup.document;
                    const scripts = popupDoc.querySelectorAll('script');

                    for (const script of scripts) {
                        const content = script.textContent || '';
                        const match = content.match(/postMessage\('({.*?})'\)/);

                        if (match) {
                            try {
                                const data = JSON.parse(match[1]);
                                const { SteamId, Token } = data;

                                // Success! We got the token
                                clearInterval(pollInterval);
                                popup.close();

                                setMessage('Token extracted! Saving...');

                                // Send to backend to save
                                saveFacepunchToken(SteamId, Token);

                            } catch (e) {
                                console.error('Failed to parse token:', e);
                            }
                        }
                    }
                }
            } catch (e) {
                // CORS error - popup is still on Facepunch domain, keep polling
            }

            // Check if popup was closed
            if (popup.closed) {
                clearInterval(pollInterval);
                if (status === 'waiting') {
                    setStatus('error');
                    setMessage('Login cancelled');
                }
            }
        }, 500);
    };

    const saveFacepunchToken = async (steamId: string, token: string) => {
        try {
            const response = await fetch('/api/auth/facepunch/save-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ steamId, token })
            });

            if (response.ok) {
                setStatus('success');
                setMessage('✅ Facepunch token saved successfully!');

                // Redirect back to dashboard after 2 seconds
                setTimeout(() => {
                    router.push('/dashboard');
                }, 2000);
            } else {
                throw new Error('Failed to save token');
            }
        } catch (error) {
            setStatus('error');
            setMessage('Failed to save token. Please try again.');
            console.error('Save token error:', error);
        }
    };

    return (
        <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-neutral-800 rounded-lg p-8 border border-neutral-700">
                <h1 className="text-2xl font-bold mb-4 bg-gradient-to-r from-rust-500 to-orange-500 bg-clip-text text-transparent">
                    🧪 Experimental Facepunch Auth
                </h1>

                <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded">
                    <p className="text-sm text-yellow-200">
                        <strong>⚠️ Experimental Feature</strong><br />
                        This is an alternative login method that doesn't require the Chrome extension.
                        Your existing auth will not be affected.
                    </p>
                </div>

                {status === 'idle' && (
                    <button
                        onClick={startAuth}
                        className="w-full bg-rust-600 hover:bg-rust-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                        Start Facepunch Login
                    </button>
                )}

                {status === 'waiting' && (
                    <div className="text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-rust-500 mb-4"></div>
                        <p className="text-neutral-400">{message}</p>
                        <p className="text-sm text-neutral-500 mt-2">
                            Complete the login in the popup window...
                        </p>
                    </div>
                )}

                {status === 'success' && (
                    <div className="text-center">
                        <div className="text-4xl mb-4">✅</div>
                        <p className="text-green-400 font-medium">{message}</p>
                        <p className="text-sm text-neutral-400 mt-2">
                            Redirecting to dashboard...
                        </p>
                    </div>
                )}

                {status === 'error' && (
                    <div className="text-center">
                        <div className="text-4xl mb-4">❌</div>
                        <p className="text-red-400 font-medium">{message}</p>
                        <button
                            onClick={() => setStatus('idle')}
                            className="mt-4 text-rust-500 hover:text-rust-400 text-sm"
                        >
                            Try Again
                        </button>
                    </div>
                )}

                <div className="mt-6 pt-6 border-t border-neutral-700">
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="text-neutral-400 hover:text-white text-sm transition-colors"
                    >
                        ← Back to Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}
