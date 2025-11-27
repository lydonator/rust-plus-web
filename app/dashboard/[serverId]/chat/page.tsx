'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Send, User, AlertTriangle, Anchor, Plane, Box, Flame } from 'lucide-react';
import { useShimConnection } from '@/components/ShimConnectionProvider';
import { useShimConnectionGuard } from '@/hooks/useShimConnection';

interface ChatMessage {
    id: string;
    type: 'message' | 'event';
    senderName?: string;
    content: string;
    timestamp: number;
    steamId?: string;
    eventType?: 'CargoShip' | 'PatrolHelicopter' | 'Chinook' | 'Crate' | 'Explosion';
}

export default function ChatPage() {
    useShimConnectionGuard();

    const params = useParams();
    const serverId = params.serverId as string;
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [user, setUser] = useState<any>(null);

    // Get current user
    useEffect(() => {
        fetch('/api/auth/me')
            .then(res => res.ok ? res.json() : null)
            .then(setUser);
    }, []);

    const { isConnected, sendCommand } = useShimConnection();

    // Auto-scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

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
    }, [serverId]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || !user?.userId) return;

        const messageToSend = inputValue;
        setInputValue(''); // Optimistic clear

        try {
            await sendCommand(serverId, 'sendTeamMessage', {
                message: messageToSend
            });

            // Note: We don't add the message to the list here because 
            // the server will echo it back via SSE if successful (usually)
        } catch (error) {
            console.error('Error sending message:', error);
            // Restore input on error
            setInputValue(messageToSend);
            alert('Failed to send message');
        }
    };

    const getEventIcon = (type?: string) => {
        switch (type) {
            case 'CargoShip': return <Anchor className="w-5 h-5 text-blue-400" />;
            case 'PatrolHelicopter': return <Plane className="w-5 h-5 text-red-500" />;
            case 'Chinook': return <Plane className="w-5 h-5 text-green-500" />;
            case 'Crate': return <Box className="w-5 h-5 text-yellow-500" />;
            case 'Explosion': return <Flame className="w-5 h-5 text-orange-500" />;
            default: return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)] max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-rust-500 to-orange-500 bg-clip-text text-transparent">
                        Team Chat
                    </h1>
                    <p className="text-neutral-400 mt-1">
                        Real-time communication and event logs
                    </p>
                </div>
                <div className={`flex items-center px-3 py-1 rounded-full text-sm ${isConnected ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                    }`}>
                    <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                    {isConnected ? 'Connected' : 'Disconnected'}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden flex flex-col shadow-xl backdrop-blur-sm">
                {/* Messages List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-neutral-500 opacity-50">
                            <User className="w-16 h-16 mb-4" />
                            <p>No messages yet. Start the conversation!</p>
                        </div>
                    ) : (
                        messages.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.type === 'event' ? 'justify-center' : 'justify-start'}`}>
                                {msg.type === 'event' ? (
                                    <div className="flex items-center px-4 py-2 bg-neutral-800/50 border border-neutral-700/50 rounded-full text-sm text-neutral-300 animate-in fade-in slide-in-from-bottom-2">
                                        <span className="mr-2">{getEventIcon(msg.eventType)}</span>
                                        <span className="font-medium">{msg.content}</span>
                                        <span className="ml-3 text-xs text-neutral-500">
                                            {new Date(msg.timestamp).toLocaleTimeString()}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex items-start max-w-[80%] animate-in fade-in slide-in-from-left-2">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rust-500 to-orange-600 flex items-center justify-center text-white font-bold text-xs mr-3 flex-shrink-0 shadow-lg">
                                            {msg.senderName?.substring(0, 2).toUpperCase() || '??'}
                                        </div>
                                        <div>
                                            <div className="flex items-baseline mb-1">
                                                <span className="font-bold text-rust-400 mr-2 text-sm">{msg.senderName}</span>
                                                <span className="text-xs text-neutral-600">
                                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                                </span>
                                            </div>
                                            <div className="bg-neutral-800 text-neutral-200 px-4 py-2 rounded-2xl rounded-tl-none shadow-md border border-neutral-700/50">
                                                {msg.content}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-neutral-900 border-t border-neutral-800">
                    <form onSubmit={handleSendMessage} className="flex gap-3">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Type a message to your team..."
                            className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-rust-500 focus:ring-1 focus:ring-rust-500 transition-all"
                        />
                        <button
                            type="submit"
                            disabled={!inputValue.trim() || !isConnected}
                            className="bg-rust-600 hover:bg-rust-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-all flex items-center shadow-lg shadow-rust-900/20"
                        >
                            <Send className="w-5 h-5 mr-2" />
                            Send
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
