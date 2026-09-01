# Gacha Starter

Two working demos of the Collector Crypt gacha API in one app:

| Route | Chain | Pay with |
|---|---|---|
| `/` | Solana | SPL USDC — the server builds the transaction, you sign it |
| `/evm` | EVM (multichain) | An ERC-20 lane — you call `pay()` yourself |

Both are thin clients. Every route under `app/api/` is a small forwarder that attaches your
`x-api-key`; the roll, the VRF, the inventory and the payouts all live in the gacha API.

## Getting Started

1. Go to Privy and get an app id + client id.
2. Get an API key from Collector Crypt on Discord. **One key covers both demos** — the API validates
   `x-api-key` the same way on `/api/evm/*` as on the Solana routes, so EVM mode needs no new secret.
3. Copy `.env.example` to `.env` and fill it in.
4. Deploy to Vercel.

### Test funds

**Solana (`/`)** — dev USDC from https://spl-token-faucet.com/?token-name=USDC-Dev, mint
`Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`.

**EVM (`/evm`)** — you need two things:

- **Native ETH for gas.** The machine sponsors the gas for the card mint only; your `approve`, `pay`
  and `sellBack` are ordinary transactions you pay for. Base Sepolia:
  https://www.alchemy.com/faucets/base-sepolia.
- **The payment token.** On a testnet `tUSDC` lane the page shows a **Mint 100 tUSDC** button —
  that token's `mint()` is permissionless, so you can top yourself up. Real Base Sepolia USDC is
  scarce and cannot be minted; prefer the `tUSDC` lane.

## Solana vs EVM: what changes

| | Solana | EVM |
|---|---|---|
| Payment | server-built transaction you sign | you call `pay(token, amount, memo)` yourself |
| Prize | NFT transferred to you | ERC-721 minted to you |
| Buyback | server-built transaction | server-signed quote, you call `sellBack` |
| Refunds | supported | **none — payments are final** |
| Networks | one | several — carry `chainId` everywhere |
| `rarity` | `"Epic"` | `"epic"` — read `rarity_label` for the shared form |
| Values | base units | whole USD (`insured_value`, `buyback_amount`) |
| `points` | earned per pack | always `0` |

Full contract: https://docs.collectorcrypt.com/gacha/evm-api

## Things this demo does on purpose

- **`sellBack` is sent with the quote's `suggestedGasLimit`, never a bare estimate.** The call pulls
  the NFT, pays you and burns the card in one transaction, and EIP-150 forwards only 63/64 of the
  remaining gas to that final burn — a tight estimate starves it and the whole atomic sell unwinds.
  Measured over a 500-pack run that hit about 15% of sales. Over-asking is free; unused gas is refunded.
- **Amounts are never recomputed from a human number.** `amount` and `refundAmountBase` come back in
  base units and are passed through verbatim. Decimals are per lane and are not always 6.
- **`chainId` travels with every token id.** The gateway, vault and card sit at the same address on
  nearly every chain, so token 2615 on Base and on Robinhood are different cards.
- **The memo is persisted before any money moves**, and the pay transaction hash the instant it
  exists — before its receipt is awaited. Payments are final, so a closed tab must not be able to
  strand one. `/evm` shows an "Unfinished packs" banner that completes them; opening is idempotent.
- **Your cards are read from the card contract, not from an NFT API.** `CollectorCrypt` is
  ERC721Enumerable, so `balanceOf` + `tokenOfOwnerByIndex` over multicall3 is the authoritative list:
  no API key, nothing to index, no lag behind the mint, and it works on Robinhood Chain, which the
  hosted NFT APIs do not cover. `localStorage` is kept only for the memo and the resume banner.
- **"In the machine" and "Your cards" are two different questions, from two different APIs.**
  `/api/getNfts` returns the machine's POOL — its handler reads `code`, `rarity`, `page` and `limit`
  and ignores an `owner` param, so it can never answer what a wallet holds. The wallet grid comes from
  the Collector Crypt cards API on Solana, and straight off the card contract on EVM.
- **Balances are read client-side.** On EVM a balance needs no backend, unlike the Solana
  `/api/getUsdcBalance` route which exists because the RPC lives server-side.
- **The chain and lane picker is driven by `GET /api/evm/chains` at runtime.** Nothing is hardcoded —
  paused, not-ready and unknown chains are greyed out with the reason.

`showWalletUIs: false` in `app/providers.tsx` keeps the demo fast by signing without a confirmation
step. A real product should set it to `true` so people see what they are paying.

## Documentation

- Solana API: https://docs.collectorcrypt.com/gacha/api
- EVM API: https://docs.collectorcrypt.com/gacha/evm-api
- Provable fairness: https://docs.collectorcrypt.com/gacha/vrf
