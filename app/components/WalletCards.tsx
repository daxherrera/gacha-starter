"use client";

import * as React from "react";

// What the WALLET holds, from the Collector Crypt cards API.
//
// /api/getNfts cannot answer this — its handler reads only code/rarity/page/limit and ignores an
// `owner` param entirely, so it always returns the machine's pool. This endpoint is keyed on the CC
// user's wallet and needs no API key; CORS reflects the caller's origin, so the browser asks directly.
const CC_API = process.env.NEXT_PUBLIC_CC_API_BASE_URL ?? "https://dev-api.collectorcrypt.com";
const CC_SITE = process.env.NEXT_PUBLIC_CC_SITE_URL ?? "https://dev.collectorcrypt.com";
const PAGE_SIZE = 96;

type CcImages = { front?: string; frontM?: string; frontS?: string; back?: string };
type CcCard = {
    id: string;
    itemName?: string;
    nftAddress?: string;
    blockchain?: string;
    frontImage?: string;
    images?: CcImages;
    /** A string on the wire ("111"), not a number. */
    insuredValue?: string | number;
    grade?: string;
    gradingCompany?: string;
    category?: string;
    year?: number;
    nftStatus?: string;
};
type CcCardsResponse = { totalCards?: number; total?: number; filterNFtCard?: CcCard[]; insuredValueSum?: number };

/** frontM before front: a 96-card grid does not need full-resolution scans. */
function cardImage(c: CcCard): string | undefined {
    return c.images?.frontM || c.images?.frontS || c.images?.front || c.frontImage;
}

export default function WalletCards({ owner }: { owner?: string }) {
    const [state, setState] = React.useState<
        | { kind: "idle" }
        | { kind: "loading" }
        | { kind: "none" }
        | { kind: "ready"; total: number; cards: CcCard[]; insuredSum?: number }
        | { kind: "error"; message: string }
    >({ kind: "idle" });
    const [reloadKey, setReloadKey] = React.useState(0);

    React.useEffect(() => {
        let live = true;
        if (!owner) {
            // Deferred, not synchronous: a setState in the effect BODY cascades a render.
            void Promise.resolve().then(() => {
                if (live) setState({ kind: "idle" });
            });
            return () => {
                live = false;
            };
        }
        void (async () => {
            setState({ kind: "loading" });
            try {
                const url = `${CC_API}/cards/${owner}/?page=1&step=${PAGE_SIZE}&orderBy=dateDesc`;
                const res = await fetch(url, { headers: { Accept: "application/json" } });
                // 404 is an ANSWER, not a failure: it means this wallet has no Collector Crypt account.
                if (res.status === 404) {
                    if (live) setState({ kind: "none" });
                    return;
                }
                if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
                const json = (await res.json()) as CcCardsResponse;
                if (!live) return;
                setState({
                    kind: "ready",
                    total: json.totalCards ?? json.total ?? (json.filterNFtCard?.length ?? 0),
                    cards: json.filterNFtCard ?? [],
                    insuredSum: json.insuredValueSum,
                });
            } catch (e) {
                if (live) setState({ kind: "error", message: (e as Error).message });
            }
        })();
        return () => {
            live = false;
        };
    }, [owner, reloadKey]);

    return (
        <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                <h2 className="text-2xl font-semibold">Your cards</h2>
                {owner && (
                    <button
                        onClick={() => setReloadKey((k) => k + 1)}
                        disabled={state.kind === "loading"}
                        className="text-sm text-blue-700 underline disabled:text-gray-400 disabled:no-underline"
                    >
                        {state.kind === "loading" ? "Loading..." : "Refresh"}
                    </button>
                )}
            </div>
            <p className="text-sm text-gray-500 mb-4">
                Every Collector Crypt card this wallet holds — won here or not.
                {state.kind === "ready" && state.insuredSum !== undefined && state.total > 0 && (
                    <> Insured value across all {state.total}: ${state.insuredSum.toLocaleString()}.</>
                )}
            </p>

            {state.kind === "idle" && <p className="text-sm text-gray-500">Connect a wallet to see its cards.</p>}
            {state.kind === "loading" && <p className="text-sm text-gray-500">Loading your cards...</p>}
            {state.kind === "error" && (
                <p className="text-sm text-red-600">Could not load your cards: {state.message}</p>
            )}
            {state.kind === "none" && (
                <p className="text-sm text-gray-500">
                    No Collector Crypt account for this wallet yet — open a pack and your first card lands here.
                </p>
            )}

            {state.kind === "ready" && state.cards.length === 0 && (
                <p className="text-sm text-gray-500">No cards in this wallet yet. Open a pack above.</p>
            )}

            {state.kind === "ready" && state.cards.length > 0 && (
                <>
                    {state.total > state.cards.length && (
                        <p className="text-sm text-gray-600 mb-3">
                            Showing the {state.cards.length} newest of {state.total}
                        </p>
                    )}
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                        {state.cards.map((c) => (
                            <CardTile key={c.id} card={c} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function CardTile({ card }: { card: CcCard }) {
    const img = cardImage(card);
    const name = card.itemName ?? card.id;
    // The asset page is per-chain; the API tells us which, so this is never a guessed link.
    const href = card.nftAddress
        ? `${CC_SITE}/assets/${(card.blockchain ?? "solana").toLowerCase()}/${card.nftAddress}`
        : undefined;

    const body = (
        <>
            {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt={name} loading="lazy" className="w-full h-32 object-contain rounded bg-gray-50" />
            ) : (
                <div className="w-full h-32 rounded bg-gray-100" />
            )}
            <div className="mt-2 text-xs font-semibold text-gray-900 line-clamp-2">{name}</div>
            <div className="text-xs text-gray-500">
                {card.insuredValue !== undefined && `$${card.insuredValue}`}
                {card.grade && ` · ${card.grade}`}
            </div>
        </>
    );

    return href ? (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="border border-gray-200 rounded-lg p-2 block hover:shadow-md transition-shadow"
        >
            {body}
        </a>
    ) : (
        <div className="border border-gray-200 rounded-lg p-2">{body}</div>
    );
}
