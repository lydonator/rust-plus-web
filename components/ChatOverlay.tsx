'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, User, AlertTriangle, Anchor, Plane, Box, Flame, MessageSquare, ChevronRight } from 'lucide-react';
import { useShimConnection } from '@/components/ShimConnectionProvider';

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

    const { isConnected, sendCommand } = useShimConnection();

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

            {/* Chat Panel with glassmorphic effect and animations */}
            <div
                className={`fixed right-0 top-0 bottom-0 w-full sm:w-96 z-50 transition-transform duration-500 ease-out ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {/* Glassmorphic Background */}
                <div className="absolute inset-0 bg-gradient-to-l from-neutral-900/80 via-neutral-900/70 to-neutral-900/60 backdrop-blur-xl border-l border-white/10 shadow-2xl" />
                
                {/* Glass Reflection Effect */}
                <div className="absolute inset-0 bg-gradient-to-bl from-white/5 via-transparent to-transparent" />
                
                {/* Content Container */}
                <div className="relative flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-white/10 bg-neutral-900/20 backdrop-blur-sm">
                        <div className="flex items-center gap-3">
                            <MessageSquare className="w-5 h-5 text-rust-400" />
                            <div>
                                <h2 className="font-semibold text-white">Team Chat</h2>
                                <div className={`flex items-center text-xs ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                                    {isConnected ? 'Connected' : 'Disconnected'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-transparent">
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-white/60">
                                <User className="w-12 h-12 mb-3 opacity-50" />
                                <p className="text-sm">No messages yet</p>
                                <p className="text-xs text-white/40 mt-1">Start chatting with your team!</p>
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <div key={msg.id} className={`flex ${msg.type === 'event' ? 'justify-center' : 'justify-start'}`}>
                                    {msg.type === 'event' ? (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-lg border border-white/20 text-sm backdrop-blur-sm shadow-lg">
                                            {getEventIcon(msg.eventType)}
                                            <span className="text-white/80">{msg.content}</span>
                                        </div>
                                    ) : (
                                        <div className="max-w-[85%] bg-white/10 rounded-lg p-3 shadow-lg backdrop-blur-sm border border-white/20">
                                            <div className="flex items-center gap-2 mb-1">
                                                <User className="w-3 h-3 text-rust-400" />
                                                <span className="font-medium text-sm text-rust-400">{msg.senderName}</span>
                                            </div>
                                            <p className="text-sm text-white break-words">{msg.content}</p>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <form onSubmit={handleSendMessage} className="p-4 border-t border-white/10 bg-neutral-900/20 backdrop-blur-sm">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Type a message..."
                                disabled={!isConnected}
                                className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-rust-400 focus:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed text-sm backdrop-blur-sm"
                            />
                            <button
                                type="submit"
                                disabled={!isConnected || !inputValue.trim()}
                                className="px-4 py-2 bg-rust-600 hover:bg-rust-700 disabled:bg-white/10 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2 backdrop-blur-sm"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </form>
                    
                    {/* Collapsible Tab on Left Edge - Only visible when open */}
                    <button
                        onClick={() => setIsOpen(false)}
                        className={`absolute -left-6 top-1/2 -translate-y-1/2 w-6 h-16 bg-gradient-to-l from-neutral-900/80 to-neutral-800/70 backdrop-blur-md border border-white/10 border-r-0 rounded-l-lg shadow-lg hover:from-neutral-800/90 hover:to-neutral-700/80 transition-all duration-500 flex items-center justify-center group ${
                            isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'
                        }`}
                        aria-label="Close chat"
                    >
                        <ChevronRight className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" />
                        
                        {/* Subtle glow effect */}
                        <div className="absolute inset-0 bg-gradient-to-l from-rust-500/20 to-orange-500/20 rounded-l-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                    </button>
                </div>
            </div>
        </>
    );
}
