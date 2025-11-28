import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Steam Overlay Setup - Rust+ Web</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body {
            background: rgb(6, 6, 6);
            color: white;
          }
        </style>
    </head>
    <body class="bg-neutral-950 text-white">
        <div class="min-h-screen bg-neutral-950 text-white">
            <!-- Hero Section -->
            <div class="relative overflow-hidden">
                <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-900/20 via-neutral-950/0 to-neutral-950/0"></div>

                <div class="max-w-5xl mx-auto px-6 pt-24 pb-16 relative z-10">
                    <div class="text-center max-w-3xl mx-auto">
                        <div class="inline-flex items-center px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm font-medium mb-6">
                            🎮 <span style="color: rgb(251, 146, 60);">Steam Overlay Setup</span>
                        </div>

                        <h1 class="text-5xl md:text-6xl font-bold mb-6 tracking-tight">
                            Authenticate for <span style="background: linear-gradient(to right, rgb(249, 115, 22), rgb(234, 88, 12)); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Rust+</span> <span style="color: rgb(220, 38, 38);">Web</span>
                        </h1>

                        <p class="text-xl text-neutral-400 mb-10 leading-relaxed">
                            To use Rust+ in your Steam overlay browser, paste your authentication token below.
                        </p>
                    </div>
                </div>
            </div>

            <!-- Setup Section -->
            <div class="max-w-3xl mx-auto px-6 pb-24">
                <div class="bg-neutral-900 border border-neutral-800 rounded-2xl p-8">
                    <h2 class="text-2xl font-bold text-white mb-6">Instructions</h2>
                    
                    <div class="space-y-4 text-neutral-400 mb-8">
                        <div class="flex gap-4">
                            <div class="flex-shrink-0">
                                <div class="flex items-center justify-center h-8 w-8 rounded-full bg-orange-500/20 text-orange-400 font-bold" style="background-color: rgba(251, 146, 60, 0.2); color: rgb(251, 146, 60);">1</div>
                            </div>
                            <div>
                                <p class="font-medium text-white">Open your main browser with the extension installed</p>
                            </div>
                        </div>

                        <div class="flex gap-4">
                            <div class="flex-shrink-0">
                                <div class="flex items-center justify-center h-8 w-8 rounded-full bg-orange-500/20 text-orange-400 font-bold" style="background-color: rgba(251, 146, 60, 0.2); color: rgb(251, 146, 60);">2</div>
                            </div>
                            <div>
                                <p class="font-medium text-white">Open DevTools (F12) → Application → Cookies</p>
                                <p class="text-sm text-neutral-500 mt-1">Find the <code style="background-color: rgb(38, 38, 38); padding: 2px 6px; border-radius: 4px; color: rgb(251, 146, 60);">auth-token</code> cookie and copy its value</p>
                            </div>
                        </div>

                        <div class="flex gap-4">
                            <div class="flex-shrink-0">
                                <div class="flex items-center justify-center h-8 w-8 rounded-full bg-orange-500/20 text-orange-400 font-bold" style="background-color: rgba(251, 146, 60, 0.2); color: rgb(251, 146, 60);">3</div>
                            </div>
                            <div>
                                <p class="font-medium text-white">Paste it below and click "Set Authentication"</p>
                            </div>
                        </div>
                    </div>

                    <div style="background-color: rgba(251, 146, 60, 0.05); border: 1px solid rgba(251, 146, 60, 0.2); border-radius: 12px; padding: 16px; margin-bottom: 32px;">
                        <p class="text-sm" style="color: rgb(253, 152, 67);">
                            <strong>🔒 Your Privacy:</strong> This page only runs in your browser. Your token is never sent to our servers.
                        </p>
                    </div>

                    <div class="space-y-4">
                        <label for="tokenInput" class="block text-sm font-medium text-white">Authentication Token</label>
                        <textarea 
                            id="tokenInput" 
                            placeholder="Paste your auth-token value here..."
                            style="background-color: rgb(31, 31, 31); border: 1px solid rgb(38, 38, 38); border-radius: 12px; padding: 12px; color: white; font-family: monospace; font-size: 14px; color: rgb(168, 162, 158); resize: none; width: 100%; height: 128px;"
                        ></textarea>

                        <button 
                            onclick="setCookie()" 
                            style="width: 100%; background-color: rgb(234, 88, 12); color: white; font-weight: bold; padding: 16px 24px; border-radius: 12px; border: none; cursor: pointer; transition: all 200ms; box-shadow: 0 0 0 0 rgba(234, 88, 12, 0);"
                            onmouseover="this.style.backgroundColor='rgb(249, 115, 22)'; this.style.boxShadow='0 10px 15px rgba(234, 88, 12, 0.3)';"
                            onmouseout="this.style.backgroundColor='rgb(234, 88, 12)'; this.style.boxShadow='0 0 0 0 rgba(234, 88, 12, 0)';"
                        >
                            Set Authentication Cookie
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <script>
            function setCookie() {
                const token = document.getElementById('tokenInput').value.trim();
                if (!token) {
                    alert('Please paste your token first');
                    return;
                }
                document.cookie = "auth-token=" + token + "; path=/; domain=app.rustplus.online; max-age=31536000";
                alert('Cookie set! Redirecting to dashboard...');
                window.location.href = '/dashboard';
            }
        </script>
    </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}