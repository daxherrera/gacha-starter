"use client";

import PrivyConnect from "@/app/components/PrivyConnect";
import NftGallery from "@/app/components/NftGallery";
import WalletCards from "@/app/components/WalletCards";
import PackOpener from "@/app/components/PackOpener";
import { useWallets } from "@privy-io/react-auth/solana";
import { useState } from "react";
import Link from "next/link";

const PACK_TYPE = process.env.NEXT_PUBLIC_PACK_TYPE ?? "pokemon_50";

export default function Home() {
  const { wallets } = useWallets();
  const owner = wallets?.[0]?.address;
  const [refreshKey, setRefreshKey] = useState(0);

  const handlePackOpened = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* GitHub Link */}
      <div className="text-center mb-4 space-x-2">
        <a href="https://github.com/daxherrera/gacha-starter" target="_blank">
          <button className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded">
            Go to GitHub Repo
          </button>
        </a>
        <Link href="/evm">
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded">
            Try the EVM version →
          </button>
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-8 text-center">
        Collector Crypt Gacha Starter
      </h1>

      {/* Wallet Connection */}
      <div className="mb-8 text-center">
        <PrivyConnect />
      </div>

      <div className="space-y-8">
        {/* Pack Opener */}
        <PackOpener onPackOpened={handlePackOpened} />

        {/* What YOU hold, keyed on the connected wallet. */}
        <WalletCards owner={owner} key={`wallet-${refreshKey}`} />

        {/* What the MACHINE holds. Two different questions, two different sources. */}
        <NftGallery code={PACK_TYPE} />
      </div>
    </div>
  );
}
