'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Play, Trash2, Plus, Power, PowerOff, Edit } from 'lucide-react';
import WorkflowBuilderDialog from '@/components/WorkflowBuilderDialog';
import { useShimConnectionGuard } from '@/hooks/useShimConnection';

interface WorkflowAction {
    id: string;
    action_order: number;
    action_type: 'set_device' | 'set_group' | 'wait' | 'notify';
    action_config: any;
}

interface Workflow {
    id: string;
    name: string;
    description: string | null;
    enabled: boolean;
    trigger_type: 'manual' | 'device_state' | 'time' | 'storage_level' | 'alarm';
    trigger_config: any;
    actions?: WorkflowAction[];
    created_at: string;
}

export default function WorkflowsPage() {
    useShimConnectionGuard();

    const params = useParams();
    const serverId = params.serverId as string;

    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
    const [executing, setExecuting] = useState<string | null>(null);

    useEffect(() => {
        fetchWorkflows();
    }, [serverId]);

    const fetchWorkflows = async () => {
        try {
            const res = await fetch(`/api/servers/${serverId}/workflows`);
            if (res.ok) {
                const data = await res.json();
                setWorkflows(data);
            }
        } catch (error) {
            console.error('Failed to fetch workflows:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleExecute = async (workflowId: string) => {
        setExecuting(workflowId);
        try {
            const res = await fetch(`/api/servers/${serverId}/workflows/${workflowId}/execute`, {
                method: 'POST'
            });

            if (res.ok) {
                const result = await res.json();
                console.log('Workflow executed:', result);
            } else {
                const error = await res.json();
                console.error('Workflow execution failed:', error);
            }
        } catch (error) {
            console.error('Failed to execute workflow:', error);
        } finally {
            setExecuting(null);
        }
    };

    const handleToggleEnabled = async (workflowId: string, currentEnabled: boolean) => {
        try {
            const res = await fetch(`/api/servers/${serverId}/workflows/${workflowId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: !currentEnabled })
            });

            if (res.ok) {
                await fetchWorkflows();
            }
        } catch (error) {
            console.error('Failed to toggle workflow:', error);
        }
    };

    const handleDelete = async (workflowId: string) => {
        if (!confirm('Are you sure you want to delete this workflow?')) return;

        try {
            const res = await fetch(`/api/servers/${serverId}/workflows/${workflowId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                await fetchWorkflows();
            }
        } catch (error) {
            console.error('Failed to delete workflow:', error);
        }
    };

    const getTriggerLabel = (type: string) => {
        switch (type) {
            case 'manual': return '🎯 Manual';
            case 'alarm': return '🔔 Alarm';
            case 'device_state': return '⚡ Device State';
            case 'time': return '⏰ Time';
            case 'storage_level': return '📦 Storage Level';
            default: return type;
        }
    };

    const getActionLabel = (type: string) => {
        switch (type) {
            case 'set_device': return '💡 Set Device';
            case 'set_group': return '🔘 Set Group';
            case 'wait': return '⏱️ Wait';
            case 'notify': return '🔔 Notify';
            default: return type;
        }
    };

    if (loading) {
        return (
            <div className="p-6">
                <div className="text-zinc-400">Loading workflows...</div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Workflows</h1>
                    <p className="text-sm text-zinc-400 mt-1">
                        Automate device actions with visual workflows
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateDialog(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-rust-600 hover:bg-rust-700 text-white rounded-lg transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Create Workflow
                </button>
            </div>

            {/* Workflows Grid */}
            {workflows.length === 0 ? (
                <div className="p-12 border border-zinc-700 rounded-lg text-center">
                    <div className="text-zinc-400 mb-4">No workflows yet</div>
                    <p className="text-sm text-zinc-500 mb-6">
                        Create your first workflow to automate device actions
                    </p>
                    <button
                        onClick={() => setShowCreateDialog(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-rust-600 hover:bg-rust-700 text-white rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Create Workflow
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {workflows.map((workflow) => (
                        <div
                            key={workflow.id}
                            className={`p-4 border rounded-lg transition-all ${workflow.enabled
                                    ? 'border-zinc-700 bg-zinc-800/50'
                                    : 'border-zinc-800 bg-zinc-900/50 opacity-60'
                                }`}
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-semibold text-white truncate">
                                            {workflow.name}
                                        </h3>
                                        {(workflow as any).trigger_command && (
                                            <span className="text-xs bg-rust-600/20 text-rust-400 px-2 py-0.5 rounded border border-rust-600/30">
                                                {(workflow as any).trigger_command}
                                            </span>
                                        )}
                                    </div>
                                    {workflow.description && (
                                        <p className="text-sm text-zinc-400 mt-1 line-clamp-2">
                                            {workflow.description}
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={() => handleToggleEnabled(workflow.id, workflow.enabled)}
                                    className={`ml-2 p-1.5 rounded transition-colors ${workflow.enabled
                                            ? 'text-green-500 hover:bg-green-500/10'
                                            : 'text-zinc-500 hover:bg-zinc-700'
                                        }`}
                                    title={workflow.enabled ? 'Enabled' : 'Disabled'}
                                >
                                    {workflow.enabled ? (
                                        <Power className="w-4 h-4" />
                                    ) : (
                                        <PowerOff className="w-4 h-4" />
                                    )}
                                </button>
                            </div>

                            {/* Trigger */}
                            <div className="mb-3 pb-3 border-b border-zinc-700">
                                <div className="text-xs text-zinc-500 mb-1">Trigger</div>
                                <div className="text-sm text-zinc-300">
                                    {getTriggerLabel(workflow.trigger_type)}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="mb-4">
                                <div className="text-xs text-zinc-500 mb-2">
                                    Actions ({workflow.actions?.length || 0})
                                </div>
                                <div className="space-y-1">
                                    {workflow.actions?.slice(0, 3).map((action, idx) => (
                                        <div
                                            key={action.id}
                                            className="text-xs text-zinc-400 flex items-center gap-1"
                                        >
                                            <span className="text-zinc-600">{idx + 1}.</span>
                                            {getActionLabel(action.action_type)}
                                        </div>
                                    ))}
                                    {(workflow.actions?.length || 0) > 3 && (
                                        <div className="text-xs text-zinc-500">
                                            +{workflow.actions!.length - 3} more
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleExecute(workflow.id)}
                                    disabled={!workflow.enabled || executing === workflow.id}
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-rust-600 hover:bg-rust-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
                                >
                                    {executing === workflow.id ? (
                                        <>
                                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Running...
                                        </>
                                    ) : (
                                        <>
                                            <Play className="w-3 h-3" />
                                            Execute
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => setEditingWorkflow(workflow)}
                                    className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors"
                                    title="Edit workflow"
                                >
                                    <Edit className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={() => handleDelete(workflow.id)}
                                    className="px-3 py-2 bg-zinc-700 hover:bg-red-600 text-white rounded transition-colors"
                                    title="Delete workflow"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create Dialog */}
            {showCreateDialog && (
                <WorkflowBuilderDialog
                    serverId={serverId}
                    onClose={() => setShowCreateDialog(false)}
                    onSave={fetchWorkflows}
                />
            )}

            {/* Edit Dialog */}
            {editingWorkflow && (
                <WorkflowBuilderDialog
                    serverId={serverId}
                    workflow={editingWorkflow}
                    onClose={() => setEditingWorkflow(null)}
                    onSave={() => {
                        fetchWorkflows();
                        setEditingWorkflow(null);
                    }}
                />
            )}
        </div>
    );
}
