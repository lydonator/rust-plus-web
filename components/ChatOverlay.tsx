'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, User, AlertTriangle, Anchor, Plane, Box, Flame, MessageSquare, X, Minimize2 } from 'lucide-react';
import { useShim } from '@/hooks/useShim';

interface ChatMessage {
    id: string;
    type: 'message' | 'event';
    senderName?: string;
    content: string;
    timestamp: number;
    steamId?: string;
    eventType?: 'CargoShip' | 'PatrolHelicopter' | 'Chinook' | 'Crate' | 'Explosion';
}

interface ChatOverlayProps {
    serverId: string;
    userId: string | null;
}

export default function ChatOverlay({ serverId, userId }: ChatOverlayProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const { isConnected, sendCommand } = useShim(userId);

    // Auto-scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
            setUnreadCount(0);
        }
    }, [messages, isOpen]);

    // Listen for team messages and game events via window events
    useEffect(() => {
        const handleTeamMessage = (e: Event) => {
            const event = e as CustomEvent;
            const data = event.detail;
            if (data.serverId !== serverId) return;

            const newMessage: ChatMessage = {
                id: Date.now().toString() + Math.random(),
                type: 'message',
                senderName: data.message.name,
                content: data.message.message,
                timestamp: Date.now(),
                steamId: data.message.steamId
            };

            setMessages(prev => [...prev, newMessage]);
            if (!isOpen) {
                setUnreadCount(prev => prev + 1);
            }
        };

        const handleGameEvent = (e: Event) => {
            const event = e as CustomEvent;
            const data = event.detail;
            if (data.serverId !== serverId) return;

            const newEvent: ChatMessage = {
                id: Date.now().toString() + Math.random(),
                type: 'event',
                content: data.message,
                timestamp: data.timestamp,
                eventType: data.type
            };

            setMessages(prev => [...prev, newEvent]);
        };

        window.addEventListener('team_message', handleTeamMessage);
        window.addEventListener('game_event', handleGameEvent);

        return () => {
            window.removeEventListener('team_message', handleTeamMessage);
            window.removeEventListener('game_event', handleGameEvent);
        };
    }, [serverId, isOpen]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || !userId) return;

        const messageToSend = inputValue;
        setInputValue('');

        try {
            await sendCommand(serverId, 'sendTeamMessage', {
                message: messageToSend
            });
        } catch (error) {
            console.error('Error sending message:', error);
            setInputValue(messageToSend);
            alert('Failed to send message');
        }
    };

    const getEventIcon = (type?: string) => {
        switch (type) {
            case 'CargoShip': return <Anchor className="w-4 h-4 text-blue-400" />;
            case 'PatrolHelicopter': return <Plane className="w-4 h-4 text-red-500" />;
            case 'Chinook': return <Plane className="w-4 h-4 text-green-500" />;
            case 'Crate': return <Box className="w-4 h-4 text-yellow-500" />;
            case 'Explosion': return <Flame className="w-4 h-4 text-orange-500" />;
            default: return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
        }
    };

    return (
        <>
            {/* Floating Chat Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed top-1/2 -translate-y-1/2 right-6 z-40 p-4 bg-rust-600 hover:bg-rust-700 text-white rounded-full shadow-lg transition-all duration-200 hover:scale-110 group"
                >
                    <MessageSquare className="w-6 h-6" />
                    {unreadCount > 0 && (
                        <div className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full animate-pulse">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </div>
                    )}
                    <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-neutral-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        Team Chat
                    </div>
                </button>
            )}

            {/* Chat Panel */}
            {isOpen && (
                <div className="fixed right-0 top-0 bottom-0 w-full sm:w-96 z-50 flex flex-col bg-neutral-900/70 backdrop-blur-md border-l border-neutral-800 shadow-2xl animate-in slide-in-from-right duration-300">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-900/95 backdrop-blur-sm">
                        <div className="flex items-center gap-3">
                            <MessageSquare className="w-5 h-5 text-rust-500" />
                            <div>
                                <h2 className="font-semibold text-white">Team Chat</h2>
                                <div className={`flex items-center text-xs ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                                    {isConnected ? 'Connected' : 'Disconnected'}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-2 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-400 hover:text-white"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-transparent">
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-neutral-500">
                                <User className="w-12 h-12 mb-3 opacity-50" />
                                <p className="text-sm">No messages yet</p>
                                <p className="text-xs text-neutral-600 mt-1">Start chatting with your team!</p>
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <div key={msg.id} className={`flex ${msg.type === 'event' ? 'justify-center' : 'justify-start'}`}>
                                    {msg.type === 'event' ? (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-neutral-800/50 rounded-lg border border-neutral-700/50 text-sm">
                                            {getEventIcon(msg.eventType)}
                                            <span className="text-neutral-300">{msg.content}</span>
                                        </div>
                                    ) : (
                                        <div className="max-w-[85%] bg-neutral-800 rounded-lg p-3 shadow-lg">
                                            <div className="flex items-center gap-2 mb-1">
                                                <User className="w-3 h-3 text-rust-500" />
                                                <span className="font-medium text-sm text-rust-500">{msg.senderName}</span>
                                            </div>
                                            <p className="text-sm text-neutral-200 break-words">{msg.content}</p>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <form onSubmit={handleSendMessage} className="p-4 border-t border-neutral-800 bg-neutral-900/95 backdrop-blur-sm">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Type a message..."
                                disabled={!isConnected}
                                className="flex-1 px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-rust-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                            />
                            <button
                                type="submit"
                                disabled={!isConnected || !inputValue.trim()}
                                className="px-4 py-2 bg-rust-600 hover:bg-rust-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </>
    );
}
