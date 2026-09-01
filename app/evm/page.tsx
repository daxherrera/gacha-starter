"use client";

import * as React from "react";
import Link from "next/link";
import EvmChainPicker, { buyBlockedReason } from "@/app/components/EvmChainPicker";
import EvmConnect from "@/app/components/EvmConnect";
import EvmPackOpener, { EvmCardsGrid } from "@/app/components/EvmPackOpener";
import EvmResumeBanner from "@/app/components/EvmResumeBanner";
import { evmGet } from "@/app/evm/api";
import { readCards, readPending, type OwnedCard } from "@/app/evm/resume";
import { lanesOf, type EvmChainInfo, type EvmChainsResponse } from "@/app/evm/types";

const PACK_TYPE = process.env.NEXT_PUBLIC_PACK_TYPE ?? "pokemon_50";
const PREFERRED_CHAIN = process.env.NEXT_PUBLIC_EVM_CHAIN_ID;
const PREFERRED_TOKEN = process.env.NEXT_PUBLIC_EVM_TOKEN;

export default function EvmHome() {
    const [chains, setChains] = React.useState<EvmChainInfo[]>([]);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [chainId, setChainId] = React.useState<number | null>(null);
    const [laneKey, setLaneKey] = React.useState<string | null>(null);
    const [refreshKey, setRefreshKey] = React.useState(0);
    const [cards, setCards] = React.useState<OwnedCard[]>([]);
    const [laneLocked, setLaneLocked] = React.useState(false);

    // The machine is multichain: ask which chains it serves rather than assuming one.
    React.useEffect(() => {
        (async () => {
            const { status, body } = await evmGet<EvmChainsResponse>("chains");
            if (status !== 200) {
                setLoadError(String(body.error ?? `GET /api/evm/chains returned ${status}`));
                return;
            }
            setChains(body.chains ?? []);
            const buyable = (body.chains ?? []).filter((c) => !buyBlockedReason(c));
            const pick =
                buyable.find((c) => String(c.chainId) === PREFERRED_CHAIN) ??
                buyable.find((c) => c.chainId === body.defaultChainId) ??
                buyable[0];
            if (pick) {
                const lanes = lanesOf(pick);
                const lane =
                    lanes.find((l) => l.key === PREFERRED_TOKEN) ?? lanes.find((l) => l.default) ?? lanes[0];
                setChainId(pick.chainId);
                setLaneKey(lane.key);
            }
        })();
    }, []);

    React.useEffect(() => {
        setCards(readCards());
        setLaneLocked(readPending().length > 0);
    }, [refreshKey]);

    const chain = chains.find((c) => c.chainId === chainId) ?? null;
    const lane = chain ? lanesOf(chain).find((l) => l.key === laneKey) ?? null : null;
    const blocked = chain ? buyBlockedReason(chain) : null;
    const bump = () => setRefreshKey((k) => k + 1);

    return (
        <div className="container mx-auto px-4 py-8 space-y-8">
            <div className="text-center space-x-2">
                <Link href="/">
                    <button className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded">
                        ← Solana version
                    </button>
                </Link>
                <a href="https://github.com/daxherrera/gacha-starter" target="_blank" rel="noopener noreferrer">
                    <button className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded">
                        Go to GitHub Repo
                    </button>
                </a>
            </div>

            <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold">Collector Crypt Gacha Starter — EVM</h1>
                <p className="text-sm text-gray-600 max-w-2xl mx-auto">
                    Same machine, same odds, paid in an ERC-20 stablecoin. You call{" "}
                    <code className="font-mono">pay()</code> yourself, the server rolls, and an ERC-721 card is minted
                    to your wallet. Payments are final — there is no refund path.
                </p>
            </div>

            <div className="text-center">
                <EvmConnect chainId={chainId} lane={lane} refreshKey={refreshKey} onBalanceChange={bump} />
            </div>

            {loadError && (
                <div className="border border-red-300 bg-red-50 rounded-lg p-4 text-sm text-red-700">
                    Could not load chains: {loadError}
                </div>
            )}

            <EvmResumeBanner refreshKey={refreshKey} onChanged={bump} />

            <EvmChainPicker
                chains={chains}
                chainId={chainId}
                laneKey={laneKey}
                laneLocked={laneLocked}
                onSelect={({ chainId: c, laneKey: l }) => {
                    setChainId(c);
                    setLaneKey(l);
                }}
            />

            <EvmPackOpener
                chain={chain}
                lane={lane}
                packType={PACK_TYPE}
                disabledReason={blocked}
                onChanged={bump}
            />

            <div>
                <h2 className="text-2xl font-semibold mb-1">Your cards</h2>
                <p className="text-sm text-gray-500 mb-4">
                    Remembered in this browser only — the demo keeps no account. Sell back inside the buyback window.
                </p>
                <EvmCardsGrid cards={cards} chains={chains} onChanged={bump} />
            </div>
        </div>
    );
}
