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
            // Error(string) reverts land in .reason; a custom error (PayIsPaused, QuoteExpired) only
            // ever appears as the decoded name.
            const reason = reverted.reason ?? reverted.data?.errorName;
            if (reason && reason !== "execution reverted") return reason;
        }
        if (e.shortMessage) return collapse(e.shortMessage);
    }
    return collapse(e instanceof Error ? e.message : String(e)) || "Something went wrong.";
}
