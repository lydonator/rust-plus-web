import Link from 'next/link';
import { Download, Puzzle, CheckCircle, ArrowRight, FolderOpen, Chrome, AlertTriangle } from 'lucide-react';

export default function ExtensionPage() {
    return (
        <div className="min-h-screen bg-neutral-950 text-white selection:bg-rust-500/30">
            {/* Hero Section */}
            <div className="relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-rust-900/20 via-neutral-950/0 to-neutral-950/0" />

                <div className="max-w-5xl mx-auto px-6 pt-24 pb-16 relative z-10">
                    <div className="text-center max-w-3xl mx-auto">
                        <div className="inline-flex items-center px-3 py-1 rounded-full bg-rust-500/10 border border-rust-500/20 text-rust-400 text-sm font-medium mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <Puzzle className="w-4 h-4 mr-2" />
                            Required for Authentication
                        </div>

                        <h1 className="text-5xl md:text-6xl font-bold mb-6 tracking-tight animate-in fade-in slide-in-from-bottom-5 duration-700 delay-100">
                            Install the <span className="bg-gradient-to-r from-rust-500 to-orange-500 bg-clip-text text-transparent">Rust+ Extension</span>
                        </h1>

                        <p className="text-xl text-neutral-400 mb-10 leading-relaxed animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200">
                            To connect your Steam account securely, you need our browser extension.
                            It handles the authentication bridge between Steam and the Rust+ API.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-7 duration-700 delay-300">
                            <a
                                href="/extension.zip"
                                download
                                className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-white transition-all duration-200 bg-rust-600 rounded-xl hover:bg-rust-500 hover:shadow-lg hover:shadow-rust-500/25 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rust-500 focus:ring-offset-neutral-900"
                            >
                                <Download className="w-5 h-5 mr-3 group-hover:-translate-y-1 transition-transform" />
                                Download Extension
                            </a>
                            <Link
                                href="/"
                                className="inline-flex items-center justify-center px-8 py-4 font-medium text-neutral-300 transition-all duration-200 bg-neutral-900 border border-neutral-800 rounded-xl hover:bg-neutral-800 hover:text-white hover:border-neutral-700"
                            >
                                I've installed it
                                <ArrowRight className="w-5 h-5 ml-2" />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Instructions Section */}
            <div className="max-w-5xl mx-auto px-6 pb-24">
                <div className="grid md:grid-cols-3 gap-8 relative">
                    {/* Connecting Line (Desktop) */}
                    <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-gradient-to-r from-neutral-800 via-rust-900/50 to-neutral-800 z-0" />

                    {/* Step 1 */}
                    <div className="relative z-10 group">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 h-full transition-all duration-300 hover:border-rust-500/30 hover:shadow-xl hover:shadow-rust-900/10">
                            <div className="w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center mb-6 text-2xl font-bold text-neutral-400 group-hover:bg-rust-500/20 group-hover:text-rust-500 transition-colors">
                                1
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3 flex items-center">
                                <Download className="w-5 h-5 mr-2 text-rust-500" />
                                Download & Extract
                            </h3>
                            <p className="text-neutral-400 leading-relaxed">
                                Download the zip file and extract it to a folder on your computer. Remember where you put it!
                            </p>
                        </div>
                    </div>

                    {/* Step 2 */}
                    <div className="relative z-10 group">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 h-full transition-all duration-300 hover:border-rust-500/30 hover:shadow-xl hover:shadow-rust-900/10">
                            <div className="w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center mb-6 text-2xl font-bold text-neutral-400 group-hover:bg-rust-500/20 group-hover:text-rust-500 transition-colors">
                                2
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3 flex items-center">
                                <Chrome className="w-5 h-5 mr-2 text-rust-500" />
                                Open Extensions
                            </h3>
                            <p className="text-neutral-400 leading-relaxed">
                                Go to <code className="bg-neutral-950 px-2 py-1 rounded text-rust-400 text-sm">chrome://extensions</code> in your browser. Enable <span className="text-white font-medium">Developer mode</span> in the top right.
                            </p>
                        </div>
                    </div>

                    {/* Step 3 */}
                    <div className="relative z-10 group">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 h-full transition-all duration-300 hover:border-rust-500/30 hover:shadow-xl hover:shadow-rust-900/10">
                            <div className="w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center mb-6 text-2xl font-bold text-neutral-400 group-hover:bg-rust-500/20 group-hover:text-rust-500 transition-colors">
                                3
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3 flex items-center">
                                <FolderOpen className="w-5 h-5 mr-2 text-rust-500" />
                                Load Unpacked
                            </h3>
                            <p className="text-neutral-400 leading-relaxed">
                                Click <span className="text-white font-medium">Load unpacked</span> and select the folder you extracted. The extension is now installed!
                            </p>
                        </div>
                    </div>
                </div>

                {/* Troubleshooting / Note */}
                <div className="mt-12 bg-rust-900/10 border border-rust-500/20 rounded-xl p-6 flex items-start gap-4 max-w-3xl mx-auto">
                    <AlertTriangle className="w-6 h-6 text-rust-500 flex-shrink-0 mt-1" />
                    <div>
                        <h4 className="text-lg font-bold text-white mb-1">Why do I need to do this?</h4>
                        <p className="text-neutral-400">
                            Due to Chrome Web Store restrictions on authentication bridges, we host the extension ourselves.
                            The code is open source and safe to use. This extension only runs on our website to handle the Steam login.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
