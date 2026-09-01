"use client";

import { createPublicClient, createWalletClient, custom, http, type Chain } from "viem";
import type { ConnectedWallet } from "@privy-io/react-auth";
import { VIEM_CHAINS, rpcUrlFor } from "./chains";

// Privy's EIP-1193 type, not viem's: the two spell provider.on() differently and do not interchange.
type WalletProvider = Awaited<ReturnType<ConnectedWallet["getEthereumProvider"]>>;

export class UnsupportedChainError extends Error {}
export class WrongChainError extends Error {}

/**
 * TWO clients, on purpose.
 *
 * WRITES go through the wallet — custom(provider) is the only transport that can sign.
 *
 * READS go through http(). A wallet's EIP-1193 provider is not a general-purpose RPC: it answers for
 * whatever chain the WALLET is on (Privy's own switchChain doc says existing provider instances are
 * not updated), and because the gateway, vault and card sit at the SAME address on nearly every chain
 * a wrong-chain read answers confidently and wrongly. viem's chain definitions already carry a public
 * RPC, so http() needs no env var.
 */
export async function getEvmClients(wallet: ConnectedWallet, chainId: number) {
    const chain: Chain | undefined = VIEM_CHAINS[chainId];
    if (!chain) throw new UnsupportedChainError(`This demo has no viem chain definition for ${chainId}`);

    const provider = await ensureWalletChain(wallet, chainId);

    return {
        chain,
        // A JSON-RPC account (address form): the wallet owns the key, builds nonce and fees, and shows
        // its own UI. NOT toViemAccount({wallet}) — that is a LOCAL account, which makes viem build the
        // transaction and call eth_signTransaction, which MetaMask does not implement.
        walletClient: createWalletClient({
            account: wallet.address as `0x${string}`,
            chain,
            transport: custom(provider),
        }),
        publicClient: createPublicClient({
            chain,
            transport: http(rpcUrlFor(chainId)),
            pollingInterval: 1500,
        }),
    };
}

/** Move the wallet to `chainId` and return a provider PROVEN to be on it. Safe to call when already there. */
export async function ensureWalletChain(wallet: ConnectedWallet, chainId: number): Promise<WalletProvider> {
    const chain = VIEM_CHAINS[chainId];
    if (!chain) throw new UnsupportedChainError(`This demo has no viem chain definition for ${chainId}`);

    // Privy reports the wallet's chain CAIP-2 style ("eip155:84532"), not as a number. pop() so a bare
    // "84532" also parses instead of falling through as NaN.
    if (Number(String(wallet.chainId).split(":").pop()) !== chainId) {
        // Keeps Privy's own state in step, and is the only path that offers wallet_addEthereumChain
        // for a chain the wallet has never seen (Robinhood).
        await wallet.switchChain(chainId);
    }

    // AFTER switchChain, never before, and never cached across a switch.
    const provider = await wallet.getEthereumProvider();
    await assertProviderChain(provider, chain);
    return provider;
}

/** What chain the wallet would actually SIGN on — the provider's answer, not Privy's cached state. */
export async function readWalletChainId(wallet: ConnectedWallet): Promise<number> {
    const provider = await wallet.getEthereumProvider();
    return Number(await provider.request({ method: "eth_chainId" }));
}

/**
 * wallet.switchChain() is NOT enough, so trust only the provider's own eth_chainId.
 *
 * On a Privy EMBEDDED wallet switchChain is a bare React setState, and getEthereumProvider() builds
 * the provider from the chain id captured in the render that produced this wallet object — so a
 * provider fetched in the same tick is still on the OLD chain (mainnet, as we set no defaultChain),
 * and viem throws ChainMismatchError. On an EXTERNAL wallet switchChain returns early whenever Privy's
 * cached chainId already matches, even if the wallet has since moved. Both providers answer
 * wallet_switchEthereumChain themselves, so ask the provider directly.
 */
async function assertProviderChain(provider: WalletProvider, chain: Chain) {
    const read = async () => Number(await provider.request({ method: "eth_chainId" }));
    if ((await read()) === chain.id) return;

    await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${chain.id.toString(16)}` }],
    });

    // An injected wallet can resolve the switch before eth_chainId reports it; embedded is instant.
    for (let i = 0; i < 20; i++) {
        if ((await read()) === chain.id) return;
        await new Promise((r) => setTimeout(r, 150));
    }
    throw new WrongChainError(
        `Wallet stayed on chain ${await read()} after switching; ${chain.name} (${chain.id}) is required.`
    );
}

export type EvmClients = Awaited<ReturnType<typeof getEvmClients>>;

/** Read-only client for a chain, with no wallet — used for balances before anything is connected. */
export function getReadClient(chainId: number) {
    const chain = VIEM_CHAINS[chainId];
    if (!chain) throw new UnsupportedChainError(`This demo has no viem chain definition for ${chainId}`);
    return createPublicClient({ chain, transport: http(rpcUrlFor(chainId)), pollingInterval: 1500 });
}
