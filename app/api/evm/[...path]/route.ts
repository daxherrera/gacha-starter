import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.API_BASE_URL ?? "https://dev-gacha.collectorcrypt.com/api";
const API_KEY = process.env.API_KEY;

// The whole EVM surface in one file. An ALLOWLIST, not a passthrough: `path` comes off the URL, so
// concatenating it unchecked would make this an open proxy for every endpoint our key can reach.
// These two arrays are also the documentation of what /evm uses.
const GETS = ['chains', 'pack/status', 'buyback/available', 'buyback/check', 'vrf/verify'];
const POSTS = ['generatePack', 'openPack', 'buyback', 'buyback/settle'];

// Upstream openPack can run for minutes; anything longer than this the client retries anyway.
export const maxDuration = 60;

async function forward(request: NextRequest, segments: string[] | undefined, method: 'GET' | 'POST') {
    const path = (segments ?? []).join('/');
    if (!(method === 'GET' ? GETS : POSTS).includes(path)) {
        return NextResponse.json(
            { error: `Unknown EVM endpoint: ${method} /api/evm/${path}` },
            { status: 404 }
        );
    }

    const url = new URL(`${API_BASE_URL}/evm/${path}`);
    request.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

    // Unlike app/api/generatePack/route.ts, the body is forwarded verbatim — no field rewriting. The
    // EVM page sends packType, chainId and token explicitly and the server must see exactly those.
    const upstream = await fetch(url, {
        method,
        // API_KEY! would send the literal string "undefined"; omitting the header is what actually
        // reproduces "no key" (gachamachine/proxy.ts:385 is `if (apiKey)`).
        headers: { 'Content-Type': 'application/json', ...(API_KEY ? { 'x-api-key': API_KEY } : {}) },
        ...(method === 'POST' ? { body: await request.text() } : {}),
        cache: 'no-store',
    });

    // Status AND body verbatim, always. openPack answers 202 WAITING_FOR_PAYMENT / MINTING, 410
    // PACK_EXPIRED and 502 MINT_PENDING, and the client branches on every one — so this must NOT
    // replace the body the way app/api/openPack/route.ts:19-24 does.
    return new NextResponse(await upstream.text(), {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
    });
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
    return forward(request, (await ctx.params).path, 'GET');
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
    return forward(request, (await ctx.params).path, 'POST');
}
