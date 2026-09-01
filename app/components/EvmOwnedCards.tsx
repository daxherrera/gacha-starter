"use client";

import * as React from "react";
import { useWallets } from "@privy-io/react-auth";
import { evmGet } from "@/app/evm/api";
import { explorerTokenUrl } from "@/app/evm/chains";
import { fetchOwnedNfts, MAX_OWNED, pooled, type OwnedNft } from "@/app/evm/owned";
import type { OwnedCard } from "@/app/evm/resume";
import type { EvmBuybackAvailable, EvmChainInfo } from "@/app/evm/types";
import { SellButton } from "./EvmPackOpener";
import { sellBlockedReason } from "./EvmChainPicker";

type Availability = Record<string, EvmBuybackAvailable | undefined>;

/**
 * The cards this wallet holds on the SELECTED chain, read from the card contract.
 *
 * localStorage is no longer the source of truth here — it only enriches what the chain confirms (the
 * memo, and the award's own image and rarity, neither of which is in the token metadata).
 */
export default function EvmOwnedCards({
    chain,
    localCards,
    refreshKey,
    onChanged,
}: {
    chain: EvmChainInfo | null;
    localCards: OwnedCard[];
    refreshKey: number;
    onChanged: () => void;
}) {
    const { wallets } = useWallets();
    const owner = wallets?.[0]?.address as `0x${string}` | undefined;
    const contract = chain?.cardContract ?? null;
    const chainId = chain?.chainId ?? null;

    // Stamped with the (owner, chain, contract) it was read for: switching chain must never leave the
    // previous chain's cards on screen, which would invite a sell against the wrong contract.
    const key = `${owner ?? ""}:${chainId ?? ""}:${contract ?? ""}`;
    const [load, setLoad] = React.useState<{
        key: string;
        state: "loading" | "ready" | "error";
        total: number;
        nfts: OwnedNft[];
        error?: string;
    } | null>(null);
    const [avail, setAvail] = React.useState<Availability>({});
    const [reloadKey, setReloadKey] = React.useState(0);

    React.useEffect(() => {
        if (!owner || !chainId || !contract) return;
        const mine = `${owner}:${chainId}:${contract}`;
        let live = true;
        void (async () => {
            setLoad({ key: mine, state: "loading", total: 0, nfts: [] });
            try {
                const { total, nfts } = await fetchOwnedNfts(chainId, contract, owner);
                if (live) setLoad({ key: mine, state: "ready", total, nfts });
            } catch (e) {
                console.error("owned nft read failed", e);
                if (live) {
                    setLoad({ key: mine, state: "error", total: 0, nfts: [], error: (e as Error).message.split("\n")[0] });
                }
            }
        })();
        return () => {
            live = false;
        };
    }, [owner, chainId, contract, refreshKey, reloadKey]);

    const current = load?.key === key ? load : null;
    const nfts = current?.state === "ready" ? current.nfts : [];

    // A second pass, because it is the only number here that is not on-chain: the buyback window and
    // percentage live on the server. One pure read per card, never a quote.
    const ids = nfts.map((n) => n.tokenId).join(",");
    React.useEffect(() => {
        if (!owner || !chainId || !contract || !ids) return;
        let live = true;
        void pooled(ids.split(","), 4, async (tokenId) => {
            const { status, body } = await evmGet<EvmBuybackAvailable>("buyback/available", {
                wallet: owner,
                tokenId,
                contract,
                chainId,
            });
            // Each answer lands as it arrives rather than after the slowest one.
            if (live && status === 200) setAvail((prev) => ({ ...prev, [`${chainId}:${tokenId}`]: body }));
        });
        return () => {
            live = false;
        };
    }, [owner, chainId, contract, ids]);

    const byToken = new Map(
        localCards.filter((c) => c.chainId === chainId).map((c) => [c.tokenId, c] as const),
    );
    const otherChains = new Set(localCards.filter((c) => c.chainId !== chainId).map((c) => c.chainId));

    return (
        <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                <h2 className="text-2xl font-semibold">Your cards</h2>
                <button
                    onClick={() => setReloadKey((k) => k + 1)}
                    disabled={!owner || !contract || current?.state === "loading"}
                    className="text-sm text-blue-700 underline disabled:text-gray-400 disabled:no-underline"
                >
                    {current?.state === "loading" ? "Reading the chain..." : "Refresh"}
                </button>
            </div>

            <p className="text-sm text-gray-500 mb-4">
                Read from{" "}
                {contract ? (
                    <span className="font-mono text-xs break-all">{contract}</span>
                ) : (
                    "the card contract"
                )}{" "}
                on {chain?.name ?? "the selected chain"} — whatever this wallet holds, however it got there.
                {otherChains.size > 0 && " Cards you won on another chain show up when you select that chain above."}
            </p>

            <Body
                owner={owner}
                chain={chain}
                contract={contract}
                state={current?.state}
                error={current?.error}
                total={current?.total ?? 0}
                nfts={nfts}
                local={byToken}
                avail={avail}
                onChanged={onChanged}
            />
        </div>
    );
}

