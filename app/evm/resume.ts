"use client";

// EVM payments are FINAL — there is no refund path. Between pay() returning a hash and openPack
// returning 200, the only things that can turn that money into a card are the memo and the pay tx
// hash. cron/evm-complete-packs only picks up rows the WEBHOOK confirmed, so the browser must not be
// the single copy that got lost. The write ORDERING in EvmPackOpener is the mitigation; this file is
// just where it is kept.

const PENDING_KEY = "cc-gacha-evm-pending-v1";
const CARDS_KEY = "cc-gacha-evm-cards-v1";
const MAX_CARDS = 20;

export type PendingPack = {
    memo: string;
    /** Never a memo without its chain. */
    chainId: number;
    packType: string;
    laneKey: string;
    tokenSymbol: string;
    tokenDecimals: number;
    /** Base units, verbatim from generatePack. */
    amount: string;
    payTxHash?: `0x${string}`;
    stage: "generated" | "approved" | "paid";
    createdAt: number;
};

export type OwnedCard = {
    memo: string;
    /** The same token id on another chain is a different card. */
    chainId: number;
    tokenId: string;
    contract: `0x${string}`;
    name?: string;
    image?: string;
    insuredValue?: number;
    rarityLabel?: string;
    awardedAt: number;
};

// Safari private mode throws on localStorage, so every access is guarded.
function read<T>(key: string): T[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
        return [];
    }
}

function write<T>(key: string, rows: T[]): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(key, JSON.stringify(rows));
    } catch {
        /* quota or private mode — the in-page state still has it */
    }
}

// useSyncExternalStore needs a snapshot that stays referentially equal between reads, so the parsed
// arrays are cached and every write drops the cache.
const listeners = new Set<() => void>();
const EMPTY: never[] = [];
let pendingCache: PendingPack[] | null = null;
let cardsCache: OwnedCard[] | null = null;

function dropCache(): void {
    pendingCache = null;
    cardsCache = null;
}

/**
 * Drops the cache AND wakes subscribers. Only terminal writes publish: a pack part-way through
 * buyPack must not light up the resume banner, which would offer to "finish" a pack that is still
 * being opened. Mid-flow writes only drop the cache, so the next render reads them.
 */
function publish(): void {
    dropCache();
    for (const notify of listeners) notify();
}

// Another tab writing the same keys must not leave this one on a stale snapshot.
if (typeof window !== "undefined") window.addEventListener("storage", publish);

/** One subscription for both lists: a pack becoming a card changes each of them. */
export function subscribeResume(onStoreChange: () => void): () => void {
    listeners.add(onStoreChange);
    return () => {
        listeners.delete(onStoreChange);
    };
}

export function getPendingSnapshot(): PendingPack[] {
    return (pendingCache ??= readPending());
}

export function getCardsSnapshot(): OwnedCard[] {
    return (cardsCache ??= readCards());
}

/** localStorage does not exist while prerendering; the client re-reads after hydration. */
export function getEmptySnapshot(): never[] {
    return EMPTY;
}

/** An array, not a single record: a user can strand more than one pack. */
export function readPending(): PendingPack[] {
    return read<PendingPack>(PENDING_KEY);
}

export function savePending(p: PendingPack): void {
    const rows = readPending().filter((r) => r.memo !== p.memo);
    write(PENDING_KEY, [p, ...rows]);
    dropCache();
}

export function patchPending(memo: string, patch: Partial<PendingPack>): void {
    const rows = readPending().map((r) => (r.memo === memo ? { ...r, ...patch } : r));
    write(PENDING_KEY, rows);
    dropCache();
}

export function clearPending(memo: string): void {
    write(
        PENDING_KEY,
        readPending().filter((r) => r.memo !== memo),
    );
    publish();
}

export function readCards(): OwnedCard[] {
    return read<OwnedCard>(CARDS_KEY);
}

export function rememberCard(c: OwnedCard): void {
    const rows = readCards().filter((r) => r.memo !== c.memo);
    write(CARDS_KEY, [c, ...rows].slice(0, MAX_CARDS));
    publish();
}

export function forgetCard(memo: string): void {
    write(
        CARDS_KEY,
        readCards().filter((r) => r.memo !== memo),
    );
    publish();
}

/** Packs expire 2h after generatePack (410 PACK_EXPIRED). */
export const PACK_TTL_MS = 2 * 60 * 60 * 1000;

export function isExpired(p: PendingPack, now = Date.now()): boolean {
    return now - p.createdAt > PACK_TTL_MS;
}
