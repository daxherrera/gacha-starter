"use client";

import { createPublicClient, createWalletClient, custom, http, type Chain } from "viem";
import type { ConnectedWallet } from "@privy-io/react-auth";
import { VIEM_CHAINS, rpcUrlFor } from "./chains";

export class UnsupportedChainError extends Error {}

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

    // Privy reports the wallet's chain CAIP-2 style ("eip155:84532"), not as a number. pop() so a bare
    // "84532" also parses instead of falling through as NaN.
    if (Number(String(wallet.chainId).split(":").pop()) !== chainId) {
        await wallet.switchChain(chainId);
    }

    // AFTER switchChain, never before, and never cached across a switch.
    const provider = await wallet.getEthereumProvider();

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

export type EvmClients = Awaited<ReturnType<typeof getEvmClients>>;

/** Read-only client for a chain, with no wallet — used for balances before anything is connected. */
export function getReadClient(chainId: number) {
    const chain = VIEM_CHAINS[chainId];
    if (!chain) throw new UnsupportedChainError(`This demo has no viem chain definition for ${chainId}`);
    return createPublicClient({ chain, transport: http(rpcUrlFor(chainId)), pollingInterval: 1500 });
}
