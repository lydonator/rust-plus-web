'use client';

import { useState, useRef, useEffect } from 'react';
import { Power } from 'lucide-react';
import { SmartDevice } from '@/types';
import { useParams } from 'next/navigation';

interface SmartSwitchProps {
    device: SmartDevice;
    onToggle: (entityId: number, value: boolean) => void;
}

export default function SmartSwitch({ device, onToggle }: SmartSwitchProps) {
    const [isToggling, setIsToggling] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(device.name || 'Smart Switch');
    const inputRef = useRef<HTMLInputElement>(null);
    const params = useParams();
    const serverId = params.serverId as string;
    const isOn = device.value === 1;

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleToggle = async () => {
        setIsToggling(true);
        onToggle(device.entity_id, !isOn);
        setTimeout(() => setIsToggling(false), 2000);
    };

    const handleNameRightClick = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsEditing(true);
        setEditedName(device.name || 'Smart Switch');
    };

    const saveName = async () => {
        if (editedName.trim() === '' || editedName === device.name) {
            setIsEditing(false);
            setEditedName(device.name || 'Smart Switch');
            return;
        }

        try {
            const response = await fetch(`/api/servers/${serverId}/devices/${device.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editedName.trim() }),
            });

            if (response.ok) {
                const updated = await response.json();
                device.name = updated.name;
            } else {
                console.error('Failed to update device name');
                setEditedName(device.name || 'Smart Switch');
            }
        } catch (error) {
            console.error('Error updating device name:', error);
            setEditedName(device.name || 'Smart Switch');
        }

        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            saveName();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setEditedName(device.name || 'Smart Switch');
        }
    };

    return (
        <div className="bg-neutral-900/50 border border-white/5 rounded-lg p-6 hover:border-rust-500/30 transition-colors group">
            <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0 mr-4">
                    {isEditing ? (
                        <input
                            ref={inputRef}
                            type="text"
                            value={editedName}
                            onChange={(e) => setEditedName(e.target.value)}
                            onBlur={saveName}
                            onKeyDown={handleKeyDown}
                            className="font-medium text-neutral-200 bg-neutral-800 border border-rust-500 rounded px-2 py-1 mb-1 w-full focus:outline-none focus:ring-2 focus:ring-rust-500"
                        />
                    ) : (
                        <h3
                            onContextMenu={handleNameRightClick}
                            className="font-medium text-neutral-200 group-hover:text-rust-400 transition-colors mb-1 cursor-context-menu"
                            title="Right-click to edit"
                        >
                            {device.name || 'Smart Switch'}
                        </h3>
                    )}
                    <p className="text-xs text-neutral-500">Entity ID: {device.entity_id}</p>
                </div>

                <button
                    onClick={handleToggle}
                    disabled={isToggling}
                    className={`p-3 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-rust-500 focus:ring-offset-2 focus:ring-offset-neutral-900 ${isOn
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-400'
                        } ${isToggling ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                    title={isOn ? 'Turn Off' : 'Turn On'}
                >
                    <Power className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
}
