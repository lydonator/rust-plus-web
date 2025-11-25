'use client';

import { useEffect, useState } from 'react';
import { useShim } from '@/hooks/useShim';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useServerConnection } from '@/components/ServerConnectionProvider';
import ShimDisconnectedModal from '@/components/ShimDisconnectedModal';

export default function Dashboard() {
    const router = useRouter();
    const [user, setUser] = useState<{ userId: string, steamId: string } | null>(null);
    const [servers, setServers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState({ ip: '', port: '', playerId: '', playerToken: '', name: '' });
    const [deleteConfirm, setDeleteConfirm] = useState<{ serverId: string; serverName: string } | null>(null);
    const [connectingServerId, setConnectingServerId] = useState<string | null>(null);
    const [showShimDisconnected, setShowShimDisconnected] = useState(false);

    // Use global server connection state
    const { activeServerId, setActiveServerId } = useServerConnection();

    // Connect to Cloud Shim
    const { isConnected, lastNotification, disconnectReason, clearDisconnectReason } = useShim(user?.userId || null);

    useEffect(() => {
        // Check for shim disconnection flag and show modal
        const shimDisconnected = sessionStorage.getItem('shimDisconnected');
        if (shimDisconnected === 'true') {
            setShowShimDisconnected(true);
            sessionStorage.removeItem('shimDisconnected');

            // Auto-dismiss after 5 seconds
            setTimeout(() => {
                setShowShimDisconnected(false);
            }, 5000);
        }

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

    const handleConnectServer = async (serverId: string) => {
        if (!user?.userId) return;

        setConnectingServerId(serverId);

        try {
            const shimUrl = process.env.NEXT_PUBLIC_SHIM_URL || 'http://localhost:4000';
            const res = await fetch(`${shimUrl}/connect-server`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.userId, serverId })
            });

            if (res.ok) {
                setActiveServerId(serverId);
                console.log(`[Dashboard] Connected to server ${serverId}`);
            } else {
                console.error('[Dashboard] Failed to connect to server');
                alert('Failed to connect to server');
            }
        } catch (error) {
            console.error('[Dashboard] Error connecting to server:', error);
            alert('Error connecting to server');
        } finally {
            setConnectingServerId(null);
        }
    };

    const handleDisconnectServer = async (serverId: string) => {
        try {
            const shimUrl = process.env.NEXT_PUBLIC_SHIM_URL || 'http://localhost:4000';
            const res = await fetch(`${shimUrl}/disconnect-server`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverId })
            });

            if (res.ok) {
                setActiveServerId(null);
                console.log(`[Dashboard] Disconnected from server ${serverId}`);
            } else {
                console.error('[Dashboard] Failed to disconnect from server');
            }
        } catch (error) {
            console.error('[Dashboard] Error disconnecting from server:', error);
        }
    };

    const handleDeleteServer = async () => {
        if (!deleteConfirm) return;

        try {
            const res = await fetch(`/api/servers?id=${deleteConfirm.serverId}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                // Clear active server if deleting the active one
                if (activeServerId === deleteConfirm.serverId) {
                    setActiveServerId(null);
                }
                // UI update will happen automatically via SSE or we can manually refresh
                fetchServers();
                setDeleteConfirm(null);
            } else {
                console.error('Failed to remove server');
                setDeleteConfirm(null);
            }
        } catch (error) {
            console.error('Error removing server:', error);
            setDeleteConfirm(null);
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

            {/* Disconnection Reason Banner */}
            {disconnectReason && (
                <div className="w-full max-w-4xl mb-6 bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 flex items-start gap-3">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-yellow-500 flex-shrink-0 mt-0.5"
                    >
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <div className="flex-1">
                        <p className="text-yellow-200 font-medium">Server Disconnected</p>
                        <p className="text-yellow-300/80 text-sm mt-1">{disconnectReason}</p>
                    </div>
                    <button
                        onClick={clearDisconnectReason}
                        className="text-yellow-400 hover:text-yellow-300 transition-colors"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            )}

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
                        <p className="text-sm mt-2">Connect to a Rust server and enable Push Notifications from the Session Tab.</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {servers.map(server => {
                            const isConnected = activeServerId === server.id;
                            const CardWrapper = isConnected ? Link : 'div';
                            const cardProps = isConnected
                                ? { href: `/dashboard/${server.id}` }
                                : { href: '#' as any };


                            return (
                                <CardWrapper
                                    key={server.id}
                                    {...cardProps}
                                    className={`block p-4 bg-zinc-800 rounded-lg border border-zinc-700 transition-colors ${isConnected
                                        ? 'hover:border-rust-500 cursor-pointer group'
                                        : 'opacity-60 cursor-not-allowed'
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className={`font-bold text-lg transition-colors ${isConnected ? 'group-hover:text-rust-400' : ''}`}>
                                                {server.server_info?.name || server.name}
                                                {!isConnected && <span className="text-xs ml-2 text-zinc-500">(Disconnected)</span>}
                                            </h3>
                                            <p className="text-sm text-zinc-400">{server.ip}:{server.port}</p>
                                        </div>
                                        <div className="flex gap-2 items-center">
                                            {/* Connect/Disconnect Toggle */}
                                            {activeServerId === server.id ? (
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleDisconnectServer(server.id);
                                                    }}
                                                    className="px-3 py-1 bg-green-900 hover:bg-green-800 text-green-200 text-xs rounded transition-colors flex items-center gap-1"
                                                    title="Click to disconnect"
                                                >
                                                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                                                    Connected
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleConnectServer(server.id);
                                                    }}
                                                    disabled={connectingServerId === server.id}
                                                    className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Click to connect"
                                                >
                                                    {connectingServerId === server.id ? 'Connecting...' : 'Connect'}
                                                </button>
                                            )}

                                            {/* Delete Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setDeleteConfirm({
                                                        serverId: server.id,
                                                        serverName: server.server_info?.name || server.name
                                                    });
                                                }}
                                                className="p-2 hover:bg-red-900/50 text-zinc-400 hover:text-red-500 rounded transition-colors"
                                                title="Remove Server"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M3 6h18"></path>
                                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                                </svg>
                                            </button>
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
                                </CardWrapper>
                            );
                        })}
                    </div>
                )}
            </div>

            <ConfirmDialog
                isOpen={deleteConfirm !== null}
                title="Remove Server"
                message={`Are you sure you want to remove "${deleteConfirm?.serverName}"? If you've unpaired this server in the Rust+ app, this will clean it up from your dashboard.`}
                confirmText="Remove"
                cancelText="Cancel"
                onConfirm={handleDeleteServer}
                onCancel={() => setDeleteConfirm(null)}
                variant="danger"
            />

            {/* Shim Disconnection Modal */}
            <ShimDisconnectedModal isVisible={showShimDisconnected} />
        </main>
    );
}
