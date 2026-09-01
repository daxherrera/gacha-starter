// The EVM API contract as types. Deliberately shaped so the classic mistakes are compile errors:
// `rarity` is the lowercase union, so `rarity === "Rare"` will not typecheck; base-unit amounts are
// `string` and display amounts are `number`, so the two cannot be mixed up.
// Spec: collectorcryptdocs/docs/gacha/evm-api.md

export type EvmLane = {
    key: string;
    symbol: string;
    address: `0x${string}`;
    decimals: number;
    default?: boolean;
};

export type EvmScopes = {
    generatePack: boolean;
    openPack: boolean;
    webhook: boolean;
    buyback: boolean;
};

export type EvmChainInfo = {
    chainId: number;
    chainKey: string;
    name: string;
    nativeCurrency: string;
    // The DEFAULT lane repeated under its original names, for clients written before lanes existed.
    usdc: `0x${string}`;
    usdcDecimals: number;
    tokens?: EvmLane[];
    paymentContract: `0x${string}` | null;
    vaultContract: `0x${string}` | null;
    cardContract: `0x${string}` | null;
    mintGuardContract?: `0x${string}` | null;
    paused: boolean;
    ready: boolean;
    gasSponsored?: boolean;
    scopesPaused?: EvmScopes;
};

export type EvmChainsResponse = {
    success: boolean;
    defaultChainId: number;
    chains: EvmChainInfo[];
};

export type EvmGeneratePack = {
    memo: string;
    chainId: number;
    usdc: `0x${string}`;
    usdcDecimals: number;
    token: EvmLane;
    paymentContract: `0x${string}`;
    treasury?: string;
    /** BASE UNITS. Pass verbatim to BigInt(). Never derive it from amountHuman. */
    amount: string;
    /** Display only. */
    amountHuman: number;
};

export type EvmNftFile = { uri?: string; mime?: string; cc_cdn?: string; cdn_uri?: string };

export type EvmNftWon = {
    id: string;
    content: {
        files?: EvmNftFile[];
        links?: { image?: string };
        metadata?: {
            name?: string;
            description?: string;
            insuredValue?: number;
            attributes?: Array<{ trait_type: string; value: string | number }>;
        };
    };
};

export type EvmOpenPack = {
    success: true;
    memo: string;
    roll: number;
    /** Lowercase on EVM. Read rarity_label instead — comparing this to "Rare" is a type error. */
    rarity: "epic" | "rare" | "uncommon" | "common";
    rarity_label: "Epic" | "Rare" | "Uncommon" | "Common";
    prize_tier: 1 | 2 | 3 | 4;
    nft_address: string;
    card_name: string | null;
    nftWon: EvmNftWon | null;
    /** Always 0 — there is no points ledger on EVM. Do not render a tile for it. */
    points: 0;
    /** WHOLE USD, not base units. */
    insured_value: number;
    /** WHOLE USD and INDICATIVE — never a payment. The executable number comes from /api/evm/buyback. */
    buyback_amount: number | null;
    evm_contract_address: `0x${string}`;
    evm_token_id: string;
    transaction_signature: string;
    transactionSignature: string;
    chain_id: number;
    chain_key: string;
    replay?: true;
    status?: string;
};

/** GET buyback/available — a pure read, no quote issued, so it is safe to call per rendered card. */
export type EvmBuybackAvailable = {
    available: boolean;
    /** Display only, and only present when available. Floats arrive unrounded (92.64999999999999). */
    amount?: number;
    amountBase?: string;
    chainId?: number;
    token?: EvmLane;
};

export type EvmBuybackQuote = {
    success: true;
    memo: string;
    /** Display only. */
    refundAmount: number;
    /** BASE UNITS — the executable number. */
    refundAmountBase: string;
    token: EvmLane;
    paymentToken: `0x${string}`;
    cardContract: `0x${string}`;
    tokenId: string;
    chainId: number;
    chainKey: string;
    vault: `0x${string}`;
    quoteId: number;
    deadline: number;
    signature: `0x${string}`;
    /** Put this on the transaction. There is no safe local default. */
    suggestedGasLimit: number;
    instructions: string;
};

export type EvmPackStatus = {
    memo: string;
    pack: { status?: string; webhook_received?: boolean; chain_id?: number } | null;
    send: {
        evm_token_id?: string;
        evm_contract_address?: `0x${string}`;
        transaction_signature?: string;
    } | null;
    buyback: unknown[];
};

/** Image preference order per evm-api.md:278-280. files[1] is the card back. */
export function evmCardImage(nftWon: EvmNftWon | null | undefined): string | undefined {
    const f = nftWon?.content?.files?.[0];
    return f?.cc_cdn || f?.cdn_uri || f?.uri || nftWon?.content?.links?.image;
}

export function evmAttr(nftWon: EvmNftWon | null | undefined, trait: string): string | undefined {
    const hit = nftWon?.content?.metadata?.attributes?.find((a) => a.trait_type === trait);
    return hit === undefined ? undefined : String(hit.value);
}

/** The chain's lanes. A deployment older than the lane rollout has no `tokens`; its default lane is
 *  usdc/usdcDecimals (evm-api.md:80-82, same fallback as gachamachine/scripts/evm-e2e.ts:95). */
export function lanesOf(c: EvmChainInfo): EvmLane[] {
    return c.tokens?.length
        ? c.tokens
        : [{ key: "usdc", symbol: "USDC", address: c.usdc, decimals: c.usdcDecimals, default: true }];
}
