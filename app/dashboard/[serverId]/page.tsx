'use client';

import { useEffect, useState } from 'react';
import { useShim } from '@/hooks/useShim';
import { useParams } from 'next/navigation';
import { Users, MapPin, Calendar, Hash, Droplet, Maximize2, Clock, TrendingUp } from 'lucide-react';

export default function ServerOverview() {
    const params = useParams();
    const serverId = params.serverId as string;
    const [server, setServer] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        fetch('/api/auth/me')
            .then(res => res.ok ? res.json() : null)
            .then(setUser);
    }, []);

    const { isConnected, sendCommand } = useShim(user?.userId || null);

    // Initial load from database (one-time only)
    useEffect(() => {
        const fetchServer = async () => {
            const res = await fetch(`/api/servers?includeInfo=true`);
            if (res.ok) {
                const servers = await res.json();
                const found = servers.find((s: any) => s.id === serverId);
                setServer(found);
            }
            setLoading(false);
        };

        fetchServer();
    }, [serverId]);

    // Update last_viewed_at and fetch fresh server info on mount (one-time)
    useEffect(() => {
        if (!user?.userId || !serverId) return;

        const fetchFreshServerInfo = async () => {
            try {
                // Update last_viewed_at timestamp for optimization system
                await fetch(`/api/servers/${serverId}/view`, {
                    method: 'POST',
                    credentials: 'include'
                });

                console.log('[Overview] Requesting fresh server info...');
                const result = await sendCommand(serverId, 'getServerInfo', {});

                if (result?.success && result?.data) {
                    console.log('[Overview] ✅ Received fresh server info');
                    updateServerInfo(result.data);
                }
            } catch (error) {
                console.error('[Overview] Failed to fetch fresh server info:', error);
            }
        };

        const timeout = setTimeout(fetchFreshServerInfo, 500);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.userId, serverId]);

    // Listen for real-time server info updates via SSE (no polling!)
    useEffect(() => {
        if (!user?.userId) return;

        const handleServerInfoUpdate = (event: Event) => {
            const customEvent = event as CustomEvent;
            const { serverId: eventServerId, ...data } = customEvent.detail;

            if (eventServerId !== serverId) return;

            console.log('[Overview] 📡 Real-time server info update via SSE');
            updateServerInfo(data);
        };

        window.addEventListener('server_info_update', handleServerInfoUpdate);

        return () => {
            window.removeEventListener('server_info_update', handleServerInfoUpdate);
        };
    }, [user?.userId, serverId]);

    // Helper function to update server info smoothly
    const updateServerInfo = (data: any) => {
        setServer((prev: any) => {
            if (!prev) return prev;

            return {
                ...prev,
                server_info: [{
                    name: data.name,
                    header_image: data.headerImage,
                    url: data.url,
                    map: data.map,
                    map_size: data.mapSize,
                    wipe_time: data.wipeTime ? new Date(data.wipeTime * 1000).toISOString() : null,
                    players: data.players,
                    max_players: data.maxPlayers,
                    queued_players: data.queuedPlayers,
                    seed: data.seed,
                    salt: data.salt,
                    updated_at: new Date().toISOString()
                }]
            };
        });
    };

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-rust-500/20 border-t-rust-500 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-neutral-400">Loading server overview...</p>
                </div>
            </div>
        );
    }

    if (!server) return <div className="p-8 text-red-400">Server not found</div>;

    const serverInfo = server.server_info?.[0] || null;
    const hasInfo = serverInfo !== null;

    // Calculate time since wipe
    const getWipeInfo = () => {
        if (!serverInfo?.wipe_time) return { text: 'Unknown', color: 'text-neutral-400' };
        const wipeDate = new Date(serverInfo.wipe_time);
        const now = new Date();
        const daysSinceWipe = Math.floor((now.getTime() - wipeDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysSinceWipe === 0) return { text: 'Today', color: 'text-green-400' };
        if (daysSinceWipe === 1) return { text: '1 day ago', color: 'text-green-400' };
        if (daysSinceWipe < 7) return { text: `${daysSinceWipe} days ago`, color: 'text-yellow-400' };
        return { text: `${daysSinceWipe} days ago`, color: 'text-orange-400' };
    };

    const wipeInfo = getWipeInfo();

    return (
        <div className="p-8 space-y-6">
            {/* Hero Header with Gradient */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rust-500/20 via-neutral-900 to-neutral-900 border border-rust-500/20 p-8">
                <div className="absolute top-0 right-0 w-96 h-96 bg-rust-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div className="relative z-10">
                    <div className="flex items-start justify-between mb-6">
                        <div className="flex-1">
                            <h1 className="text-4xl font-bold text-white mb-3 bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
                                {hasInfo ? serverInfo.name : server.name}
                            </h1>
                            <div className="flex items-center gap-4 text-neutral-400">
                                <span className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800/50 rounded-full border border-neutral-700">
                                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                                    {isConnected ? 'Connected' : 'Disconnected'}
                                </span>
                                <span className="font-mono text-sm">{server.ip}:{server.port}</span>
                            </div>
                        </div>
                        {hasInfo && serverInfo.header_image && (
                            <img
                                src={serverInfo.header_image}
                                alt="Server Header"
                                className="w-32 h-32 rounded-xl object-cover border-2 border-neutral-700 shadow-2xl"
                            />
                        )}
                    </div>

                    {hasInfo && serverInfo.url && (
                        <a
                            href={serverInfo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-rust-400 hover:text-rust-300 transition-colors text-sm"
                        >
                            Visit Server Website →
                        </a>
                    )}
                </div>
            </div>

            {/* Primary Stats - Large Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Players Card */}
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500/10 to-neutral-900 border border-blue-500/20 p-6 group hover:border-blue-500/40 transition-all">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl"></div>
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-neutral-400 text-sm font-medium uppercase tracking-wider">Players</h3>
                            <Users className="w-6 h-6 text-blue-400" />
                        </div>
                        {hasInfo ? (
                            <>
                                <p className="text-4xl font-bold text-white mb-2 transition-all duration-500">
                                    {serverInfo.players}
                                    <span className="text-2xl text-neutral-500">/{serverInfo.max_players}</span>
                                </p>
                                <div className="w-full bg-neutral-800 rounded-full h-2 mb-2">
                                    <div
                                        className="bg-gradient-to-r from-blue-500 to-blue-400 h-2 rounded-full transition-all duration-500"
                                        style={{ width: `${(serverInfo.players / serverInfo.max_players) * 100}%` }}
                                    ></div>
                                </div>
                                {serverInfo.queued_players > 0 && (
                                    <p className="text-sm text-orange-400 transition-opacity duration-300">+{serverInfo.queued_players} in queue</p>
                                )}
                            </>
                        ) : (
                            <p className="text-3xl font-bold text-neutral-600">--</p>
                        )}
                    </div>
                </div>

                {/* Map Info Card */}
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-green-500/10 to-neutral-900 border border-green-500/20 p-6 group hover:border-green-500/40 transition-all">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-2xl"></div>
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-neutral-400 text-sm font-medium uppercase tracking-wider">Map</h3>
                            <MapPin className="w-6 h-6 text-green-400" />
                        </div>
                        {hasInfo ? (
                            <>
                                <p className="text-2xl font-bold text-white mb-1">{serverInfo.map}</p>
                                <div className="flex items-center gap-2 text-neutral-400">
                                    <Maximize2 className="w-4 h-4" />
                                    <span className="text-lg">{serverInfo.map_size}m</span>
                                </div>
                            </>
                        ) : (
                            <p className="text-2xl font-bold text-neutral-600">Unknown</p>
                        )}
                    </div>
                </div>

                {/* Wipe Time Card */}
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-purple-500/10 to-neutral-900 border border-purple-500/20 p-6 group hover:border-purple-500/40 transition-all">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl"></div>
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-neutral-400 text-sm font-medium uppercase tracking-wider">Last Wipe</h3>
                            <Calendar className="w-6 h-6 text-purple-400" />
                        </div>
                        {hasInfo && serverInfo.wipe_time ? (
                            <>
                                <p className={`text-2xl font-bold ${wipeInfo.color} mb-1`}>{wipeInfo.text}</p>
                                <p className="text-sm text-neutral-500">
                                    {new Date(serverInfo.wipe_time).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })}
                                </p>
                            </>
                        ) : (
                            <p className="text-2xl font-bold text-neutral-600">Unknown</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Server Details Grid */}
            {hasInfo && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Seed */}
                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4 hover:border-neutral-700 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                            <Hash className="w-4 h-4 text-rust-400" />
                            <h4 className="text-neutral-400 text-xs uppercase tracking-wider">Seed</h4>
                        </div>
                        <p className="text-white font-mono text-lg">{serverInfo.seed || 'N/A'}</p>
                    </div>

                    {/* Salt */}
                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4 hover:border-neutral-700 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                            <Droplet className="w-4 h-4 text-rust-400" />
                            <h4 className="text-neutral-400 text-xs uppercase tracking-wider">Salt</h4>
                        </div>
                        <p className="text-white font-mono text-lg">{serverInfo.salt || 'N/A'}</p>
                    </div>

                    {/* Queue Status */}
                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4 hover:border-neutral-700 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-4 h-4 text-rust-400" />
                            <h4 className="text-neutral-400 text-xs uppercase tracking-wider">Queue</h4>
                        </div>
                        <p className="text-white font-mono text-lg transition-all duration-300">
                            {serverInfo.queued_players > 0 ? serverInfo.queued_players : 'None'}
                        </p>
                    </div>

                    {/* Last Updated */}
                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4 hover:border-neutral-700 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                            <Clock className="w-4 h-4 text-rust-400" />
                            <h4 className="text-neutral-400 text-xs uppercase tracking-wider">Updated</h4>
                        </div>
                        <p className="text-white text-sm">
                            {serverInfo.updated_at ?
                                new Date(serverInfo.updated_at).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })
                                : 'N/A'
                            }
                        </p>
                    </div>
                </div>
            )}

            {/* No Data Message */}
            {!hasInfo && (
                <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-8 text-center">
                    <div className="max-w-md mx-auto">
                        <div className="w-16 h-16 bg-rust-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <TrendingUp className="w-8 h-8 text-rust-500" />
                        </div>
                        <h3 className="text-xl font-semibold text-white mb-2">Fetching Server Data...</h3>
                        <p className="text-neutral-400 mb-4">
                            Server information will appear shortly via real-time updates.
                        </p>
                        <p className="text-sm text-neutral-500">
                            Make sure the Cloud Shim is running and connected to the server.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
