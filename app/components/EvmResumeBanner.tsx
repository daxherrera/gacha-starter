"use client";

import * as React from "react";
import { evmGet } from "@/app/evm/api";
import { explorerTxUrl } from "@/app/evm/chains";
import { resumePack } from "@/app/evm/flows";
import {
    clearPending,
    getEmptySnapshot,
    getPendingSnapshot,
    isExpired,
    subscribeResume,
    type PendingPack,
} from "@/app/evm/resume";
import type { EvmPackStatus } from "@/app/evm/types";

/**
 * The safety net for the one thing that cannot be undone. Payments are final and
 * cron/evm-complete-packs only sweeps packs the WEBHOOK confirmed, so a pack whose pay transaction
 * landed but whose openPack never returned is completable only from the memo and the pay tx hash the
 * browser kept. This is where they come back.
 */
export default function EvmResumeBanner({ onChanged }: { onChanged: () => void }) {
    // The pending list lives in localStorage, so subscribe to it rather than copying it into state.
    const rows = React.useSyncExternalStore(subscribeResume, getPendingSnapshot, getEmptySnapshot);

    if (rows.length === 0) return null;

    return (
        <div className="border border-amber-300 bg-amber-50 rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-amber-900">Unfinished packs</h3>
            <p className="text-sm text-amber-800">
                EVM payments are final. If you paid but the pack never opened, finish it here — opening is idempotent,
                so it is always safe to try again.
            </p>
            {rows.map((p) => (
                <ResumeRow key={p.memo} pack={p} onDone={onChanged} />
            ))}
        </div>
    );
}

function ResumeRow({ pack, onDone }: { pack: PendingPack; onDone: () => void }) {
    const [status, setStatus] = React.useState<string>("Checking...");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [awarded, setAwarded] = React.useState(false);

    React.useEffect(() => {
        let live = true;
        (async () => {
            const { status: code, body } = await evmGet<EvmPackStatus>("pack/status", { memo: pack.memo });
            if (!live) return;
            if (code !== 200) {
                setStatus("Could not reach the server.");
                return;
            }
            // Only depend on documented fields — pack/status returns raw rows.
            if (body.send?.evm_token_id) setStatus("Your card is ready — click to claim it.");
            else if (body.pack?.webhook_received || body.pack?.status === "confirmed")
                setStatus("Payment confirmed. Finish opening.");
            else if (pack.payTxHash) setStatus("Payment sent. Finish opening.");
            else if (isExpired(pack)) setStatus("Expired before it was paid for.");
            else setStatus("Not paid for yet.");
        })();
        return () => {
            live = false;
        };
    }, [pack]);

    const finish = async () => {
        setBusy(true);
        setError(null);
        try {
            await resumePack(pack.memo, pack.payTxHash, setStatus);
            setAwarded(true);
            onDone();
        } catch (e) {
            setError((e as Error).message.split("\n")[0]);
        } finally {
            setBusy(false);
        }
    };

    const txUrl = pack.payTxHash ? explorerTxUrl(pack.chainId, pack.payTxHash) : null;
    const expired = isExpired(pack);

    return (
        <div className="bg-white border border-amber-200 rounded p-3 text-sm space-y-1">
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{pack.packType}</span>
                <span className="text-gray-500">
                    chain {pack.chainId} · {pack.tokenSymbol}
                </span>
                {expired && <span className="text-red-600 font-semibold">expired</span>}
            </div>
            {/* Selectable, always. The memo is the only handle support has on a paid pack. */}
            <div className="font-mono text-xs break-all select-all">{pack.memo}</div>
            {txUrl && (
                <a className="text-xs text-blue-700 underline" href={txUrl} target="_blank" rel="noopener noreferrer">
                    payment transaction
                </a>
            )}
            <div className="text-gray-700">{awarded ? "Card claimed." : status}</div>
            {error && <div className="text-red-600">Error: {error}</div>}
            <div className="flex gap-2 pt-1">
                {!awarded && !expired && (
                    <button
                        onClick={() => void finish()}
                        disabled={busy}
                        className={`px-3 py-1 rounded font-semibold text-white text-xs ${
                            busy ? "bg-gray-400" : "bg-amber-600 hover:bg-amber-700"
                        }`}
                    >
                        {busy ? "Working..." : "Finish opening"}
                    </button>
                )}
                <button
                    onClick={() => {
                        void navigator.clipboard?.writeText(pack.memo);
                    }}
                    className="px-3 py-1 rounded border border-gray-300 text-xs"
                >
                    Copy memo
                </button>
                <button
                    onClick={() => {
                        clearPending(pack.memo);
                        onDone();
                    }}
                    className="px-3 py-1 rounded border border-gray-300 text-xs text-gray-600"
                >
                    Dismiss
                </button>
            </div>
            {expired && (
                <p className="text-xs text-gray-600">
                    Packs expire 2 hours after they are created. If you paid for this one, send the memo above to
                    Collector Crypt.
                </p>
            )}
        </div>
    );
}
