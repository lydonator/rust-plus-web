/**
 * FACEPUNCH TOKEN EXTRACTOR
 * 
 * This content script runs on companion-rust.facepunch.com
 * and extracts the Facepunch auth token from the success page
 */

// Only run on the Facepunch companion site
if (window.location.hostname === 'companion-rust.facepunch.com') {
    console.log('[Facepunch Extractor] Running on Facepunch site');

    // Wait for page to load
    window.addEventListener('load', () => {
        // Look for the script tag containing the token
        const scripts = document.querySelectorAll('script');

        for (const script of scripts) {
            const content = script.textContent || '';

            // Look for the postMessage call with the token
            const match = content.match(/postMessage\('({.*?})'\)/);

            if (match) {
                try {
                    const data = JSON.parse(match[1]);
                    const { SteamId, Token } = data;

                    console.log('[Facepunch Extractor] ✅ Token found!');
                    console.log('[Facepunch Extractor] SteamID:', SteamId);

                    // Send to your web app
                    sendTokenToWebApp(SteamId, Token);

                } catch (e) {
                    console.error('[Facepunch Extractor] Failed to parse token:', e);
                }
                break;
            }
        }
    });
}

function sendTokenToWebApp(steamId: string, token: string) {
    // Option 1: Post message to opener (if opened from your app)
    if (window.opener) {
        window.opener.postMessage({
            type: 'FACEPUNCH_TOKEN',
            steamId,
            token
        }, process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

        console.log('[Facepunch Extractor] Token sent to opener window');
    }

    // Option 2: Send directly to your API
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/auth/facepunch/save-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies
        body: JSON.stringify({ steamId, token })
    })
        .then(response => {
            if (response.ok) {
                console.log('[Facepunch Extractor] ✅ Token saved to backend!');

                // Show success message on page
                showSuccessMessage();
            } else {
                console.error('[Facepunch Extractor] Failed to save token');
            }
        })
        .catch(error => {
            console.error('[Facepunch Extractor] Error saving token:', error);
        });
}

function showSuccessMessage() {
    // Create a success banner
    const banner = document.createElement('div');
    banner.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #10b981;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        font-weight: 500;
    `;
    banner.textContent = '✅ Facepunch token saved! You can close this window.';
    document.body.appendChild(banner);

    // Auto-close after 3 seconds if opened as popup
    if (window.opener) {
        setTimeout(() => {
            window.close();
        }, 3000);
    }
}
