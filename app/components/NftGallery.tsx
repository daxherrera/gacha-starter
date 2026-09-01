"use client";

import * as React from "react";

type NftFile = { uri?: string; cdn_uri?: string; cc_cdn?: string; mime?: string };
type NftAttribute = { trait_type: string; value: string };
type Nft = {
    id: string;
    content?: {
        files?: NftFile[];
        links?: { image?: string; external_url?: string };
        metadata?: {
            name?: string;
            attributes?: NftAttribute[];
        };
    };
    ownership?: { owner?: string };
};
type GetNftsResponse = { nfts: Nft[] };

function getImageUrl(nft: Nft) {
    // NEVER require `mime`: the API stopped sending it, and `links` comes back null, so a mime test
    // matched nothing and every card rendered as a grey box. files[0] is the card FRONT (files[1] is
    // the back), so falling back to index 0 is the documented order, not a guess.
    const files = nft.content?.files ?? [];
    const file = files.find((f) => (f.mime ?? "").startsWith("image/")) ?? files[0];

    // cc_cdn first: our own CloudFront. cdn_uri is Helius's resizer and uri is a raw Arweave redirect.
    return file?.cc_cdn || file?.cdn_uri || file?.uri || nft.content?.links?.image || "";
}

function getPrice(nft: Nft) {
    const insuredValue = nft.content?.metadata?.attributes?.find(
        (attr: NftAttribute) => attr.trait_type === "Insured Value"
    )?.value;
    return insuredValue ? `$${insuredValue}` : null;
}

export default function NftGallery(props: { code?: string }) {
    const { code } = props;

    const [data, setData] = React.useState<GetNftsResponse | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState<boolean>(true);

    React.useEffect(() => {
        let alive = true;

        (async () => {
            setLoading(true);
            setError(null);

            try {
                const res = await fetch("/api/getNfts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    // `owner` used to be sent here and was silently ignored upstream — the handler
                    // reads code/rarity/page/limit only. This grid is the machine's pool, not a wallet.
                    body: JSON.stringify(code ? { code } : {}),
                });

                if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    throw new Error(text || res.statusText);
                }

                const json = (await res.json()) as GetNftsResponse;
                if (alive) setData(json);
            } catch (e) {
                if (alive) setError(e instanceof Error ? e.message : "Failed to load NFTs");
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [code]);

    const nfts = data?.nfts ?? [];
    const displayedNfts = nfts.slice(0, 100);

    return (
        <div>
            <h2 className="text-2xl font-semibold mb-1">In the gacha machine</h2>
            <p className="text-sm text-gray-500 mb-4">
                The pool this pack draws from — every card here is one you can win. Not your wallet.
            </p>

            {loading && <div className="text-sm text-gray-500">Loading the pool...</div>}
            {error && <div className="text-sm text-red-600">Error: {error}</div>}
            {!loading && !error && nfts.length === 0 && (
                <div className="text-sm text-gray-500">The machine reports no cards in this pool.</div>
            )}
            {nfts.length > 100 && (
                <p className="text-sm text-gray-600 mb-3">Showing the first 100 of {nfts.length}</p>
            )}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                    gap: 12,
                    marginTop: 12,
                }}
            >
                {displayedNfts.map((nft, index) => {
                    const name = nft.content?.metadata?.name || nft.id;
                    const img = getImageUrl(nft);
                    const price = getPrice(nft);

                    return (
                        <a
                            key={nft.id || `nft-${index}`}
                            href={`https://dev.collectorcrypt.com/assets/solana/${nft.id}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                                border: "1px solid #e5e7eb",
                                borderRadius: 8,
                                padding: 10,
                                textDecoration: "none",
                                color: "inherit",
                                display: "block",
                                cursor: "pointer",
                                transition: "box-shadow 0.2s ease",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.boxShadow = "none";
                            }}
                        >
                            {img ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={img}
                                    alt={name}
                                    style={{ width: "100%", height: 120, objectFit: "contain", borderRadius: 6 }}
                                />
                            ) : (
                                <div style={{ height: 120, background: "#f3f4f6", borderRadius: 6 }} />
                            )}

                            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600 }}>{name}</div>

                            {price && (
                                <div style={{ marginTop: 4, fontSize: 12, color: "#059669", fontWeight: 500 }}>
                                    {price}
                                </div>
                            )}
                        </a>
                    );
                })}
            </div>
        </div>
    );
}
