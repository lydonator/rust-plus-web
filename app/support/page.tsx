import React from 'react';
import Head from 'next/head';

export default function SupportPage() {
    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
            <Head>
                <title>Support - Rust+ Steam Auth Bridge</title>
                <meta name="description" content="Support and Help Center for the Rust+ Steam Auth Bridge extension." />
            </Head>
            <div className="max-w-4xl mx-auto">
                <h1 className="text-4xl font-bold mb-8">Support & Help Center</h1>
                <p className="text-gray-400 mb-8">Rust+ Steam Auth Bridge</p>

                <section className="mb-8">
                    <h2 className="text-2xl font-semibold mb-4">About the Extension</h2>
                    <p className="text-gray-300 mb-4">
                        The Rust+ Steam Auth Bridge is a helper extension for Firefox designed to facilitate the authentication process between Steam and the Rust+ Web Tool.
                    </p>
                    <p className="text-gray-300 mb-4">
                        Its sole purpose is to securely redirect the local authentication callback from Steam to the web application, allowing you to log in without needing to run a local server manually.
                    </p>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl font-semibold mb-4">Frequently Asked Questions</h2>

                    <div className="mb-6">
                        <h3 className="text-xl font-semibold mb-2">Why do I need this extension?</h3>
                        <p className="text-gray-300">
                            Steam's OpenID authentication requires a return URL. Without getting too into the technical weeds, Facepunch's Companion API only supports "localhost" callback as a valid login domain, which would typically be your mobile phone. This extension bridges that local callback to our secure web application, ensuring a seamless login experience.
                        </p>
                    </div>

                    <div className="mb-6">
                        <h3 className="text-xl font-semibold mb-2">Does this extension collect my data?</h3>
                        <p className="text-gray-300">
                            No. This extension does not collect, store, or transmit any personal user data. It only operates on specific authentication URLs to perform a redirect. You can verify this in our privacy policy.
                        </p>
                    </div>

                    <div className="mb-6">
                        <h3 className="text-xl font-semibold mb-2">Is it safe?</h3>
                        <p className="text-gray-300">
                            Yes. The extension requires minimal permissions and only runs on the specific URLs needed for authentication. The source code is transparent and reviewed by Mozilla.
                        </p>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl font-semibold mb-4">Contact Support</h2>
                    <p className="text-gray-300 mb-4">
                        If you are experiencing issues or have further questions, please reach out to us:
                    </p>
                    <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2">
                        <li>
                            <strong>Email:</strong>{' '}
                            <a href="mailto:support@rustplus.online" className="text-blue-400 hover:underline">
                                support@rustplus.online
                            </a>
                        </li>
                        <li>
                            <strong>Discord:</strong>{' '}
                            <a href="#" className="text-blue-400 hover:underline">
                                Join our Community
                            </a>
                        </li>
                    </ul>
                </section>

                <div className="mt-12 pt-8 border-t border-gray-700">
                    <p className="text-gray-400 text-sm">
                        &copy; {new Date().getFullYear()} Rust+ Web Tool. All rights reserved.
                    </p>
                </div>
            </div>
        </div>
    );
}