function Body({
    owner,
    chain,
    contract,
    state,
    error,
    total,
    nfts,
    local,
    avail,
    onChanged,
}: {
    owner?: `0x${string}`;
    chain: EvmChainInfo | null;
    contract: `0x${string}` | null;
    state?: "loading" | "ready" | "error";
    error?: string;
    total: number;
    nfts: OwnedNft[];
    local: Map<string, OwnedCard>;
    avail: Availability;
    onChanged: () => void;
}) {
    if (!owner) return <p className="text-sm text-gray-500">Connect a wallet to see its cards.</p>;
    if (!chain) return <p className="text-sm text-gray-500">Pick a chain above.</p>;
    if (!contract) {
        return <p className="text-sm text-gray-500">{chain.name} has no card contract configured on this deployment.</p>;
    }
    if (state === "loading" || state === undefined) {
        return <p className="text-sm text-gray-500">Reading your cards on {chain.name}...</p>;
    }
    if (state === "error") return <p className="text-sm text-red-600">Could not read the card contract: {error}</p>;
    if (nfts.length === 0) {
        return <p className="text-sm text-gray-500">No cards in this wallet on {chain.name}. Open a pack above.</p>;
    }

    return (
        <>
            <p className="text-sm text-gray-600 mb-3">
                {total} card{total === 1 ? "" : "s"} on {chain.name}
                {total > MAX_OWNED && ` — showing the ${MAX_OWNED} newest`}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {nfts.map((nft) => (
                    <CardTile
                        key={nft.tokenId}
                        nft={nft}
                        chain={chain}
                        local={local.get(nft.tokenId)}
                        avail={avail[`${nft.chainId}:${nft.tokenId}`]}
                        onChanged={onChanged}
                    />
                ))}
            </div>
        </>
    );
}

function CardTile({
    nft,
    chain,
    local,
    avail,
    onChanged,
}: {
    nft: OwnedNft;
    chain: EvmChainInfo;
    local?: OwnedCard;
    avail?: EvmBuybackAvailable;
    onChanged: () => void;
}) {
    const image = nft.image ?? local?.image;
    const name = nft.name ?? local?.name ?? `Token #${nft.tokenId}`;
    const insured = nft.insuredValue ?? local?.insuredValue;
    const tokenUrl = explorerTokenUrl(nft.chainId, nft.contract, nft.tokenId);
    const paused = sellBlockedReason(chain);

    // Only `available: false` blocks the button. An unanswered check is not evidence of anything, so it
    // leaves the sell path open and lets the server be the one to refuse.
    const outOfWindow = avail?.available === false;

    return (
        <div className="border border-gray-200 rounded-lg p-3 space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {image && <img src={image} alt={name} className="w-full h-auto rounded" loading="lazy" />}
            <div className="text-sm font-semibold text-gray-900">{name}</div>
            <div className="text-xs text-gray-500">
                #{nft.tokenId}
                {insured !== undefined && ` · $${insured} insured`}
                {nft.grade && ` · ${nft.grade}`}
                {local?.rarityLabel && ` · ${local.rarityLabel}`}
            </div>
            <div className="text-xs">
                {avail === undefined ? (
                    <span className="text-gray-400">checking buyback...</span>
                ) : avail.available ? (
                    <span className="text-green-700 font-semibold">
                        Buyback: {avail.amount?.toFixed(2) ?? "?"} {avail.token?.symbol ?? "USDC"}
                    </span>
                ) : (
                    <span className="text-gray-500">Outside the buyback window</span>
                )}
            </div>
            {tokenUrl && (
                <a className="text-xs text-blue-700 underline block" href={tokenUrl} target="_blank" rel="noopener noreferrer">
                    View on explorer
                </a>
            )}
            <SellButton
                // No memo for a card this browser never won — sellCard only needs it to forget the
                // local copy afterwards, and the on-chain read is what this list trusts anyway.
                card={{ memo: local?.memo ?? "", chainId: nft.chainId, tokenId: nft.tokenId, contract: nft.contract }}
                blockedReason={paused ?? (outOfWindow ? "outside the buyback window" : null)}
                onSold={onChanged}
            />
        </div>
    );
}
