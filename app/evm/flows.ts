"use client";

import type { ConnectedWallet } from "@privy-io/react-auth";
import { formatUnits } from "viem";
import { erc20Abi, erc721Abi, payAbi, vaultAbi } from "./abis";
import { buybackQuoteUntilReady, evmPost, openPackUntilDone, until } from "./api";
import { getEvmClients } from "./clients";
import { apiErrorText } from "./errors";
import { clearPending, forgetCard, patchPending, rememberCard, savePending, type OwnedCard } from "./resume";
import { evmCardImage, type EvmGeneratePack, type EvmLane, type EvmOpenPack } from "./types";

export type Progress = (message: string) => void;

/**
 * generatePack -> approve -> pay -> openPack, in that order for a reason.
 *
 * EVM payments are FINAL. The pending record is written BEFORE any money moves and the pay tx hash is
 * persisted the instant writeContract resolves — before the receipt is awaited — because the tab can
 * close during that wait and the hash is what makes the pack completable afterwards. Nothing clears
 * the record except an openPack 200.
 */
export async function buyPack(opts: {
    wallet: ConnectedWallet;
    chainId: number;
    lane: EvmLane;
    packType: string;
    onProgress: Progress;
}): Promise<EvmOpenPack> {
    const { wallet, chainId, lane, packType, onProgress } = opts;
    const player = wallet.address as `0x${string}`;

    onProgress("Reserving the pack...");
    const gen = await evmPost<EvmGeneratePack>("generatePack", {
        playerAddress: player,
        packType,
        chainId,
        token: lane.key,
    });
    if (gen.status !== 200) {
        throw new Error(apiErrorText(gen.body, `generatePack ${gen.status}`));
    }
    const pack = gen.body;

    // The lane we asked for must be the lane that got frozen on the row, or every later step is
    // measuring the wrong token.
    if (pack.token.address.toLowerCase() !== lane.address.toLowerCase()) {
        throw new Error(`generatePack priced this pack in ${pack.token.address}, not the requested ${lane.address}`);
    }

    // Base units, verbatim. Never parseUnits(pack.amountHuman, ...) — decimals are per lane and at 18
    // that arithmetic drifts.
    const amount = BigInt(pack.amount);
    const token = pack.token.address;

    savePending({
        memo: pack.memo,
        chainId: pack.chainId,
        packType,
        laneKey: pack.token.key,
        tokenSymbol: pack.token.symbol,
        tokenDecimals: pack.token.decimals,
        amount: pack.amount,
        stage: "generated",
        createdAt: Date.now(),
    });

    const { walletClient, publicClient } = await getEvmClients(wallet, pack.chainId);

    // Fail on balance BEFORE the approve, or pay() reverts inside the token after a wasted approve.
    // Fails OPEN: a rate-limited read must not block a buy that pay() would have accepted.
    const balance = (await publicClient
        .readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [player] })
        .catch(() => null)) as bigint | null;
    if (balance !== null && balance < amount) {
        // Safe to clear ONLY here: nothing is signed yet, so no payment can be stranded — and it
        // leaves the lane unlocked so the buyer can pick one they can afford.
        clearPending(pack.memo);
        throw new Error(
            `You have ${formatUnits(balance, pack.token.decimals)} ${pack.token.symbol} but this pack costs ` +
                `${pack.amountHuman} ${pack.token.symbol}. Nothing was charged.`,
        );
    }

    const allowance = (await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [player, pack.paymentContract],
    })) as bigint;

    if (allowance < amount) {
        onProgress(`Approving ${pack.token.symbol}...`);
        const approveHash = await walletClient.writeContract({
            address: token,
            abi: erc20Abi,
            functionName: "approve",
            args: [pack.paymentContract, amount],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
        // A receipt is not the same as the next load-balanced node seeing it.
        const visible = await until(
            () =>
                publicClient.readContract({
                    address: token,
                    abi: erc20Abi,
                    functionName: "allowance",
                    args: [player, pack.paymentContract],
                }) as Promise<bigint>,
            (v) => v >= amount,
        );
        if (!visible) throw new Error("The approval is not visible on-chain yet — try again in a moment.");
        patchPending(pack.memo, { stage: "approved" });
    }

    onProgress(`Paying ${pack.amountHuman} ${pack.token.symbol}...`);
    const payTxHash = await walletClient.writeContract({
        address: pack.paymentContract,
        abi: payAbi,
        functionName: "pay",
        args: [token, amount, pack.memo],
    });

    // THE critical line. Persisted before the receipt is awaited.
    patchPending(pack.memo, { payTxHash, stage: "paid" });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: payTxHash });
    if (receipt.status !== "success") throw new Error(`pay() reverted (${payTxHash})`);

    onProgress("Opening the pack...");
    const award = await openPackUntilDone(pack.memo, payTxHash, (code) => onProgress(`Opening the pack (${code})...`));

    rememberCard(awardToCard(award));
    clearPending(pack.memo);
    return award;
}

