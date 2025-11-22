'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { SmartDevice } from '@/types';
import { useParams } from 'next/navigation';

interface AlarmProps {
    device: SmartDevice;
}

export default function Alarm({ device }: AlarmProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(device.name || 'Smart Alarm');
    const inputRef = useRef<HTMLInputElement>(null);
    const params = useParams();
    const serverId = params.serverId as string;
    const isTripped = device.value === 1;

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleNameRightClick = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsEditing(true);
        setEditedName(device.name || 'Smart Alarm');
    };

    const saveName = async () => {
        if (editedName.trim() === '' || editedName === device.name) {
            setIsEditing(false);
            setEditedName(device.name || 'Smart Alarm');
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
                setEditedName(device.name || 'Smart Alarm');
            }
        } catch (error) {
            console.error('Error updating device name:', error);
            setEditedName(device.name || 'Smart Alarm');
        }

        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            saveName();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setEditedName(device.name || 'Smart Alarm');
        }
    };

    return (
        <div className="bg-neutral-900/50 border border-white/5 rounded-lg p-6 flex items-center justify-between hover:border-rust-500/30 transition-colors group">
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`p-2 rounded-md ${isTripped ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-neutral-800 text-neutral-400'}`}>
                    {isTripped ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
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
                            className="font-medium text-neutral-200 group-hover:text-rust-400 transition-colors cursor-context-menu"
                            title="Right-click to edit"
                        >
                            {device.name || 'Smart Alarm'}
                        </h3>
                    )}
                    <p className="text-xs text-neutral-500">Entity ID: {device.entity_id}</p>
                </div>
            </div>

            <div className={`px-3 py-1 rounded-full text-xs font-medium ${isTripped ? 'bg-red-500/20 text-red-400' : 'bg-neutral-800 text-neutral-400'}`}>
                {isTripped ? 'TRIPPED' : 'ARMED'}
            </div>
        </div>
    );
}
