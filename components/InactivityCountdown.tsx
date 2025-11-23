'use client';

interface InactivityCountdownProps {
    isVisible: boolean;
    secondsRemaining: number;
    onDismiss?: () => void;
}

export default function InactivityCountdown({ isVisible, secondsRemaining, onDismiss }: InactivityCountdownProps) {
    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-8 max-w-md mx-4 shadow-2xl">
                <div className="flex flex-col items-center text-center">
                    {/* Animated warning icon */}
                    <div className="mb-4 animate-pulse">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="64"
                            height="64"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-yellow-500"
                        >
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                            <line x1="12" y1="9" x2="12" y2="13"></line>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                    </div>

                    <h2 className="text-2xl font-bold text-white mb-2">
                        Inactivity Detected
                    </h2>

                    <p className="text-zinc-400 mb-6">
                        Your server will disconnect due to inactivity
                    </p>

                    {/* Countdown circle */}
                    <div className="relative w-32 h-32 mb-6">
                        <svg className="transform -rotate-90 w-32 h-32">
                            <circle
                                cx="64"
                                cy="64"
                                r="56"
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="transparent"
                                className="text-zinc-700"
                            />
                            <circle
                                cx="64"
                                cy="64"
                                r="56"
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="transparent"
                                strokeDasharray={`${2 * Math.PI * 56}`}
                                strokeDashoffset={`${2 * Math.PI * 56 * (1 - secondsRemaining / 10)}`}
                                className="text-red-500 transition-all duration-1000"
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-5xl font-bold text-white">
                                {secondsRemaining}
                            </span>
                        </div>
                    </div>

                    <p className="text-sm text-zinc-500">
                        Move your mouse or press any key to stay connected
                    </p>

                    {onDismiss && (
                        <button
                            onClick={onDismiss}
                            className="mt-4 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors text-sm"
                        >
                            Dismiss
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
