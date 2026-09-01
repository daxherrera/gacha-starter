"use client";

import { VIEM_CHAINS } from "@/app/evm/chains";
import { lanesOf, type EvmChainInfo, type EvmLane } from "@/app/evm/types";

/** Grey out, never hide, and always say why. */
export function buyBlockedReason(c: EvmChainInfo): string | null {
    if (!VIEM_CHAINS[c.chainId]) return "this demo has no chain definition for it";
    if (!c.ready) return "not configured to sell on this deployment";
    if (c.paused) return "chain paused";
    if (c.scopesPaused?.generatePack) return "sales paused";
    // Not in the docs, and it matters more than anything else here: generatePack can be open while
    // openPack is paused. Payments are final, so letting someone pay into a paused opener is the one
    // unrecoverable mistake this UI can make.
    if (c.scopesPaused?.openPack) return "pack opening paused — do not pay yet";
    return null;
}

export function sellBlockedReason(c: EvmChainInfo): string | null {
    if (c.paused) return "chain paused";
    if (c.scopesPaused?.buyback) return "buybacks paused on this chain";
    return null;
}

export default function EvmChainPicker({
    chains,
    chainId,
    laneKey,
    laneLocked,
    onSelect,
}: {
    chains: EvmChainInfo[];
    chainId: number | null;
    laneKey: string | null;
    /** The lane is frozen at generatePack, so it cannot be changed while a pack is outstanding. */
    laneLocked: boolean;
    onSelect: (next: { chainId: number; laneKey: string }) => void;
}) {
    const selected = chains.find((c) => c.chainId === chainId) ?? null;
    const lanes = selected ? lanesOf(selected) : [];

    return (
        <div className="grid gap-4 md:grid-cols-2 border border-gray-200 rounded-lg p-4">
            <div>
                <h3 className="font-semibold mb-2 text-sm text-gray-700">Chain</h3>
                <div className="space-y-1">
                    {chains.map((c) => {
                        const blocked = buyBlockedReason(c);
                        return (
                            <label
                                key={c.chainId}
                                className={`flex items-start gap-2 text-sm ${blocked ? "opacity-50" : "cursor-pointer"}`}
                            >
                                <input
                                    type="radio"
                                    name="evm-chain"
                                    className="mt-1"
                                    disabled={!!blocked}
                                    checked={c.chainId === chainId}
                                    onChange={() => {
                                        const first = lanesOf(c).find((l) => l.default) ?? lanesOf(c)[0];
                                        onSelect({ chainId: c.chainId, laneKey: first.key });
                                    }}
                                />
                                <span>
                                    <span className="font-medium">{c.name}</span>{" "}
                                    <span className="text-gray-500">({c.chainId})</span>
                                    {blocked && <span className="text-red-600"> — {blocked}</span>}
                                    {!blocked && c.gasSponsored && (
                                        <span className="block text-xs text-gray-500">
                                            gas sponsored: the card mint only — you pay for approve, pay and sellBack
                                        </span>
                                    )}
                                </span>
                            </label>
                        );
                    })}
                    {chains.length === 0 && <p className="text-sm text-gray-500">No chains returned.</p>}
                </div>
            </div>

            <div>
                <h3 className="font-semibold mb-2 text-sm text-gray-700">
                    Payment lane{laneLocked && <span className="font-normal text-gray-500"> — locked, a pack is open</span>}
                </h3>
                <div className="space-y-1">
                    {lanes.map((l: EvmLane) => (
                        <label
                            key={l.key}
                            className={`flex items-start gap-2 text-sm ${laneLocked ? "opacity-50" : "cursor-pointer"}`}
                        >
                            <input
                                type="radio"
                                name="evm-lane"
                                className="mt-1"
                                disabled={laneLocked}
                                checked={l.key === laneKey}
                                onChange={() => selected && onSelect({ chainId: selected.chainId, laneKey: l.key })}
                            />
                            <span>
                                <span className="font-medium">{l.symbol}</span>{" "}
                                <span className="text-gray-500">
                                    {l.decimals}dp{l.default ? " · default" : ""}
                                </span>
                                <span className="block text-xs font-mono text-gray-400 break-all">{l.address}</span>
                            </span>
                        </label>
                    ))}
                    {!selected && <p className="text-sm text-gray-500">Pick a chain first.</p>}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                    A pack&apos;s lane is fixed when you create it, and the buyback pays you in that same token.
                </p>
            </div>
        </div>
    );
}
