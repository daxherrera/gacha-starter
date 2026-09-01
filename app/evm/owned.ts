"use client";

// What the wallet ACTUALLY holds, read from the card contract itself.
//
// No indexer and no API key: CollectorCrypt is ERC721Enumerable (cc-evm-contracts/src/CollectorCrypt.sol:38),
// so balanceOf + tokenOfOwnerByIndex is the authoritative list, it never lags a block behind the mint,
// and it works the same on Robinhood Chain — which no NFT API covers.

import { erc721EnumerableAbi } from "./abis";
import { getReadClient } from "./clients";

export type OwnedNft = {
    chainId: number;
    contract: `0x${string}`;
    /** Decimal string, as every other tokenId on the wire. */
    tokenId: string;
    uri?: string;
    name?: string;
    image?: string;
    insuredValue?: number;
    grade?: string;
    ccId?: string;
};

/** A whale's wallet is not what this demo is for; `total` still reports the real count. */
export const MAX_OWNED = 48;

type Attribute = { trait_type: string; value: string | number };
type TokenMeta = {
    name?: string;
    image?: string;
    attributes?: Attribute[];
    properties?: { files?: { uri?: string }[] };
};

type Call = {
    address: `0x${string}`;
    abi: typeof erc721EnumerableAbi;
    functionName: "tokenOfOwnerByIndex" | "tokenURI";
    args: readonly unknown[];
};

// tokenURI points at Arweave, whose content is immutable, so a URI's JSON can be cached for the
// session. Failures are NOT cached — a flaky gateway must not blank a card until reload.
const metaCache = new Map<string, TokenMeta>();

export async function fetchOwnedNfts(
    chainId: number,
    contract: `0x${string}`,
    owner: `0x${string}`,
): Promise<{ total: number; nfts: OwnedNft[] }> {
    const pub = getReadClient(chainId);

    const balance = await pub.readContract({
        address: contract,
        abi: erc721EnumerableAbi,
        functionName: "balanceOf",
        args: [owner],
    });
    const total = Number(balance);
    if (total === 0) return { total: 0, nfts: [] };

    const shown = Math.min(total, MAX_OWNED);
    const ids = await readMany<bigint>(
        pub,
        Array.from({ length: shown }, (_, i) => ({
            address: contract,
            abi: erc721EnumerableAbi,
            functionName: "tokenOfOwnerByIndex" as const,
            args: [owner, BigInt(i)],
        })),
    );

    // The contract's own order is insertion order per owner, which a transfer shuffles. Token ids come
    // off a counter, so descending id is "newest first" without trusting the index order.
    const tokenIds = ids.filter((id): id is bigint => id !== null).sort((a, b) => (a < b ? 1 : -1));

    const uris = await readMany<string>(
        pub,
        tokenIds.map((tokenId) => ({
            address: contract,
            abi: erc721EnumerableAbi,
            functionName: "tokenURI" as const,
            args: [tokenId],
        })),
    );

    const metas = await pooled(uris, 6, (uri) => (uri ? fetchMeta(uri) : Promise.resolve(null)));

    return {
        total,
        nfts: tokenIds.map((tokenId, i) => {
            const meta = metas[i];
            return {
                chainId,
                contract,
                tokenId: tokenId.toString(),
                uri: uris[i] ?? undefined,
                name: meta?.name,
                image: meta?.image ?? meta?.properties?.files?.[0]?.uri,
                insuredValue: numberAttr(meta, "Insured Value"),
                grade: stringAttr(meta, "The Grade"),
                ccId: stringAttr(meta, "Collector Crypt ID"),
            };
        }),
    };
}

/** One eth_call for the batch where multicall3 exists, n plain calls where it does not. */
async function readMany<T>(pub: ReturnType<typeof getReadClient>, calls: Call[]): Promise<(T | null)[]> {
    if (calls.length === 0) return [];
    try {
        // `as never` on the way in, cast on the way out: viem infers multicall's result from a literal
        // tuple, which a runtime-built array can never be.
        const res = (await pub.multicall({ contracts: calls as never, allowFailure: true })) as unknown as {
            status: "success" | "failure";
            result?: unknown;
        }[];
        return res.map((r) => (r.status === "success" ? (r.result as T) : null));
    } catch {
        const out: (T | null)[] = [];
        for (let i = 0; i < calls.length; i += 8) {
            const chunk = await Promise.all(
                calls.slice(i, i + 8).map((c) => pub.readContract(c as never).catch(() => null)),
            );
            out.push(...(chunk as (T | null)[]));
        }
        return out;
    }
}

async function fetchMeta(uri: string): Promise<TokenMeta | null> {
    const hit = metaCache.get(uri);
    if (hit) return hit;
    try {
        const res = await fetch(uri, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const json = (await res.json()) as TokenMeta;
        metaCache.set(uri, json);
        return json;
    } catch {
        return null;
    }
}

/** A card is one HTTP request; 48 at once is what makes a browser drop them. */
export async function pooled<In, Out>(items: In[], limit: number, run: (item: In) => Promise<Out>): Promise<Out[]> {
    const out = new Array<Out>(items.length);
    let next = 0;
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            for (;;) {
                const i = next++;
                if (i >= items.length) return;
                out[i] = await run(items[i]);
            }
        }),
    );
    return out;
}

function rawAttr(meta: TokenMeta | null, trait: string): string | number | undefined {
    return meta?.attributes?.find((a) => a.trait_type === trait)?.value;
}

function stringAttr(meta: TokenMeta | null, trait: string): string | undefined {
    const v = rawAttr(meta, trait);
    return v === undefined ? undefined : String(v);
}

/** Insured Value arrives as the string "15" as often as the number 15. */
function numberAttr(meta: TokenMeta | null, trait: string): number | undefined {
    const v = rawAttr(meta, trait);
    if (v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}
