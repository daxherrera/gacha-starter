import NftGallery from "../components/NftGallery";

// The machine's pool on its own page. For a WALLET's cards see WalletCards, which uses a different
// API — /api/getNfts has no owner filter.
export default function NftsPage() {
    const code = process.env.NEXT_PUBLIC_PACK_TYPE ?? "pokemon_50";

    return (
        <main className="container mx-auto px-4 py-8">
            <NftGallery code={code} />
        </main>
    );
}
