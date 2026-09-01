import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.API_BASE_URL ?? "https://dev-gacha.collectorcrypt.com/api";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));

        const url = new URL(`${API_BASE_URL}/getNfts`);
        for (const [key, value] of Object.entries(body)) {
            if (value !== undefined && value !== null) {
                url.searchParams.set(key, String(value));
            }
        }

        const response = await fetch(url.toString(), {
            method: "GET",
            cache: "no-store",
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            return NextResponse.json(
                { error: "Failed to get NFTs", status: response.status, details: text || response.statusText },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
