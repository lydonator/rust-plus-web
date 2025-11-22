'use client';

import { useEffect, useState } from 'react';
import { useShim } from '@/hooks/useShim';
import Link from 'next/link';

export default function Dashboard() {
    const [user, setUser] = useState<{ userId: string, steamId: string } | null>(null);
    const [servers, setServers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState({ ip: '', port: '', playerId: '', playerToken: '', name: '' });

    // Connect to Cloud Shim
    const { isConnected, lastNotification } = useShim(user?.userId || null);

    useEffect(() => {
        // Fetch user info
        fetch('/api/auth/me')
            .then(res => res.ok ? res.json() : null)
            .then(userData => {
                if (userData) setUser(userData);
            });

        fetchServers();
    }, []);

    // Show notification toast/alert when received
    useEffect(() => {
        if (lastNotification) {
            console.log('New Notification:', lastNotification);

            // If it's a server pairing notification, refresh the server list
            const data = lastNotification.data || {};
            if (data.type === 'server' || data.ip) {
                console.log('Server pairing detected! Refreshing server list...');
                fetchServers();
            }
        }
    }, [lastNotification]);

    // Listen for server list changes (removals/additions)
    useEffect(() => {
        const handleServerListChange = () => {
            console.log('Server list changed, refreshing...');
            fetchServers();
        };

        const handleServerInfoUpdate = () => {
            console.log('Server info updated, refreshing...');
            fetchServers();
        };

        window.addEventListener('server_list_changed', handleServerListChange);
        window.addEventListener('server_info_update', handleServerInfoUpdate);

        return () => {
            window.removeEventListener('server_list_changed', handleServerListChange);
            window.removeEventListener('server_info_update', handleServerInfoUpdate);
        };
    }, []);

    const fetchServers = async () => {
        const res = await fetch('/api/servers?includeInfo=true');
        if (res.ok) {
            const data = await res.json();
            setServers(data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchServers();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/servers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
        });
        if (res.ok) {
            setShowAddForm(false);
            fetchServers();
            setFormData({ ip: '', port: '', playerId: '', playerToken: '', name: '' });
        } else {
            alert('Failed to add server');
        }
    };

    return (
        <main className="flex min-h-screen flex-col items-center p-24 bg-zinc-900 text-white">
            <div className="flex items-center gap-4 mb-8">
                <h1 className="text-4xl font-bold text-red-500">Rust+ Web</h1>
                <h1 className="text-4xl font-bold">Dashboard</h1>
            </div>

            <div className="mb-4 flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-zinc-400">
                    {isConnected ? 'Connected to Cloud Shim' : 'Disconnected from Cloud Shim'}
                </span>
            </div>

            <div className="w-full max-w-4xl">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl">Your Servers</h2>
                    {/* Temporarily disabled - relying on SSE for all updates. Uncomment if bulletproof proves evasive ;) */}
                    {/* <div className="flex gap-2">
                        <button
                            onClick={() => fetchServers()}
                            className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded"
                        >
                            Refresh
                        </button>
                    </div> */}
                </div>

                {showAddForm && (
                    <form onSubmit={handleSubmit} className="bg-zinc-800 p-6 rounded-lg mb-8 border border-zinc-700">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm mb-1">Server Name (Optional)</label>
                                <input
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="My Server"
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">IP Address</label>
                                <input
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2"
                                    value={formData.ip}
                                    onChange={e => setFormData({ ...formData, ip: e.target.value })}
                                    placeholder="127.0.0.1"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Port</label>
                                <input
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2"
                                    value={formData.port}
                                    onChange={e => setFormData({ ...formData, port: e.target.value })}
                                    placeholder="28082"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Player ID (SteamID)</label>
                                <input
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2"
                                    value={formData.playerId}
                                    onChange={e => setFormData({ ...formData, playerId: e.target.value })}
                                    placeholder="7656..."
                                    required
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-sm mb-1">Player Token</label>
                                <input
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2"
                                    value={formData.playerToken}
                                    onChange={e => setFormData({ ...formData, playerToken: e.target.value })}
                                    placeholder="Integer token (e.g. -12345678)"
                                    required
                                />
                            </div>
                        </div>
                        <button type="submit" className="mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded w-full">
                            Save Server
                        </button>
                    </form>
                )}

                {loading ? (
                    <p>Loading...</p>
                ) : servers.length === 0 ? (
                    <div className="p-6 border border-zinc-700 rounded-lg text-center text-zinc-400">
                        <p>No servers paired yet.</p>
                        <p className="text-sm mt-2">Use the "Add Server" button to manually input your connection details.</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {servers.map(server => (
                            <Link href={`/dashboard/${server.id}`} key={server.id} className="block p-4 bg-zinc-800 rounded-lg border border-zinc-700 hover:border-rust-500 transition-colors cursor-pointer group">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-bold text-lg group-hover:text-rust-400 transition-colors">{server.server_info?.name || server.name}</h3>
                                        <p className="text-sm text-zinc-400">{server.ip}:{server.port}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="px-2 py-1 bg-green-900 text-green-200 text-xs rounded">Connected</span>
                                    </div>
                                </div>

                                {server.server_info && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                        <div className="bg-zinc-900 p-2 rounded">
                                            <span className="text-zinc-500 block">Players</span>
                                            <span className="font-mono">{server.server_info.players}/{server.server_info.max_players}</span>
                                        </div>
                                        <div className="bg-zinc-900 p-2 rounded">
                                            <span className="text-zinc-500 block">Map</span>
                                            <span className="block truncate overflow-hidden text-ellipsis" title={`${server.server_info.map} (${server.server_info.map_size})`}>{server.server_info.map} ({server.server_info.map_size})</span>
                                        </div>
                                        <div className="bg-zinc-900 p-2 rounded">
                                            <span className="text-zinc-500 block">Queued</span>
                                            <span>{server.server_info.queued_players}</span>
                                        </div>
                                        <div className="bg-zinc-900 p-2 rounded">
                                            <span className="text-zinc-500 block">Wipe</span>
                                            <span>{new Date(server.server_info.wipe_time).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                )}
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
