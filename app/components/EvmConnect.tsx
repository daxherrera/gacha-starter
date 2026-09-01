"use client";

import * as React from "react";
import { usePrivy, useWallets, useCreateWallet } from "@privy-io/react-auth";
import { formatEther, formatUnits } from "viem";
import { erc20Abi, testUsdcAbi } from "@/app/evm/abis";
import { FAUCETS, isMintableTestToken, VIEM_CHAINS } from "@/app/evm/chains";
import { getEvmClients, getReadClient } from "@/app/evm/clients";
import type { EvmLane } from "@/app/evm/types";

// Below this you cannot send approve + pay on any of these chains.
const LOW_GAS = 500_000_000_000_000n; // 0.0005 ETH

export default function EvmConnect({
    chainId,
    lane,
    refreshKey,
    onBalanceChange,
}: {
    chainId: number | null;
    lane: EvmLane | null;
    refreshKey: number;
    onBalanceChange?: () => void;
}) {
    const { ready, authenticated, login, logout } = usePrivy();
    // The ROOT useWallets is the Ethereum one. The Solana page imports it from /solana instead.
    const { wallets } = useWallets();
    const wallet = wallets?.[0];
    const { createWallet } = useCreateWallet();

    // Stamped with the (wallet, chain, token) it was read for: switching any of the three must not
    // leave the previous triple's balances on screen.
    const [read, setRead] = React.useState<{ key: string; token: bigint | null; gas: bigint | null } | null>(null);
    const [reloadKey, setReloadKey] = React.useState(0);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState(false);

    const address = wallet?.address as `0x${string}` | undefined;
    const readKey = `${address ?? ""}:${chainId ?? ""}:${lane?.address ?? ""}`;

    React.useEffect(() => {
        if (!address || !chainId || !lane || !VIEM_CHAINS[chainId]) return;
        const key = `${address}:${chainId}:${lane.address}`;
        let live = true;
        void (async () => {
            try {
                // A plain read client: on EVM, balances need no backend route at all.
                const pub = getReadClient(chainId);
                const [t, g] = await Promise.all([
                    pub.readContract({
                        address: lane.address,
                        abi: erc20Abi,
                        functionName: "balanceOf",
                        args: [address],
                    }),
                    pub.getBalance({ address }),
                ]);
                if (live) setRead({ key, token: t, gas: g });
            } catch (e) {
                console.error("balance read failed", e);
                if (live) setRead({ key, token: null, gas: null });
            }
        })();
        return () => {
            live = false;
        };
    }, [address, chainId, lane, refreshKey, reloadKey]);

    // Derived, not stored: an unreadable or superseded triple reads as "—" with no setState.
    const current = read?.key === readKey ? read : null;
    const tokenBal = current?.token ?? null;
    const gasBal = current?.gas ?? null;

    const copyAddress = async () => {
        if (!address) return;
        try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            setError("Clipboard blocked by the browser.");
        }
    };

    const mintTestUsdc = async () => {
        if (!wallet || !chainId || !lane) return;
        setBusy(true);
        setError(null);
        try {
            const { walletClient, publicClient } = await getEvmClients(wallet, chainId);
            const amount = 100n * 10n ** BigInt(lane.decimals);
            // Simulate first so we never offer a transaction that will revert.
            const { request } = await publicClient.simulateContract({
                account: wallet.address as `0x${string}`,
                address: lane.address,
                abi: testUsdcAbi,
                functionName: "mint",
                args: [wallet.address as `0x${string}`, amount],
            });
            const hash = await walletClient.writeContract(request);
            await publicClient.waitForTransactionReceipt({ hash });
            setReloadKey((k) => k + 1);
            onBalanceChange?.();
        } catch (e) {
            setError((e as Error).message.split("\n")[0]);
        } finally {
            setBusy(false);
        }
    };

    if (!ready) return <div>Loading...</div>;

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

    if (!wallet) {
        return (
            <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">No EVM wallet on this account.</span>
                <button
                    onClick={() => void createWallet()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold text-sm"
                >
                    Create an EVM wallet
                </button>
                <button onClick={logout} className="text-sm text-red-600 underline">
                    Disconnect
                </button>
            </div>
        );
    }

    const lowGas = gasBal !== null && gasBal < LOW_GAS;
    const canMint = !!chainId && !!lane && isMintableTestToken(chainId, lane.address);
    const faucets = chainId ? FAUCETS[chainId] ?? [] : [];

    return (
        <div className="inline-block text-left">
            <div className="flex flex-wrap items-center gap-4">
                <div className="inline-flex items-center gap-4 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                    <div className="flex items-center gap-2">
                        <span className="text-green-800">Connected:</span>
                        <span className="font-mono text-sm text-green-700">
                            {`${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`}
                        </span>
                        <button
                            onClick={() => void copyAddress()}
                            title={wallet.address}
                            aria-label="Copy wallet address"
                            className="text-xs text-green-800 border border-green-300 hover:bg-green-100 rounded px-2 py-0.5 font-medium"
                        >
                            {copied ? "Copied" : "Copy"}
                        </button>
                    </div>

                    <div className="flex items-center gap-2 border-l border-green-300 pl-4">
                        <span className="text-green-800">{lane?.symbol ?? "Token"}:</span>
                        <span className="font-semibold text-green-700">
                            {tokenBal !== null && lane ? formatUnits(tokenBal, lane.decimals) : "—"}
                        </span>
                    </div>

                    <div className="flex items-center gap-2 border-l border-green-300 pl-4">
                        <span className="text-green-800">ETH:</span>
                        <span className={`font-semibold ${lowGas ? "text-red-600" : "text-green-700"}`}>
                            {gasBal !== null ? Number(formatEther(gasBal)).toFixed(5) : "—"}
                        </span>
                    </div>
                </div>

                {canMint && (
                    <button
                        onClick={() => void mintTestUsdc()}
                        disabled={busy}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm text-white ${
                            busy ? "bg-gray-400 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700"
                        }`}
                    >
                        {busy ? "Minting..." : `Mint 100 ${lane?.symbol}`}
                    </button>
                )}

                <button
                    onClick={logout}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors text-sm"
                >
                    Disconnect
                </button>
            </div>

            {error && <p className="mt-2 text-sm text-red-600">Error: {error}</p>}

            {lowGas && (
                <p className="mt-2 text-sm text-amber-700 max-w-2xl">
                    You need native ETH on this chain. The machine sponsors the gas for the card mint only — your
                    approve, pay and sellBack are ordinary transactions you pay for.{" "}
                    {faucets.length > 0 ? (
                        <>
                            Faucets:{" "}
                            {faucets.map((f, i) => (
                                <span key={f.url}>
                                    {i > 0 && ", "}
                                    <a className="underline" href={f.url} target="_blank" rel="noopener noreferrer">
                                        {f.label}
                                    </a>
                                </span>
                            ))}
                        </>
                    ) : (
                        <>No public faucet for this chain — ask Collector Crypt.</>
                    )}
                </p>
            )}
        </div>
    );
}
