'use client';

import { AlertTriangle } from 'lucide-react';

interface ShimDisconnectedModalProps {
    isVisible: boolean;
}

export default function ShimDisconnectedModal({ isVisible }: ShimDisconnectedModalProps) {
    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-zinc-800 border-2 border-red-600 rounded-lg p-8 max-w-md mx-4 shadow-2xl">
                <div className="flex flex-col items-center text-center">
                    {/* Animated warning icon */}
                    <div className="mb-4 animate-pulse">
                        <AlertTriangle className="w-16 h-16 text-red-500" />
                    </div>

                    <h2 className="text-2xl font-bold text-white mb-2">
                        Connection Lost
                    </h2>

                    <p className="text-zinc-300 mb-4">
                        Connection to cloud shim lost
                    </p>

                    <p className="text-sm text-zinc-400">
                        Redirecting to dashboard...
                    </p>

                    {/* Loading spinner */}
                    <div className="mt-6 flex items-center gap-2 text-zinc-400">
                        <div className="w-4 h-4 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
                        <span className="text-sm">Please wait</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
