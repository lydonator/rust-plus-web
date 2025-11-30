'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Activity, Server, Globe } from 'lucide-react';
import { StatusChart } from '@/components/status-chart';

export default function StatusPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('/api/status');
                const json = await res.json();
                setData(json);
            } catch (error) {
                console.error('Failed to fetch status:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        // Refresh every 60 seconds
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
                <div className="animate-pulse text-rust-500">Loading status...</div>
            </div>
        );
    }

    const isAllOperational =
        data?.services?.web_app?.status === 'operational' &&
        data?.services?.cloud_shim?.status === 'operational';

    return (
        <div className="min-h-screen bg-neutral-950 text-white selection:bg-rust-500/30 font-sans">
            {/* Header */}
            <div className="border-b border-neutral-900 bg-neutral-950/50 backdrop-blur-sm sticky top-0 z-20">
                <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-rust-600 flex items-center justify-center font-bold text-lg">R+</div>
                        <h1 className="font-bold text-lg">System Status</h1>
                    </div>
                    <a href="/" className="text-sm text-neutral-400 hover:text-white transition-colors">
                        Back to App
                    </a>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-6 py-12">
                {/* Overall Status Banner */}
                <div className={`rounded-xl p-6 mb-12 border ${isAllOperational
                        ? 'bg-emerald-500/10 border-emerald-500/20'
                        : 'bg-yellow-500/10 border-yellow-500/20'
                    }`}>
                    <div className="flex items-center gap-4">
                        {isAllOperational ? (
                            <CheckCircle className="w-8 h-8 text-emerald-500" />
                        ) : (
                            <AlertTriangle className="w-8 h-8 text-yellow-500" />
                        )}
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                {isAllOperational ? 'All Systems Operational' : 'Some Systems Experiencing Issues'}
                            </h2>
                            <p className="text-neutral-400 mt-1">
                                {isAllOperational
                                    ? 'All services are running normally.'
                                    : 'We are investigating issues with some components.'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Services List */}
                <div className="space-y-8">
                    {/* Web App */}
                    <ServiceCard
                        name="Web Application"
                        icon={<Globe className="w-5 h-5" />}
                        status={data?.services?.web_app?.status}
                        uptime={data?.uptime?.web_app}
                        history={data?.history}
                        serviceKey="web_app"
                    />

                    {/* Cloud Shim */}
                    <ServiceCard
                        name="Cloud Shim (Backend)"
                        icon={<Server className="w-5 h-5" />}
                        status={data?.services?.cloud_shim?.status}
                        uptime={data?.uptime?.cloud_shim}
                        history={data?.history}
                        serviceKey="cloud_shim"
                    />
                </div>

                {/* Footer */}
                <div className="mt-24 pt-8 border-t border-neutral-900 text-center text-neutral-500 text-sm">
                    <p>Updates are automatically refreshed every 60 seconds.</p>
                    <p className="mt-2">Current Time: {new Date().toUTCString()}</p>
                </div>
            </div>
        </div>
    );
}

function ServiceCard({ name, icon, status, uptime, history, serviceKey }: any) {
    const getStatusColor = (s: string) => {
        switch (s) {
            case 'operational': return 'text-emerald-500';
            case 'degraded': return 'text-yellow-500';
            case 'down': return 'text-red-500';
            default: return 'text-neutral-500';
        }
    };

    const getStatusText = (s: string) => {
        switch (s) {
            case 'operational': return 'Operational';
            case 'degraded': return 'Degraded';
            case 'down': return 'Outage';
            default: return 'Unknown';
        }
    };

    return (
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded bg-neutral-800 text-neutral-300">
                        {icon}
                    </div>
                    <h3 className="font-bold text-lg">{name}</h3>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-sm font-medium text-neutral-400">
                        {uptime}% uptime
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-950 border border-neutral-800 text-sm font-medium ${getStatusColor(status)}`}>
                        <div className={`w-2 h-2 rounded-full bg-current`} />
                        {getStatusText(status)}
                    </div>
                </div>
            </div>

            <div className="mb-2 flex justify-between text-xs text-neutral-500 uppercase tracking-wider font-medium">
                <span>90 days ago</span>
                <span>Today</span>
            </div>

            <StatusChart history={history} serviceName={serviceKey} />
        </div>
    );
}
