"use client";

import PrivyConnect from "@/app/components/PrivyConnect";
import NftGallery from "@/app/components/NftGallery";
import PackOpener from "@/app/components/PackOpener";
import { useWallets } from "@privy-io/react-auth/solana";
import { useState } from "react";
import Link from "next/link";

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

        {/* NFT Gallery - Always visible */}
        <div>
          <h2 className="text-2xl font-semibold mb-4">Your NFT Collection</h2>
          <NftGallery owner={owner} key={refreshKey} />
        </div>
      </div>
    </div>
  );
}
