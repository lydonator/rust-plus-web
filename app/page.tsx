import Link from 'next/link';

export default function Home() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-zinc-900 text-white">
            <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
                <h1 className="text-4xl font-bold text-red-500 mb-8">Rust+ Web</h1>
            </div>

            <div className="relative flex place-items-center">
                <Link
                    href="/api/auth/steam"
                    className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
                >
                    <h2 className={`mb-3 text-2xl font-semibold`}>
                        Login with Steam{' '}
                        <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
                            -&gt;
                        </span>
                    </h2>
                    <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
                        Connect your Steam account to manage your Rust servers.
                    </p>
                </Link>
            </div>
        </main>
    );
}
