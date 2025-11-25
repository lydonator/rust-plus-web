export default function PrivacyPolicy() {
    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
                <p className="text-gray-400 mb-8">Rust+ Steam Auth Bridge Chrome Extension</p>
                <p className="text-gray-400 mb-8">Last Updated: November 25, 2025</p>

                <section className="mb-8">
                    <h2 className="text-2xl font-semibold mb-4">Overview</h2>
                    <p className="text-gray-300 mb-4">
                        This privacy policy applies to the Rust+ Steam Auth Bridge Chrome extension.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl font-semibold mb-4">What the Extension Does</h2>
                    <p className="text-gray-300 mb-4">
                        The Rust+ Steam Auth Bridge extension performs a simple URL redirect to enable
                        Steam authentication for the Rust+ Web application. When you authenticate with
                        Steam, the extension redirects the authentication callback from localhost to
                        app.rustplus.online.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl font-semibold mb-4">Data Collection</h2>
                    <p className="text-gray-300 mb-4 text-xl font-semibold">
                        This extension does NOT collect, store, or transmit any user data.
                    </p>
                    <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2">
                        <li>No personal information is collected</li>
                        <li>No browsing history is tracked</li>
                        <li>No authentication credentials are accessed or stored</li>
                        <li>No analytics or telemetry data is collected</li>
                        <li>No cookies are used</li>
                    </ul>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl font-semibold mb-4">Permissions Explained</h2>

                    <h3 className="text-xl font-semibold mb-3 mt-6">declarativeNetRequest</h3>
                    <p className="text-gray-300 mb-4">
                        This permission is used solely to redirect localhost URLs to the production domain
                        (app.rustplus.online). The extension does not access, read, or modify the content
                        of any URLs. It only performs a transparent redirect to enable authentication functionality.
                    </p>

                    <h3 className="text-xl font-semibold mb-3 mt-6">host_permissions (localhost)</h3>
                    <p className="text-gray-300 mb-4">
                        This permission is required to detect when authentication callbacks arrive at localhost.
                        The extension only monitors URLs matching the specific pattern{' '}
                        <code className="bg-gray-800 px-2 py-1 rounded">/api/auth/callback*</code>.
                        No localhost data is accessed, stored, or transmitted.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl font-semibold mb-4">Third-Party Services</h2>
                    <p className="text-gray-300 mb-4">
                        This extension does not communicate with any third-party services. It only performs
                        local URL redirection within your browser.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl font-semibold mb-4">Open Source</h2>
                    <p className="text-gray-300 mb-4">
                        The extension code is minimal and transparent. You can review the source code to
                        verify that no data collection or tracking occurs.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl font-semibold mb-4">Changes to This Policy</h2>
                    <p className="text-gray-300 mb-4">
                        We may update this privacy policy from time to time. Any changes will be reflected
                        on this page with an updated "Last Updated" date.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl font-semibold mb-4">Contact</h2>
                    <p className="text-gray-300 mb-4">
                        For questions or concerns about this privacy policy, please contact:
                    </p>
                    <p className="text-gray-300">
                        <strong>Email:</strong>{' '}
                        <a href="mailto:support@rustplus.online" className="text-blue-400 hover:underline">
                            support@rustplus.online
                        </a>
                    </p>
                </section>

                <div className="mt-12 pt-8 border-t border-gray-700">
                    <p className="text-gray-400 text-sm">
                        This privacy policy is effective as of November 25, 2025 and applies to the
                        Rust+ Steam Auth Bridge Chrome extension.
                    </p>
                </div>
            </div>
        </div>
    );
}
