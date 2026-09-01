"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { useState, useEffect } from "react";

export default function PrivyConnect() {
    const { ready, authenticated, login, logout } = usePrivy();
    const { wallets } = useWallets();
    const wallet = wallets?.[0];
    // Stamped with the address it was read for, so a wallet switch never shows the previous balance.
    const [fetched, setFetched] = useState<{ address: string; value: number | null } | null>(null);

    const address = authenticated ? wallet?.address ?? null : null;

    // Fetch USDC balance when wallet is connected
    useEffect(() => {
        if (!address) return;
        const controller = new AbortController();
        void (async () => {
            try {
                const response = await fetch("/api/getUsdcBalance", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ address }),
                    signal: controller.signal,
                });
                const data = response.ok ? await response.json() : null;
                setFetched({ address, value: data ? data.balance || 0 : null });
            } catch (error) {
                if (controller.signal.aborted) return;
                console.error("Failed to fetch USDC balance:", error);
                setFetched({ address, value: null });
            }
        })();
        return () => controller.abort();
    }, [address]);

    // Derived, not stored: disconnecting drops the balance without a setState in the effect.
    const usdcBalance = fetched?.address === address ? fetched.value : null;
    const loadingBalance = address !== null && fetched?.address !== address;

    if (!ready) {
        return <div>Loading...</div>;
    }

    if (!authenticated) {
        return (
            <button
                onClick={login}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
            >
                Connect Wallet
            </button>
        );
    }

    return (
        <div className="flex items-center gap-4">
            <div className="inline-flex items-center gap-4 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                <div className="flex items-center gap-2">
                    <span className="text-green-800">Connected:</span>
                    <span className="font-mono text-sm text-green-700">
                        {wallet?.address ? `${wallet.address.slice(0, 4)}...${wallet.address.slice(-4)}` : "No wallet"}
                    </span>
                </div>

                {/* USDC Balance */}
                <div className="flex items-center gap-2 border-l border-green-300 pl-4">
                    <span className="text-green-800">USDC:</span>
                    {loadingBalance ? (
                        <span className="text-green-700 text-sm">Loading...</span>
                    ) : (
                        <span className="font-semibold text-green-700">
                            {usdcBalance !== null ? `$${usdcBalance.toFixed(2)}` : "Error"}
                        </span>
                    )}
                    <a
                        href="https://spl-token-faucet.com/?token-name=USDC-Dev"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-sm ml-1"
                        title="Get dev USDC"
                    >
                        💧
                    </a>
                </div>
            </div>

            <button
                onClick={logout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors text-sm"
            >
                Disconnect
            </button>
        </div>
    );
}
