"use client";

import { apiErrorText } from "./errors";
import type { EvmBuybackQuote, EvmOpenPack } from "./types";

/** Non-2xx is information, not an exception — every caller branches on the status. */
export type ApiResult<T> = { status: number; body: T & Record<string, unknown> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(path: string, init: RequestInit): Promise<ApiResult<T>> {
    try {
        const res = await fetch(`/api/evm/${path}`, init);
        const text = await res.text();
        let body: unknown = {};
        try {
            body = text ? JSON.parse(text) : {};
        } catch {
            body = { error: text.slice(0, 300) };
        }
        return { status: res.status, body: body as unknown as T & Record<string, unknown> };
    } catch (e) {
        // status 0 = the request never reached us. Treated as retryable by the pollers below.
        return { status: 0, body: { error: (e as Error).message } as unknown as T & Record<string, unknown> };
    }
}

export function evmGet<T>(path: string, query: Record<string, string | number | undefined> = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined) qs.set(k, String(v));
    const suffix = qs.toString() ? `?${qs}` : "";
    return call<T>(`${path}${suffix}`, { method: "GET" });
}

export function evmPost<T>(path: string, body: unknown) {
    return call<T>(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

export class PackExpiredError extends Error {}
export class PackStillPendingError extends Error {}

/**
 * openPack is not one call. 202 means "ask again" (WAITING_FOR_PAYMENT while the payment is
 * unconfirmed, PROCESSING for a concurrent open, MINTING while the mint user-op sits in the bundler).
 * 502 MINT_PENDING/MINT_FAILED means the payment is on record and the card is still held for this
 * pack, so it is retryable too. 410 PACK_EXPIRED is terminal. A retry can never double-mint — the
 * mint is keyed on the memo by GachaMintGuard.
 */
export async function openPackUntilDone(
    memo: string,
    payTxHash: string | undefined,
    onStatus: (s: string) => void,
    timeoutMs = 5 * 60_000,
): Promise<EvmOpenPack> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const { status, body } = await evmPost<EvmOpenPack>("openPack", {
            memo,
            ...(payTxHash ? { payTxHash } : {}),
        });
        if (status === 200) return body;
        if (status === 410)
            throw new PackExpiredError(`That pack is more than 2 hours old and can no longer be opened (memo ${memo}).`);

        const code = String(body.code ?? "");
        const retryable =
            status === 202 ||
            status === 0 ||
            status === 504 ||
            (status === 502 && (code === "MINT_PENDING" || code === "MINT_FAILED")) ||
            (status === 503 && code === "CHAIN_PAUSED");
        if (!retryable) throw new Error(apiErrorText(body, `openPack ${status}`));

        onStatus(code || String(status));
        if (Date.now() > deadline)
            throw new PackStillPendingError(
                `Still confirming this pack after 5 minutes — nothing is lost. Leave it in "Unfinished packs" and try again shortly (memo ${memo}).`,
            );
        await sleep(Number(body.retryAfterMs ?? 1500));
    }
}

/** The buyback route answers 202 while the fresh mint is not yet readable on the SERVER's node. */
export async function buybackQuoteUntilReady(
    args: { playerAddress: string; evmTokenId: string; evmContract: string; chainId: number },
    onStatus: (s: string) => void,
    timeoutMs = 90_000,
): Promise<EvmBuybackQuote> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const { status, body } = await evmPost<EvmBuybackQuote>("buyback", args);
        if (status === 200) return body;

        const code = String(body.code ?? "");
        const retryable =
            status === 202 ||
            status === 0 ||
            status === 504 ||
            (status === 503 && (code === "OWNER_CHECK_UNAVAILABLE" || code === "INSUFFICIENT_FLOAT"));
        if (!retryable) throw new Error(apiErrorText(body, `buyback ${status}`));

        onStatus(code || String(status));
        if (Date.now() > deadline) throw new Error(`buyback quote still ${code || status} after 90s`);
        await sleep(2000);
    }
}

/**
 * A receipt does not mean the next load-balanced node sees the state. Same reason as
 * gachamachine/scripts/evm-e2e.ts:68-76.
 */
export async function until<T>(
    read: () => Promise<T>,
    ok: (v: T) => boolean,
    tries = 30,
    ms = 1000,
): Promise<boolean> {
    for (let i = 0; i < tries; i++) {
        const v = await read().catch(() => null as unknown as T);
        if (v !== null && ok(v)) return true;
        await sleep(ms);
    }
    return false;
}
