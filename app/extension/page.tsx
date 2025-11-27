import Link from 'next/link';
import { CheckCircle, ArrowRight, Chrome, Shield, Zap } from 'lucide-react';

export default function ExtensionPage() {
    return (
        <div className="min-h-screen bg-neutral-950 text-white selection:bg-rust-500/30">
            {/* Hero Section */}
            <div className="relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-rust-900/20 via-neutral-950/0 to-neutral-950/0" />

                <div className="max-w-5xl mx-auto px-6 pt-24 pb-16 relative z-10">
                    <div className="text-center max-w-3xl mx-auto">
                        <div className="inline-flex items-center px-3 py-1 rounded-full bg-rust-500/10 border border-rust-500/20 text-rust-400 text-sm font-medium mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <Chrome className="w-4 h-4 mr-2" />
                            Required for Authentication
                        </div>

                        <h1 className="text-5xl md:text-6xl font-bold mb-6 tracking-tight animate-in fade-in slide-in-from-bottom-5 duration-700 delay-100">
                            Install the <span className="bg-gradient-to-r from-rust-500 to-orange-500 bg-clip-text text-transparent">Rust+ Extension</span>
                        </h1>

                        <p className="text-xl text-neutral-400 mb-10 leading-relaxed animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200">
                            To use Rust+ features on the web, you'll need our browser extension.
                            It securely connects your account to our platform.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-7 duration-700 delay-300">
                            <a
                                href="https://chromewebstore.google.com/detail/rust+-steam-auth-bridge/fcmpichfmbemdjlnpkgocalhjjpbdnen"
                                className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-white transition-all duration-200 bg-rust-600 rounded-xl hover:bg-rust-500 hover:shadow-lg hover:shadow-rust-500/25 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rust-500 focus:ring-offset-neutral-900"
                            >
                                <Chrome className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform" />
                                Add to Chrome
                            </a>
                            <Link
                                href="/"
                                className="inline-flex items-center justify-center px-8 py-4 font-medium text-neutral-300 transition-all duration-200 bg-neutral-900 border border-neutral-800 rounded-xl hover:bg-neutral-800 hover:text-white hover:border-neutral-700"
                            >
                                Continue to Login
                                <ArrowRight className="w-5 h-5 ml-2" />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Features Section */}
            <div className="max-w-5xl mx-auto px-6 pb-24">
                <div className="grid md:grid-cols-3 gap-8">
                    {/* Feature 1 */}
                    <div className="relative z-10 group">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 h-full transition-all duration-300 hover:border-rust-500/30 hover:shadow-xl hover:shadow-rust-900/10">
                            <div className="w-12 h-12 rounded-xl bg-rust-500/20 flex items-center justify-center mb-6 group-hover:bg-rust-500/30 transition-colors">
                                <Shield className="w-6 h-6 text-rust-500" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">
                                Secure Authentication
                            </h3>
                            <p className="text-neutral-400 leading-relaxed">
                                Safely bridges Steam login to the Facepunch Companion API without exposing your credentials.
                            </p>
                        </div>
                    </div>

                    {/* Feature 2 */}
                    <div className="relative z-10 group">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 h-full transition-all duration-300 hover:border-rust-500/30 hover:shadow-xl hover:shadow-rust-900/10">
                            <div className="w-12 h-12 rounded-xl bg-rust-500/20 flex items-center justify-center mb-6 group-hover:bg-rust-500/30 transition-colors">
                                <Zap className="w-6 h-6 text-rust-500" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">
                                One-Click Install
                            </h3>
                            <p className="text-neutral-400 leading-relaxed">
                                Install directly from the Chrome Web Store with a single click. No manual setup required.
                            </p>
                        </div>
                    </div>

                    {/* Feature 3 */}
                    <div className="relative z-10 group">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 h-full transition-all duration-300 hover:border-rust-500/30 hover:shadow-xl hover:shadow-rust-900/10">
                            <div className="w-12 h-12 rounded-xl bg-rust-500/20 flex items-center justify-center mb-6 group-hover:bg-rust-500/30 transition-colors">
                                <CheckCircle className="w-6 h-6 text-rust-500" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">
                                Lightweight & Fast
                            </h3>
                            <p className="text-neutral-400 leading-relaxed">
                                Minimal footprint, only activates when needed. Won't slow down your browser.
                            </p>
                        </div>
                    </div>
                </div>

                {/* How it Works */}
                <div className="mt-16 bg-gradient-to-br from-neutral-900 to-neutral-900/50 border border-neutral-800 rounded-2xl p-8 max-w-3xl mx-auto">
                    <h3 className="text-2xl font-bold text-white mb-4 flex items-center">
                        <Chrome className="w-6 h-6 mr-3 text-rust-500" />
                        How It Works
                    </h3>
                    <div className="space-y-3 text-neutral-400">
                        <p>
                            The Rust+ Companion API requires a special authentication flow that browsers can't handle directly.
                        </p>
                        <p>
                            This extension enables secure communication between your browser and our web application, allowing you to access all Rust+ features without compromising your account security.
                        </p>
                        <p className="text-sm text-neutral-500 pt-2">
                            The extension is <span className="text-rust-400 font-medium">open source</span> and only activates on this website. Your credentials are never stored or transmitted to our servers.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
