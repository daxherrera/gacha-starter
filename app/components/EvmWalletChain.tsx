"use client";

import * as React from "react";
import type { ConnectedWallet } from "@privy-io/react-auth";
import { chainLabel } from "@/app/evm/chains";
import { ensureWalletChain, readWalletChainId } from "@/app/evm/clients";

/**
 * A Privy embedded wallet has no UI of its own (showWalletUIs: false), so the chain it will actually
 * sign on is otherwise invisible — and it starts on Ethereum mainnet, not the chain picked below.
 */
export default function EvmWalletChain({
    wallet,
    chainId,
    onSwitched,
}: {
    wallet: ConnectedWallet;
    /** The chain the page is buying on. null until GET /api/evm/chains answers. */
    chainId: number | null;
    onSwitched?: () => void;
}) {
    const [walletChain, setWalletChain] = React.useState<number | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    // Privy hands back a new wallet object per render, so key the read on its address and chain and
    // reach for the object through a ref: a `wallet` dep would re-read on every unrelated render.
    const walletRef = React.useRef(wallet);
    React.useEffect(() => {
        walletRef.current = wallet;
    });
    const address = wallet.address;
    const privyChain = wallet.chainId;

    React.useEffect(() => {
        let live = true;
        void (async () => {
            try {
                const id = await readWalletChainId(walletRef.current);
                if (live) setWalletChain(id);
            } catch (e) {
                console.error("wallet chain read failed", e);
                if (live) setWalletChain(null);
            }
        })();
        return () => {
            live = false;
        };
    }, [address, privyChain]);

    const switchNow = async () => {
        if (!chainId) return;
        setBusy(true);
        setError(null);
        try {
            await ensureWalletChain(walletRef.current, chainId);
            // ensureWalletChain only returns once the provider itself reports this chain, so believe it
            // rather than re-reading through a wallet object Privy may not have refreshed yet.
            setWalletChain(chainId);
            onSwitched?.();
        } catch (e) {
            setError((e as Error).message.split("\n")[0]);
        } finally {
            setBusy(false);
        }
    };

    const matched = chainId !== null && walletChain === chainId;

    return (
        <div className="inline-block text-left">
            <div className="flex items-center gap-3">
                <div
                    className={`inline-flex items-center gap-2 border rounded-lg px-4 py-2 ${
                        matched ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-300"
                    }`}
                >
                    <span className={matched ? "text-green-800" : "text-amber-800"}>Wallet chain:</span>
                    <span className={`font-semibold ${matched ? "text-green-700" : "text-amber-900"}`}>
                        {walletChain === null ? "—" : `${chainLabel(walletChain)} (${walletChain})`}
                    </span>
                </div>

                {chainId !== null && !matched && (
                    <button
                        onClick={() => void switchNow()}
                        disabled={busy}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm text-white ${
                            busy ? "bg-gray-400 cursor-not-allowed" : "bg-amber-600 hover:bg-amber-700"
                        }`}
                    >
                        {busy ? "Switching..." : `Switch to ${chainLabel(chainId)}`}
                    </button>
                )}
            </div>

            {chainId !== null && !matched && walletChain !== null && (
                <p className="mt-2 text-sm text-amber-700 max-w-2xl">
                    Every transaction below switches the wallet for you first, so this is a readout, not a
                    prerequisite — but a wallet on the wrong chain is worth seeing.
                </p>
            )}
            {error && <p className="mt-2 text-sm text-red-600">Switch failed: {error}</p>}
        </div>
    );
}
