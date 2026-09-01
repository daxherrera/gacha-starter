// Which chains THIS CLIENT can talk to. GET /api/evm/chains says which the MACHINE serves; a chain in
// one and not the other is greyed out with a reason, never silently dropped.
import { defineChain, type Chain } from "viem";
import { base, baseSepolia } from "viem/chains";

// Robinhood Chain ships no viem definition. Kept in step with gachamachine/lib/evm/chains.ts:133-147.
export const robinhood = defineChain({
    id: 4663,
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
    blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
    // Deployed at the canonical address, but absent from the chain definition, so viem would refuse to
    // multicall. Verified against rpc.mainnet.chain.robinhood.com.
    contracts: { multicall3: { address: "0xca11bde05977b3631167028862be2a173976ca11" } },
});

export const robinhoodTestnet = defineChain({
    id: 46630,
    name: "Robinhood Chain Testnet",
    testnet: true,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
    blockExplorers: { default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" } },
    contracts: { multicall3: { address: "0xca11bde05977b3631167028862be2a173976ca11" } },
});

export const VIEM_CHAINS: Record<number, Chain> = {
    8453: base,
    84532: baseSepolia,
    4663: robinhood,
    46630: robinhoodTestnet,
};

// Display only: a wallet can sit on a chain this demo does not serve, and "chain 1" tells you nothing.
const CHAIN_LABELS: Record<number, string> = {
    1: "Ethereum",
    10: "OP Mainnet",
    137: "Polygon",
    42161: "Arbitrum One",
    11155111: "Sepolia",
};

export function chainLabel(chainId: number): string {
    return VIEM_CHAINS[chainId]?.name ?? CHAIN_LABELS[chainId] ?? `chain ${chainId}`;
}

// ONE json var, not one per chain: Next inlines `process.env.X` literally at build time, so a computed
// key (process.env[`NEXT_PUBLIC_EVM_RPC_${id}`]) is always undefined in the browser.
const RPC_OVERRIDES: Record<string, string> = (() => {
    try {
        return JSON.parse(process.env.NEXT_PUBLIC_EVM_RPCS ?? "{}");
    } catch {
        return {};
    }
})();

/** undefined => viem's http() falls back to chain.rpcUrls.default, which is all a demo needs. */
export function rpcUrlFor(chainId: number): string | undefined {
    return RPC_OVERRIDES[String(chainId)];
}

// The gateway, vault and card sit at the SAME address on nearly every chain, and token ids come from
// each chain's own counter. A wrong-chain link therefore does not 404 — it opens a REAL page for a
// DIFFERENT card. So: null, never a guess.
export function explorerTxUrl(chainId: number, hash: string): string | null {
    const url = VIEM_CHAINS[chainId]?.blockExplorers?.default.url;
    return url ? `${url}/tx/${hash}` : null;
}

export function explorerTokenUrl(chainId: number, contract: string, tokenId: string): string | null {
    const url = VIEM_CHAINS[chainId]?.blockExplorers?.default.url;
    if (!url) return null;
    // Etherscan and Blockscout spell an NFT instance differently; the wrong one is a dead link.
    return url.includes("blockscout")
        ? `${url}/token/${contract}/instance/${tokenId}`
        : `${url}/nft/${contract}/${tokenId}`;
}

export function explorerAddressUrl(chainId: number, address: string): string | null {
    const url = VIEM_CHAINS[chainId]?.blockExplorers?.default.url;
    return url ? `${url}/address/${address}` : null;
}

/** Empty is a real answer: Robinhood testnet has no public faucet, so don't invent one. */
export const FAUCETS: Record<number, { label: string; url: string }[]> = {
    84532: [
        { label: "Base Sepolia ETH", url: "https://www.alchemy.com/faucets/base-sepolia" },
        { label: "more ETH faucets", url: "https://docs.base.org/base-chain/tools/network-faucets" },
        { label: "Base Sepolia USDC (Circle — scarce)", url: "https://faucet.circle.com/" },
    ],
    46630: [],
};

// Tokens whose mint(address,uint256) is PERMISSIONLESS, so the demo tops itself up with no faucet and
// no team involvement (gachamachine/contracts/src/TestUSDC.sol:16-18). An explicit allowlist, never a
// guess — a mint button pointed at a mainnet token is a revert at best.
export const MINTABLE_TEST_TOKENS: Record<number, string[]> = {
    84532: ["0x794A5456be0058a5B8B519AaC274347afC8320A4"],
    46630: ["0x96e040058E77DDd3FA1f2e216Aabe1c33e78DFC9"],
};

export function isMintableTestToken(chainId: number, address: string): boolean {
    if (!VIEM_CHAINS[chainId]?.testnet) return false;
    return (MINTABLE_TEST_TOKENS[chainId] ?? []).some((a) => a.toLowerCase() === address.toLowerCase());
}