export function awardToCard(award: EvmOpenPack): OwnedCard {
    return {
        memo: award.memo,
        // The same token id on another chain is a different card, so the chain travels with it.
        chainId: award.chain_id,
        tokenId: award.evm_token_id,
        contract: award.evm_contract_address,
        name: award.nftWon?.content?.metadata?.name ?? award.card_name ?? undefined,
        image: evmCardImage(award.nftWon),
        insuredValue: award.insured_value,
        rarityLabel: award.rarity_label,
        awardedAt: Date.now(),
    };
}

/** Finish a pack that was paid for but never opened. Idempotent — openPack replays forever. */
export async function resumePack(memo: string, payTxHash: string | undefined, onProgress: Progress) {
    const award = await openPackUntilDone(memo, payTxHash, (code) => onProgress(`Opening (${code})...`));
    rememberCard(awardToCard(award));
    clearPending(memo);
    return award;
}

/**
 * Quote -> approve the vault for the card -> sellBack -> settle.
 *
 * sellBack pulls the NFT, pays the token and burns the card in ONE transaction. The gas limit comes
 * from the quote and is not negotiable: EIP-150 forwards only 63/64 of remaining gas to the inner
 * burn, so a bare estimate starves the collection's reentrancy guard and the whole atomic sell
 * unwinds. Measured over a 500-pack run that hit about 15% of sales.
 */
export async function sellCard(opts: {
    wallet: ConnectedWallet;
    card: { memo: string; chainId: number; tokenId: string; contract: `0x${string}` };
    onProgress: Progress;
}): Promise<{ txHash: `0x${string}`; refundAmount: number; symbol: string }> {
    const { wallet, card, onProgress } = opts;
    const player = wallet.address as `0x${string}`;

    onProgress("Getting a signed quote...");
    let quote = await buybackQuoteUntilReady(
        { playerAddress: player, evmTokenId: card.tokenId, evmContract: card.contract, chainId: card.chainId },
        (code) => onProgress(`Waiting for the card to settle (${code})...`),
    );

    // The quote lives 10 minutes. Re-request rather than race the deadline; re-requesting while one is
    // live returns the same amount and deadline.
    if (Date.now() / 1000 > quote.deadline - 60) {
        quote = await buybackQuoteUntilReady(
            { playerAddress: player, evmTokenId: card.tokenId, evmContract: card.contract, chainId: card.chainId },
            onProgress,
        );
    }

    // No local fallback, deliberately: guessing this number is the failure mode.
    if (!quote.suggestedGasLimit) {
        throw new Error("buyback quote returned no suggestedGasLimit — refusing to guess a gas limit");
    }

    const { walletClient, publicClient } = await getEvmClients(wallet, quote.chainId);

    const approved = (await publicClient.readContract({
        address: quote.cardContract,
        abi: erc721Abi,
        functionName: "getApproved",
        args: [BigInt(quote.tokenId)],
    })) as string;

    if (approved.toLowerCase() !== quote.vault.toLowerCase()) {
        onProgress("Approving the vault for your card...");
        const approveHash = await walletClient.writeContract({
            address: quote.cardContract,
            abi: erc721Abi,
            functionName: "approve",
            args: [quote.vault, BigInt(quote.tokenId)],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
        const visible = await until(
            () =>
                publicClient.readContract({
                    address: quote.cardContract,
                    abi: erc721Abi,
                    functionName: "getApproved",
                    args: [BigInt(quote.tokenId)],
                }) as Promise<string>,
            (v) => String(v).toLowerCase() === quote.vault.toLowerCase(),
        );
        if (!visible) throw new Error("The card approval is not visible on-chain yet — try again in a moment.");
    }

    onProgress(`Selling back for ${quote.refundAmount} ${quote.token.symbol}...`);
    const txHash = await walletClient.writeContract({
        address: quote.vault,
        abi: vaultAbi,
        functionName: "sellBack",
        // paymentToken comes from the signed quote — the lane is the pack's, not the seller's choice.
        args: [
            quote.paymentToken,
            BigInt(quote.tokenId),
            BigInt(quote.refundAmountBase),
            BigInt(quote.deadline),
            BigInt(quote.quoteId),
            quote.signature,
        ],
        gas: BigInt(quote.suggestedGasLimit),
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
        throw new Error(
            "sellBack reverted — your wallet may have overridden the gas limit. The quote is still live; try again.",
        );
    }

    // Fast settle so it shows in status right away. 409 just means the webhook beat us to it.
    onProgress("Settling...");
    await evmPost("buyback/settle", { txHash, chainId: quote.chainId });

    forgetCard(card.memo);
    return { txHash, refundAmount: quote.refundAmount, symbol: quote.token.symbol };
}
