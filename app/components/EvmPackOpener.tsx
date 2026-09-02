"use client";

import * as React from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { buyPack, sellCard } from "@/app/evm/flows";
import { PackExpiredError } from "@/app/evm/api";
import { explorerTokenUrl, explorerTxUrl } from "@/app/evm/chains";
import { evmAttr, evmCardImage, type EvmChainInfo, type EvmLane, type EvmOpenPack } from "@/app/evm/types";
import { sellBlockedReason } from "./EvmChainPicker";
import { errorText } from "@/app/evm/errors";

const rarityClass = (label?: string) => {
    switch ((label ?? "").toLowerCase()) {
        case "epic":
            return "bg-orange-200 text-orange-800";
        case "rare":
            return "bg-purple-200 text-purple-800";
        case "uncommon":
            return "bg-blue-200 text-blue-800";
        default:
            return "bg-green-200 text-green-800";
    }
};

export default function EvmPackOpener({
    chain,
    lane,
    packType,
    disabledReason,
    onChanged,
}: {
    chain: EvmChainInfo | null;
    lane: EvmLane | null;
    packType: string;
    disabledReason: string | null;
    onChanged: () => void;
}) {
    const { ready, authenticated } = usePrivy();
    const { wallets } = useWallets();
    const wallet = wallets?.[0];

    const [busy, setBusy] = React.useState(false);
    const [status, setStatus] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [result, setResult] = React.useState<EvmOpenPack | null>(null);

    const open = async () => {
        if (!wallet || !chain || !lane) return;
        setBusy(true);
        setError(null);
        setStatus(null);
        try {
            const award = await buyPack({ wallet, chainId: chain.chainId, lane, packType, onProgress: setStatus });
            setResult(award);
        } catch (e) {
            // Never clear the pending record here — the resume banner is what turns a paid pack into a
            // card if this threw after pay() landed.
            setError(
                e instanceof PackExpiredError
                    ? "That pack is more than 2 hours old and can no longer be opened."
                    : errorText(e),
            );
        } finally {
            setBusy(false);
            setStatus(null);
            onChanged();
        }
    };

    if (!ready || !authenticated || !wallet) return null;

    const blocked = disabledReason ?? (!chain || !lane ? "pick a chain and a lane" : null);

    return (
        <div>
            <div className="flex flex-wrap items-center gap-4">
                <button
                    onClick={() => void open()}
                    disabled={busy || !!blocked}
                    title={blocked ?? undefined}
                    className={`px-6 py-3 rounded-lg font-semibold text-white transition-colors ${
                        busy || blocked ? "bg-gray-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"
                    }`}
                >
                    {busy ? "Opening Pack..." : `Open ${packType} pack${lane ? ` with ${lane.symbol}` : ""}`}
                </button>
                {status && <span className="text-sm text-gray-600">{status}</span>}
                {blocked && !busy && <span className="text-sm text-gray-500">{blocked}</span>}
            </div>

            {error && <div className="mt-2 text-sm text-red-600">Error: {error}</div>}

            {result && (
                <EvmPackResultCard
                    award={result}
                    chain={chain}
                    onClose={() => {
                        setResult(null);
                        onChanged();
                    }}
                    onSold={onChanged}
                />
            )}
        </div>
    );
}

