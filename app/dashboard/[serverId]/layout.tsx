'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import {
    LayoutDashboard,
    Map as MapIcon,
    Zap,
    MessageSquare,
    ShoppingCart,
    Settings,
    ArrowLeft,
    Workflow
} from 'lucide-react';
import { useServerConnection } from '@/components/ServerConnectionProvider';

export default function ServerDashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useParams();
    const serverId = params.serverId as string;
    const { activeServerId } = useServerConnection();
    const [isChecking, setIsChecking] = useState(true);

    // Check if server is connected - if not, redirect to dashboard
    useEffect(() => {
        if (serverId && activeServerId !== serverId) {
            console.log(`[ServerLayout] Server ${serverId} is not connected (active: ${activeServerId}). Redirecting to dashboard...`);
            router.push('/dashboard');
        } else {
            setIsChecking(false);
        }
    }, [serverId, activeServerId, router]);

    // Track last viewed time
    useEffect(() => {
        if (serverId) {
            fetch('/api/servers', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: serverId, action: 'view' })
            }).catch(err => console.error('Failed to update view time:', err));
        }
    }, [serverId]);

    // Show loading while checking connection
    if (isChecking) {
        return (
            <div className="flex h-screen items-center justify-center bg-neutral-900 text-white">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-rust-500 mb-4"></div>
                    <p className="text-neutral-400">Checking server connection...</p>
                </div>
            </div>
        );
    }

    const navItems = [
        { name: 'Overview', href: `/dashboard/${serverId}`, icon: LayoutDashboard },
        { name: 'Map', href: `/dashboard/${serverId}/map`, icon: MapIcon },
        { name: 'Devices', href: `/dashboard/${serverId}/devices`, icon: Zap },
        { name: 'Workflows', href: `/dashboard/${serverId}/workflows`, icon: Workflow },
        { name: 'Chat', href: `/dashboard/${serverId}/chat`, icon: MessageSquare },
        { name: 'Shops', href: `/dashboard/${serverId}/shops`, icon: ShoppingCart },
    ];

    return (
        <div className="flex h-screen bg-neutral-900 text-white">
            {/* Sidebar */}
            <aside className="w-64 border-r border-neutral-800 flex flex-col">
                <div className="p-6 border-b border-neutral-800">
                    <Link href="/dashboard" className="flex items-center text-neutral-400 hover:text-white mb-4 transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Servers
                    </Link>
                    <h1 className="text-xl font-bold bg-gradient-to-r from-rust-500 to-orange-500 bg-clip-text text-transparent">
                        Server Control
                    </h1>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`flex items-center px-4 py-3 rounded-lg transition-all duration-200 ${isActive
                                    ? 'bg-rust-600/20 text-rust-500 border border-rust-500/20'
                                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                                    }`}
                            >
                                <item.icon className={`w-5 h-5 mr-3 ${isActive ? 'text-rust-500' : ''}`} />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-neutral-800">
                    <Link
                        href={`/dashboard/${serverId}/settings`}
                        className="flex items-center px-4 py-3 rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                        <Settings className="w-5 h-5 mr-3" />
                        Settings
                    </Link>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto bg-neutral-950 p-6">
                {children}
            </main>
        </div>
    );
}
