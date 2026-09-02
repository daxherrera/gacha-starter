import { BaseError, ContractFunctionRevertedError } from "viem";

const collapse = (s: string) =>
    s
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join(" ");

/**
 * viem writes a revert as TWO lines — header, then reason — so `e.message.split("\n")[0]` renders
 * `The contract function "pay" reverted with the following reason:` and drops the only useful half.
 */
export function errorText(e: unknown): string {
    if (e instanceof BaseError) {
        const reverted = e.walk((err) => err instanceof ContractFunctionRevertedError);
        if (reverted instanceof ContractFunctionRevertedError) {
            // An Error(string) revert lands in .reason. A custom error only ever appears decoded, and
            // its args carry the point: ERC20InsufficientBalance without the two numbers says nothing.
            if (reverted.reason && reverted.reason !== "execution reverted") return reverted.reason;
            const decoded = reverted.data;
            if (decoded?.errorName) return `${decoded.errorName}(${(decoded.args ?? []).map(String).join(", ")})`;
        }
        if (e.shortMessage) return collapse(e.shortMessage);
    }
    return collapse(e instanceof Error ? e.message : String(e)) || "Something went wrong.";
}

/** Every EVM route answers { code, error } — the code alone reaches a buyer as an all-caps token. */
export function apiErrorText(body: Record<string, unknown>, fallback: string): string {
    const code = body?.code ? String(body.code) : "";
    const text = body?.error ? String(body.error) : "";
    if (text && code) return `${text} (${code})`;
    return text || code || fallback;
}
