'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function AuthCompleteContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState('Completing registration...');

    useEffect(() => {
        const completeAuth = async () => {
            const authToken = searchParams.get('authToken');
            const steamId = searchParams.get('steamId');

            if (!authToken || !steamId) {
                setStatus('Error: Missing authentication data');
                setTimeout(() => router.push('/'), 2000);
                return;
            }

            try {
                setStatus('Registering with Rust+ companion service...');

                // The backend worker will handle FCM registration automatically
                // since the user now has a rustplus_auth_token in the database

                setStatus('✅ Registration complete!');

                // Redirect to dashboard
                setTimeout(() => {
                    router.push('/dashboard');
                }, 1500);

            } catch (error) {
                console.error('Error completing auth:', error);
                setStatus('Error completing registration');
                setTimeout(() => router.push('/dashboard'), 2000);
            }
        };

        completeAuth();
    }, [searchParams, router]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
            <div className="text-center">
                <div className="mb-4">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">
                    {status}
                </h1>
                <p className="text-gray-400">
                    Please wait while we set up your Rust+ connection...
                </p>
            </div>
        </div>
    );
}

export default function AuthCompletePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gray-900">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            </div>
        }>
            <AuthCompleteContent />
        </Suspense>
    );
}
