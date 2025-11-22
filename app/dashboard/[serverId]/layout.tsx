'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import {
    LayoutDashboard,
    Map as MapIcon,
    Zap,
    MessageSquare,
    ShoppingCart,
    Settings,
    ArrowLeft
} from 'lucide-react';

export default function ServerDashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const params = useParams();
    const serverId = params.serverId as string;

    const navItems = [
        { name: 'Overview', href: `/dashboard/${serverId}`, icon: LayoutDashboard },
        { name: 'Map', href: `/dashboard/${serverId}/map`, icon: MapIcon },
        { name: 'Devices', href: `/dashboard/${serverId}/devices`, icon: Zap },
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
