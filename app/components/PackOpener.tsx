"use client";

import * as React from "react";
import { useWallets } from "@privy-io/react-auth/solana";
import { usePrivy } from "@privy-io/react-auth";

const DEFAULT_PACK_TYPE = process.env.NEXT_PUBLIC_PACK_TYPE ?? "pokemon_50";

type PackOpenerProps = {
    onPackOpened?: () => void;
};

type PackResult = {
    success: boolean;
    transactionSignature: string;
    nft_address: string;
    nftWon: {
        id: string;
        content: {
            files: Array<{
                uri: string;
                mime: string;
                cc_cdn?: string;
                cdn_uri?: string;
            }>;
            links: {
                image: string;
            };
            metadata: {
                name: string;
                symbol: string;
                attributes: Array<{
                    value: string;
                    trait_type: string;
                }>;
                insuredValue: string;
            };
        };
    };
    points: number;
    rarity: string;
};

export default function PackOpener({ onPackOpened }: PackOpenerProps) {
    const { ready, authenticated } = usePrivy();
    const { wallets } = useWallets();
    const wallet = wallets?.[0];

    const [isOpening, setIsOpening] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [packResult, setPackResult] = React.useState<PackResult | null>(null);
    const [buybackSuccess, setBuybackSuccess] = React.useState<string | null>(null);

    const openPack = async () => {
        if (!ready || !wallet) {
            setError("No wallet connected");
            return;
        }

        setIsOpening(true);
        setError(null);

        try {
            // Step 1: Generate pack
            const generateRes = await fetch("/api/generatePack", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    wallet: wallet.address,
                    packType: DEFAULT_PACK_TYPE,
                }),
            });

            if (!generateRes.ok) {
                throw new Error("Failed to generate pack");
            }

            const { transaction: buyTransaction, memo } = await generateRes.json();
            console.log("Buy transaction received:", buyTransaction);
            console.log("Memo received:", memo);

            // Step 2: Sign the buy transaction
            let signedBuyTx;
            try {
                // Convert base64 to Uint8Array for Solana wallet
                const transactionBytes = new Uint8Array(Buffer.from(buyTransaction, 'base64'));

                const signResult = await wallet.signTransaction({
                    transaction: transactionBytes
                });

                signedBuyTx = Buffer.from(signResult.signedTransaction).toString('base64');
                console.log("Signed buy transaction:", signedBuyTx);
            } catch (signError) {
                console.error("Sign error:", signError);
                throw new Error(`Failed to sign transaction: ${signError}`);
            }

            // Step 3: Submit the buy transaction
            const submitBuyRes = await fetch("/api/submitTransaction", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    transaction: signedBuyTx,
                }),
            });

            if (!submitBuyRes.ok) {
                throw new Error("Failed to submit buy transaction");
            }

            // Step 4: Open pack
            const openRes = await fetch("/api/openPack", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    memo: memo,
                }),
            });

            if (!openRes.ok) {
                throw new Error("Failed to open pack");
            }

            const openResult = await openRes.json();
            console.log("Pack opened successfully:", openResult);

            // Set the pack result to show the modal
            setPackResult(openResult);

            // Success! Refresh NFTs
            onPackOpened?.();

        } catch (e) {
            console.error("Full error object:", e);
            setError(e instanceof Error ? e.message : "Failed to open pack");
        } finally {
            setIsOpening(false);
        }
    };

    const closeResult = () => {
        setPackResult(null);
    };

    // Clear buyback success message after 5 seconds
    React.useEffect(() => {
        if (buybackSuccess) {
            const timer = setTimeout(() => {
                setBuybackSuccess(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [buybackSuccess]);

    const getInsuredValue = () => {
        const insuredValueAttr = packResult?.nftWon.content.metadata.attributes.find(
            attr => attr.trait_type === "Insured Value"
        );
        return insuredValueAttr ? `$${insuredValueAttr.value}` : "N/A";
    };

    const getGrade = () => {
        const gradeAttr = packResult?.nftWon.content.metadata.attributes.find(
            attr => attr.trait_type === "The Grade"
        );
        return gradeAttr?.value || "N/A";
    };

    return (
        <div>
            {/* Pack Opener Section - Only show if authenticated and has wallet */}
            {ready && authenticated && wallet ? (
                <div className="mb-6">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={openPack}
                            disabled={isOpening}
                            className={`px-6 py-3 rounded-lg font-semibold text-white transition-colors ${isOpening
                                ? "bg-gray-400 cursor-not-allowed"
                                : "bg-green-600 hover:bg-green-700"
                                }`}
                        >
                            {isOpening ? "Opening Pack..." : "Open $50 Pack"}
                        </button>

                        {/* Buyback Success Message */}
                        {buybackSuccess && (
                            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                                <span className="text-green-600">✓</span>
                                <span className="text-green-800 text-sm font-medium">
                                    Buyback successful! Transaction: {buybackSuccess.slice(0, 8)}...
                                </span>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="mt-2 text-sm text-red-600">
                            Error: {error}
                        </div>
                    )}
                </div>
            ) : null}

            {/* Pack Result - Will be positioned by parent */}
            {packResult && (
                <PackResultCard
                    packResult={packResult}
                    onClose={closeResult}
                    getInsuredValue={getInsuredValue}
                    getGrade={getGrade}
                    onBuybackSuccess={setBuybackSuccess}
                />
            )}
        </div>
    );
}

// Separate component for the pack result card
function PackResultCard({
    packResult,
    onClose,
    getInsuredValue,
    getGrade,
    onBuybackSuccess
}: {
    packResult: PackResult;
    onClose: () => void;
    getInsuredValue: () => string;
    getGrade: () => string;
    onBuybackSuccess: (signature: string) => void;
}) {
    const { wallets } = useWallets();
    const wallet = wallets?.[0];
    const [isBuyingBack, setIsBuyingBack] = React.useState(false);
    const [buybackError, setBuybackError] = React.useState<string | null>(null);

    const getSellPrice = () => {
        const insuredValueAttr = packResult?.nftWon.content.metadata.attributes.find(
            attr => attr.trait_type === "Insured Value"
        );
        const insuredValue = insuredValueAttr ? parseFloat(insuredValueAttr.value) : 0;
        const sellPrice = insuredValue * 0.85;
        return sellPrice.toFixed(2);
    };

    const handleBuyback = async () => {
        if (!wallet) {
            setBuybackError("No wallet connected");
            return;
        }

        setIsBuyingBack(true);
        setBuybackError(null);

        try {
            // Step 1: Generate buyback transaction
            const buybackRes = await fetch("/api/buyback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    playerAddress: wallet.address,
                    nftAddress: packResult.nft_address,
                }),
            });

            if (!buybackRes.ok) {
                throw new Error("Failed to generate buyback transaction");
            }

            const { serializedTransaction } = await buybackRes.json();

            // Step 2: Sign the buyback transaction
            const transactionBytes = new Uint8Array(Buffer.from(serializedTransaction, 'base64'));

            const signResult = await wallet.signTransaction({
                transaction: transactionBytes
            });

            const signedTx = Buffer.from(signResult.signedTransaction).toString('base64');

            // Step 3: Submit the buyback transaction
            const submitRes = await fetch("/api/submitTransaction", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    transaction: signedTx,
                }),
            });

            if (!submitRes.ok) {
                throw new Error("Failed to submit buyback transaction");
            }

            const submitResult = await submitRes.json();
            console.log("Buyback submit result:", submitResult);

            // Show success message with signature
            if (submitResult.success && submitResult.signature) {
                onBuybackSuccess(submitResult.signature);
            }

            // Success - close modal and refresh NFTs
            onClose();
        } catch (error) {
            console.error("Buyback error:", error);
            setBuybackError(error instanceof Error ? error.message : "Failed to buyback NFT");
        } finally {
            setIsBuyingBack(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    {/* Header */}
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">
                            🎉 You Won!
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-700 text-xl font-bold"
                        >
                            ×
                        </button>
                    </div>

                    {/* NFT Card */}
                    <div className="bg-gradient-to-br from-purple-100 to-blue-100 rounded-lg p-6 mb-6">
                        <div className="flex flex-col md:flex-row gap-6">
                            {/* Image */}
                            <div className="flex-shrink-0">
                                <img
                                    src={packResult.nftWon.content.files[0]?.cc_cdn || packResult.nftWon.content.links.image}
                                    alt={packResult.nftWon.content.metadata.name}
                                    className="w-64 h-auto rounded-lg shadow-lg"
                                />
                            </div>

                            {/* Details */}
                            <div className="flex-1 space-y-4">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                                        {packResult.nftWon.content.metadata.name}
                                    </h3>
                                    <div className="flex gap-4 mb-4">
                                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${packResult.rarity === 'Rare' ? 'bg-purple-200 text-purple-800' :
                                            packResult.rarity === 'Epic' ? 'bg-orange-200 text-orange-800' :
                                                packResult.rarity === 'Legendary' ? 'bg-yellow-200 text-yellow-800' :
                                                    'bg-green-200 text-green-800'
                                            }`}>
                                            {packResult.rarity}
                                        </span>
                                        <span className="px-3 py-1 bg-blue-200 text-blue-800 rounded-full text-sm font-semibold">
                                            Grade: {getGrade()}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="font-semibold text-gray-600">Insured Value:</span>
                                        <div className="text-lg font-bold text-green-600">{getInsuredValue()}</div>
                                    </div>
                                    <div>
                                        <span className="font-semibold text-gray-600">Points Earned:</span>
                                        <div className="text-lg font-bold text-blue-600">{packResult.points}</div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <span className="font-semibold text-gray-600">NFT Address:</span>
                                        <div className="text-xs font-mono break-all text-gray-800">
                                            {packResult.nft_address}
                                        </div>
                                    </div>
                                </div>

                                {/* Transaction Details - moved inside card */}
                                <div className="bg-white bg-opacity-60 rounded-lg p-3">
                                    <h4 className="font-semibold text-gray-700 mb-2 text-sm">Transaction</h4>
                                    <div className="text-xs font-mono break-all text-gray-600">
                                        {packResult.transactionSignature}
                                    </div>
                                </div>

                                {/* Buyback Error - moved inside card */}
                                {buybackError && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                        <p className="text-sm text-red-600">Error: {buybackError}</p>
                                    </div>
                                )}

                                {/* Action Buttons - moved inside card */}
                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={handleBuyback}
                                        disabled={isBuyingBack}
                                        className={`flex-1 py-2 px-4 rounded-lg font-semibold text-white transition-colors text-sm ${isBuyingBack
                                            ? "bg-gray-400 cursor-not-allowed"
                                            : "bg-orange-600 hover:bg-orange-700"
                                            }`}
                                    >
                                        {isBuyingBack ? "Processing..." : `Sell for $${getSellPrice()}`}
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-semibold transition-colors text-sm"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
