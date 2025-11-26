'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical, Clock } from 'lucide-react';

interface SmartDevice {
    id: string;
    entity_id: number;
    name: string;
    type: 'switch' | 'alarm' | 'storage_monitor';
}

interface DeviceGroup {
    id: string;
    name: string;
    icon: string;
}

interface WorkflowAction {
    action_type: 'set_device' | 'set_group' | 'wait' | 'notify';
    action_config: any;
}

interface Workflow {
    id: string;
    name: string;
    description: string | null;
    enabled: boolean;
    trigger_type: 'manual' | 'device_state' | 'time' | 'storage_level' | 'alarm' | 'chat';
    trigger_config: any;
    actions?: WorkflowAction[];
}

interface WorkflowBuilderDialogProps {
    serverId: string;
    workflow?: Workflow; // If provided, we're in edit mode
    onClose: () => void;
    onSave: () => void;
}

export default function WorkflowBuilderDialog({ serverId, workflow, onClose, onSave }: WorkflowBuilderDialogProps) {
    const isEditMode = !!workflow;
    const [name, setName] = useState(workflow?.name || '');
    const [description, setDescription] = useState(workflow?.description || '');
    const [triggerType, setTriggerType] = useState<Workflow['trigger_type']>(workflow?.trigger_type || 'manual');
    const [triggerConfig, setTriggerConfig] = useState<any>(workflow?.trigger_config || {});
    const [triggerCommand, setTriggerCommand] = useState<string>((workflow as any)?.trigger_command || '');
    const [saveState, setSaveState] = useState<boolean>((workflow as any)?.save_state || false);
    const [actions, setActions] = useState<WorkflowAction[]>([]);
    const [devices, setDevices] = useState<SmartDevice[]>([]);
    const [groups, setGroups] = useState<DeviceGroup[]>([]);
    const [alarms, setAlarms] = useState<SmartDevice[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchDevices();
        fetchGroups();

        // Load existing actions in edit mode
        if (workflow?.actions) {
            const loadedActions = workflow.actions.map(action => ({
                action_type: action.action_type,
                action_config: action.action_config
            }));
            setActions(loadedActions);
        }
    }, [serverId, workflow]);

    const fetchDevices = async () => {
        try {
            const res = await fetch(`/api/servers/${serverId}/devices`);
            if (res.ok) {
                const data = await res.json();
                setDevices(data.filter((d: SmartDevice) => d.type === 'switch'));
                setAlarms(data.filter((d: SmartDevice) => d.type === 'alarm'));
            }
        } catch (error) {
            console.error('Failed to fetch devices:', error);
        }
    };

    const fetchGroups = async () => {
        try {
            const res = await fetch(`/api/servers/${serverId}/groups`);
            if (res.ok) {
                const data = await res.json();
                setGroups(data);
            }
        } catch (error) {
            console.error('Failed to fetch groups:', error);
        }
    };

    const addAction = (type: WorkflowAction['action_type']) => {
        let defaultConfig: any = {};

        switch (type) {
            case 'set_device':
                defaultConfig = { device_id: devices[0]?.id || '', value: true };
                break;
            case 'set_group':
                defaultConfig = { group_id: groups[0]?.id || '', value: true };
                break;
            case 'wait':
                defaultConfig = { duration_ms: 1000 };
                break;
            case 'notify':
                defaultConfig = { message: '' };
                break;
        }

        setActions([...actions, { action_type: type, action_config: defaultConfig }]);
    };

    const updateAction = (index: number, config: any) => {
        const updated = [...actions];
        updated[index].action_config = config;
        setActions(updated);
    };

    const removeAction = (index: number) => {
        setActions(actions.filter((_, i) => i !== index));
    };

    const moveAction = (index: number, direction: 'up' | 'down') => {
        if (
            (direction === 'up' && index === 0) ||
            (direction === 'down' && index === actions.length - 1)
        ) {
            return;
        }

        const updated = [...actions];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
        setActions(updated);
    };

    const handleSave = async () => {
        if (!name.trim()) {
            alert('Please enter a workflow name');
            return;
        }

        if (actions.length === 0) {
            alert('Please add at least one action');
            return;
        }

        // Convert group_id to entity_ids for set_group actions
        const processedActions = actions.map(action => {
            if (action.action_type === 'set_group') {
                const group = groups.find(g => g.id === action.action_config.group_id);
                // We'll need to fetch group devices on the backend
                return action;
            }
            return action;
        });

        setSaving(true);
        try {
            const url = isEditMode
                ? `/api/servers/${serverId}/workflows/${workflow.id}`
                : `/api/servers/${serverId}/workflows`;

            const method = isEditMode ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim() || null,
                    trigger_type: triggerType,
                    trigger_config: triggerConfig,
                    trigger_command: triggerCommand.trim() || null,
                    save_state: saveState,
                    actions: processedActions
                })
            });

            if (res.ok) {
                onSave();
                onClose();
            } else {
                const error = await res.json();
                alert(`Failed to ${isEditMode ? 'update' : 'create'} workflow: ${error.error}`);
            }
        } catch (error) {
            console.error('Failed to save workflow:', error);
            alert('Failed to save workflow');
        } finally {
            setSaving(false);
        }
    };

    const getActionIcon = (type: string) => {
        switch (type) {
            case 'set_device': return '💡';
            case 'set_group': return '🔘';
            case 'wait': return '⏱️';
            case 'notify': return '🔔';
            default: return '❓';
        }
    };

    const getActionTitle = (type: string) => {
        switch (type) {
            case 'set_device': return 'Set Device';
            case 'set_group': return 'Set Group';
            case 'wait': return 'Wait';
            case 'notify': return 'Notify';
            default: return type;
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-800 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-zinc-700 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">
                        {isEditMode ? 'Edit Workflow' : 'Create Workflow'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-700 rounded transition-colors"
                    >
                        <X className="w-5 h-5 text-zinc-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                                Workflow Name *
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Turn on all lights"
                                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-rust-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                                Description (optional)
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="What does this workflow do?"
                                rows={2}
                                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-rust-500 resize-none"
                            />
                        </div>
                    </div>

                    {/* Trigger */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                                When should this workflow run? *
                            </label>
                            <select
                                value={triggerType}
                                onChange={(e) => {
                                    const newType = e.target.value as Workflow['trigger_type'];
                                    setTriggerType(newType);
                                    // Reset trigger config when changing type
                                    if (newType === 'alarm' && alarms.length > 0) {
                                        setTriggerConfig({ alarm_id: alarms[0].entity_id });
                                    } else {
                                        setTriggerConfig({});
                                    }
                                    // Clear chat trigger if switching away from chat
                                    if (newType !== 'chat') {
                                        setTriggerCommand('');
                                        setSaveState(false);
                                    }
                                }}
                                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-white focus:outline-none focus:border-rust-500"
                            >
                                <option value="manual">🎯 Manual - Run when I click Execute</option>
                                <option value="alarm">🔔 Alarm - Run when an alarm is triggered</option>
                                <option value="chat">💬 Chat - Run when a team member types a command</option>
                            </select>
                        </div>

                        {/* Alarm trigger config */}
                        {triggerType === 'alarm' && (
                            <div>
                                <label className="block text-sm font-medium text-zinc-300 mb-2">
                                    Which alarm?
                                </label>
                                {alarms.length === 0 ? (
                                    <p className="text-sm text-zinc-500">No alarms paired yet. Pair an alarm in-game first.</p>
                                ) : (
                                    <select
                                        value={triggerConfig.alarm_id || alarms[0].entity_id}
                                        onChange={(e) => setTriggerConfig({ alarm_id: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-white focus:outline-none focus:border-rust-500"
                                    >
                                        {alarms.map((alarm) => (
                                            <option key={alarm.id} value={alarm.entity_id}>
                                                {alarm.name} (#{alarm.entity_id})
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        )}

                        {/* Chat trigger command - only for chat trigger type */}
                        {triggerType === 'chat' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                                        Chat Command *
                                    </label>
                                    <input
                                        type="text"
                                        value={triggerCommand}
                                        onChange={(e) => setTriggerCommand(e.target.value)}
                                        placeholder="!lockdown"
                                        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-rust-500"
                                    />
                                    <p className="text-xs text-zinc-500 mt-1">
                                        Anyone on your team can type this command in team chat to trigger the workflow. Must start with !
                                    </p>
                                </div>

                                {/* Save state checkbox */}
                                <div className="flex items-start gap-3 p-3 bg-zinc-900 border border-zinc-700 rounded">
                                    <input
                                        type="checkbox"
                                        id="save-state"
                                        checked={saveState}
                                        onChange={(e) => setSaveState(e.target.checked)}
                                        className="mt-0.5 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-rust-600 focus:ring-rust-500 focus:ring-offset-0"
                                    />
                                    <div className="flex-1">
                                        <label htmlFor="save-state" className="text-sm font-medium text-zinc-300 cursor-pointer">
                                            Save state before execution
                                        </label>
                                        <p className="text-xs text-zinc-500 mt-1">
                                            Enables the <code className="px-1 py-0.5 bg-zinc-800 rounded text-rust-400">!restore</code> command to undo this workflow
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Actions */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <label className="block text-sm font-medium text-zinc-300">
                                Actions
                            </label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => addAction('set_device')}
                                    disabled={devices.length === 0}
                                    className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:cursor-not-allowed text-white rounded transition-colors"
                                    title="Set a device state"
                                >
                                    💡 Device
                                </button>
                                <button
                                    onClick={() => addAction('set_group')}
                                    disabled={groups.length === 0}
                                    className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:cursor-not-allowed text-white rounded transition-colors"
                                    title="Set all devices in a group"
                                >
                                    🔘 Group
                                </button>
                                <button
                                    onClick={() => addAction('wait')}
                                    className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors"
                                    title="Wait for a duration"
                                >
                                    ⏱️ Wait
                                </button>
                                <button
                                    onClick={() => addAction('notify')}
                                    className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors"
                                    title="Send a notification (future)"
                                >
                                    🔔 Notify
                                </button>
                            </div>
                        </div>

                        {/* Action Blocks */}
                        {actions.length === 0 ? (
                            <div className="p-6 border-2 border-dashed border-zinc-700 rounded-lg text-center text-zinc-500">
                                <p className="text-sm">No actions yet</p>
                                <p className="text-xs mt-1">Click the buttons above to add actions</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {actions.map((action, index) => (
                                    <div
                                        key={index}
                                        className="p-4 bg-zinc-900 border border-zinc-700 rounded-lg"
                                    >
                                        {/* Action Header */}
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="flex flex-col gap-1">
                                                <button
                                                    onClick={() => moveAction(index, 'up')}
                                                    disabled={index === 0}
                                                    className="p-0.5 hover:bg-zinc-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                                >
                                                    <GripVertical className="w-3 h-3 text-zinc-500" />
                                                </button>
                                                <button
                                                    onClick={() => moveAction(index, 'down')}
                                                    disabled={index === actions.length - 1}
                                                    className="p-0.5 hover:bg-zinc-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                                >
                                                    <GripVertical className="w-3 h-3 text-zinc-500" />
                                                </button>
                                            </div>
                                            <span className="text-lg">{getActionIcon(action.action_type)}</span>
                                            <span className="text-sm font-medium text-white flex-1">
                                                {index + 1}. {getActionTitle(action.action_type)}
                                            </span>
                                            <button
                                                onClick={() => removeAction(index)}
                                                className="p-1 hover:bg-red-600 rounded transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4 text-zinc-400" />
                                            </button>
                                        </div>

                                        {/* Action Config */}
                                        {action.action_type === 'set_device' && (
                                            <div className="space-y-2">
                                                <select
                                                    value={action.action_config.device_id}
                                                    onChange={(e) =>
                                                        updateAction(index, {
                                                            ...action.action_config,
                                                            device_id: e.target.value
                                                        })
                                                    }
                                                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:border-rust-500"
                                                >
                                                    {devices.map((device) => (
                                                        <option key={device.id} value={device.id}>
                                                            {device.name} (#{device.entity_id})
                                                        </option>
                                                    ))}
                                                </select>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() =>
                                                            updateAction(index, {
                                                                ...action.action_config,
                                                                value: true
                                                            })
                                                        }
                                                        className={`flex-1 px-3 py-2 rounded text-sm transition-colors ${action.action_config.value
                                                            ? 'bg-green-600 text-white'
                                                            : 'bg-zinc-800 text-zinc-400'
                                                            }`}
                                                    >
                                                        Turn ON
                                                    </button>
                                                    <button
                                                        onClick={() =>
                                                            updateAction(index, {
                                                                ...action.action_config,
                                                                value: false
                                                            })
                                                        }
                                                        className={`flex-1 px-3 py-2 rounded text-sm transition-colors ${!action.action_config.value
                                                            ? 'bg-neutral-600 text-white'
                                                            : 'bg-zinc-800 text-zinc-400'
                                                            }`}
                                                    >
                                                        Turn OFF
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {action.action_type === 'set_group' && (
                                            <div className="space-y-2">
                                                <select
                                                    value={action.action_config.group_id}
                                                    onChange={(e) =>
                                                        updateAction(index, {
                                                            ...action.action_config,
                                                            group_id: e.target.value
                                                        })
                                                    }
                                                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:border-rust-500"
                                                >
                                                    {groups.map((group) => (
                                                        <option key={group.id} value={group.id}>
                                                            {group.icon} {group.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() =>
                                                            updateAction(index, {
                                                                ...action.action_config,
                                                                value: true
                                                            })
                                                        }
                                                        className={`flex-1 px-3 py-2 rounded text-sm transition-colors ${action.action_config.value
                                                            ? 'bg-green-600 text-white'
                                                            : 'bg-zinc-800 text-zinc-400'
                                                            }`}
                                                    >
                                                        Turn ON
                                                    </button>
                                                    <button
                                                        onClick={() =>
                                                            updateAction(index, {
                                                                ...action.action_config,
                                                                value: false
                                                            })
                                                        }
                                                        className={`flex-1 px-3 py-2 rounded text-sm transition-colors ${!action.action_config.value
                                                            ? 'bg-neutral-600 text-white'
                                                            : 'bg-zinc-800 text-zinc-400'
                                                            }`}
                                                    >
                                                        Turn OFF
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {action.action_type === 'wait' && (
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-zinc-500" />
                                                <input
                                                    type="number"
                                                    min="100"
                                                    step="100"
                                                    value={action.action_config.duration_ms / 1000}
                                                    onChange={(e) =>
                                                        updateAction(index, {
                                                            duration_ms: parseFloat(e.target.value) * 1000
                                                        })
                                                    }
                                                    className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:border-rust-500"
                                                />
                                                <span className="text-sm text-zinc-400">seconds</span>
                                            </div>
                                        )}

                                        {action.action_type === 'notify' && (
                                            <div className="space-y-2">
                                                <label className="block text-xs text-zinc-400">
                                                    Notification Message
                                                </label>
                                                <input
                                                    type="text"
                                                    value={action.action_config.message || ''}
                                                    onChange={(e) =>
                                                        updateAction(index, {
                                                            message: e.target.value
                                                        })
                                                    }
                                                    placeholder="Enter your custom message..."
                                                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-rust-500"
                                                />
                                                <p className="text-xs text-zinc-500">
                                                    This message will be sent to team chat when the workflow runs
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-zinc-700 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:cursor-not-allowed text-white rounded transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !name.trim() || actions.length === 0}
                        className="px-4 py-2 bg-rust-600 hover:bg-rust-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded transition-colors"
                    >
                        {saving ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update Workflow' : 'Create Workflow')}
                    </button>
                </div>
            </div>
        </div>
    );
}
