import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.API_BASE_URL ?? "https://dev-gacha.collectorcrypt.com/api";
const API_KEY = process.env.API_KEY;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        console.log("Submit transaction request body:", body);

        // Ensure we're sending the transaction in the right format
        const apiRequestBody = {
            signedTransaction: body.transaction,
        };

        console.log("Sending to API:", apiRequestBody);

        const response = await fetch(`${API_BASE_URL}/submitTransaction`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": API_KEY!,
            },
            body: JSON.stringify(apiRequestBody),
        });

        console.log("Submit transaction API response status:", response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.log("Submit transaction API error:", errorText);

            return NextResponse.json(
                { error: `Failed to submit transaction: ${response.statusText}`, details: errorText },
                { status: response.status }
            );
        }

        const data = await response.json();
        console.log("Submit transaction success:", data);
        return NextResponse.json(data);
    } catch (error) {
        console.error("Submit transaction internal error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