function EvmPackResultCard({
    award,
    chain,
    onClose,
    onSold,
}: {
    award: EvmOpenPack;
    chain: EvmChainInfo | null;
    onClose: () => void;
    onSold: () => void;
}) {
    const image = evmCardImage(award.nftWon);
    const grade = evmAttr(award.nftWon, "The Grade") ?? "N/A";
    const txUrl = explorerTxUrl(award.chain_id, award.transaction_signature);
    const tokenUrl = explorerTokenUrl(award.chain_id, award.evm_contract_address, award.evm_token_id);

    return (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">🎉 You Won!</h2>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl font-bold">
                            ×
                        </button>
                    </div>

                    <div className="bg-gradient-to-br from-purple-100 to-blue-100 rounded-lg p-6">
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="flex-shrink-0">
                                {image && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={image}
                                        alt={award.nftWon?.content?.metadata?.name ?? award.nft_address}
                                        className="w-64 h-auto rounded-lg shadow-lg"
                                    />
                                )}
                            </div>

                            <div className="flex-1 space-y-4">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                                        {award.nftWon?.content?.metadata?.name ?? award.card_name ?? award.nft_address}
                                    </h3>
                                    <div className="flex gap-4 mb-4">
                                        {/* rarity_label, not rarity: `rarity` is lowercase on EVM. */}
                                        <span
                                            className={`px-3 py-1 rounded-full text-sm font-semibold ${rarityClass(
                                                award.rarity_label,
                                            )}`}
                                        >
                                            {award.rarity_label}
                                        </span>
                                        <span className="px-3 py-1 bg-blue-200 text-blue-800 rounded-full text-sm font-semibold">
                                            Grade: {grade}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="font-semibold text-gray-600">Insured Value:</span>
                                        {/* Whole USD on EVM — printed, never divided. */}
                                        <div className="text-lg font-bold text-green-600">${award.insured_value}</div>
                                    </div>
                                    <div>
                                        <span className="font-semibold text-gray-600">Chain:</span>
                                        <div className="text-lg font-bold text-gray-800">
                                            {chain?.name ?? award.chain_key}{" "}
                                            <span className="text-sm font-normal text-gray-500">({award.chain_id})</span>
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <span className="font-semibold text-gray-600">Token:</span>{" "}
                                        {tokenUrl ? (
                                            <a
                                                className="text-xs font-mono break-all text-blue-700 underline"
                                                href={tokenUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                #{award.evm_token_id} · {award.evm_contract_address}
                                            </a>
                                        ) : (
                                            <span className="text-xs font-mono break-all text-gray-800">
                                                #{award.evm_token_id} · {award.evm_contract_address}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-white/60 rounded-lg p-3">
                                    <h4 className="font-semibold text-gray-700 mb-2 text-sm">Mint transaction</h4>
                                    {txUrl ? (
                                        <a
                                            className="text-xs font-mono break-all text-blue-700 underline"
                                            href={txUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            {award.transaction_signature}
                                        </a>
                                    ) : (
                                        <div className="text-xs font-mono break-all text-gray-600">
                                            {award.transaction_signature}
                                        </div>
                                    )}
                                    <a
                                        className="text-xs text-blue-700 underline mt-2 inline-block"
                                        href={`/api/evm/vrf/verify?memo=${encodeURIComponent(award.memo)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        Verify this roll (roll {award.roll})
                                    </a>
                                </div>

                                <SellButton
                                    card={{
                                        memo: award.memo,
                                        chainId: award.chain_id,
                                        tokenId: award.evm_token_id,
                                        contract: award.evm_contract_address,
                                    }}
                                    blockedReason={chain ? sellBlockedReason(chain) : null}
                                    onSold={() => {
                                        onSold();
                                        onClose();
                                    }}
                                    secondary={
                                        <button
                                            onClick={onClose}
                                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-semibold transition-colors text-sm"
                                        >
                                            Close
                                        </button>
                                    }
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** The price is never computed here — it comes back on the signed quote. */
export function SellButton({
    card,
    blockedReason,
    onSold,
    secondary,
}: {
    card: { memo: string; chainId: number; tokenId: string; contract: `0x${string}` };
    blockedReason: string | null;
    onSold: () => void;
    secondary?: React.ReactNode;
}) {
    const { wallets } = useWallets();
    const wallet = wallets?.[0];
    const [busy, setBusy] = React.useState(false);
    const [status, setStatus] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    const sell = async () => {
        if (!wallet) return;
        setBusy(true);
        setError(null);
        try {
            const { refundAmount, symbol } = await sellCard({ wallet, card, onProgress: setStatus });
            setStatus(`Sold for ${refundAmount} ${symbol}`);
            onSold();
        } catch (e) {
            setError(errorText(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-2">
            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">Error: {error}</p>
                </div>
            )}
            {status && !error && <p className="text-sm text-gray-600">{status}</p>}
            <div className="flex gap-3 pt-2">
                <button
                    onClick={() => void sell()}
                    disabled={busy || !!blockedReason || !wallet}
                    title={blockedReason ?? undefined}
                    className={`flex-1 py-2 px-4 rounded-lg font-semibold text-white transition-colors text-sm ${
                        busy || blockedReason ? "bg-gray-400 cursor-not-allowed" : "bg-orange-600 hover:bg-orange-700"
                    }`}
                >
                    {busy ? "Processing..." : blockedReason ? `Sell unavailable — ${blockedReason}` : "Get sell quote"}
                </button>
                {secondary}
            </div>
        </div>
    );
}
