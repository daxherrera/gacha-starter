'use client';

import React from 'react';
import { PrivyProvider, SUPPORTED_CHAINS } from '@privy-io/react-auth';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { robinhood, robinhoodTestnet } from '@/app/evm/chains';

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID!;

if (!appId || !clientId) {
    throw new Error(
        'Missing Privy env vars. Set NEXT_PUBLIC_PRIVY_APP_ID and NEXT_PUBLIC_PRIVY_CLIENT_ID.'
    );
}

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <PrivyProvider
            appId={appId}
            clientId={clientId}
            config={{
                // Put wallet first so the Privy modal prioritizes wallet connect
                loginMethods: ['google', 'wallet', 'email'],

                // Ensure Solana wallets are actually offered in the UI
                appearance: {
                    walletChainType: 'ethereum-and-solana',
                    // Add theme to potentially fix rendering issues
                    theme: 'light',
                },

                embeddedWallets: {
                    solana: { createOnLogin: 'users-without-wallets' },
                    ethereum: { createOnLogin: 'users-without-wallets' },
                    showWalletUIs: false,
                },

                externalWallets: { solana: { connectors: toSolanaWalletConnectors() } },

                // supportedChains REPLACES Privy's default list rather than merging into it, so spread
                // the SDK's own defaults — otherwise a wallet sitting on Ethereum mainnet becomes
                // "unsupported" and gets a switch-network prompt on the Solana page too. Robinhood is
                // added because viem ships no definition for it and Privy refuses switchChain on a
                // chain that is not in this list.
                //
                // Deliberately NO `defaultChain`: setting it turns on
                // shouldEnforceDefaultChainOnConnect, which makes WalletConnect require that chain at
                // session init. The EVM page calls wallet.switchChain(chainId) explicitly instead.
                supportedChains: [...SUPPORTED_CHAINS, robinhood, robinhoodTestnet],

                solana: {
                    rpcs: {
                        'solana:mainnet': {
                            rpc: createSolanaRpc('https://api.mainnet-beta.solana.com'),
                            rpcSubscriptions: createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com'),
                        },
                        'solana:devnet': {
                            rpc: createSolanaRpc('https://api.devnet.solana.com'),
                            rpcSubscriptions: createSolanaRpcSubscriptions('wss://api.devnet.solana.com'),
                        },
                    },
                },
            }}
        >
            {children}
        </PrivyProvider>
    );
}