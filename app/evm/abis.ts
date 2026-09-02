// viem 2.43.5 already ships erc20Abi (allowance/approve/balanceOf) and erc721Abi (approve/getApproved).
// Only the three gacha-specific fragments are hand-written, per gachamachine/scripts/evm-e2e.ts:47-54.
import { parseAbi } from "viem";

export { erc20Abi, erc721Abi } from "viem";

// GachaVault.pay — the memo channel. `token` is a parameter because the amount cannot identify the
// lane: two 6-decimal lanes are indistinguishable by amount alone.
// The error fragments are load-bearing, not decoration: without them viem can only print a bare
// selector. The two lanes fail in different dialects — Circle's USDC reverts with a string, an
// OpenZeppelin v5 token (tUSDC) reverts with ERC20InsufficientBalance/Allowance.
export const payAbi = parseAbi([
    "function pay(address token, uint256 amount, string memo)",
    "error PayIsPaused()",
    "error TokenNotApproved()",
    "error SafeERC20FailedOperation(address token)",
    "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
    "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
]);

// `token` comes FIRST and is inside the signed quote — the lane is the server's decision, not the
// seller's. Any other value reverts with BadSignature before anything moves.
export const vaultAbi = parseAbi([
    "function sellBack(address token, uint256 tokenId, uint256 amount, uint256 deadline, uint256 quoteId, bytes signature)",
    // Every revert sellBack can reach, so a failed sale names itself instead of showing a selector.
    "error BuybackIsPaused()",
    "error TokenNotApproved()",
    "error QuoteExpired()",
    "error QuoteAlreadyUsed()",
    "error NotTokenOwner()",
    "error InsufficientFloat()",
    "error BadSignature()",
]);

// Testnet only — see MINTABLE_TEST_TOKENS in ./chains.
export const testUsdcAbi = parseAbi(["function mint(address to, uint256 amount)"]);

// ERC721Enumerable, hand-written for ONE reason: viem's erc721Abi carries a misnamed overload,
// tokenByIndex(address,uint256), whose selector is not tokenOfOwnerByIndex's — calling it reverts.
export const erc721EnumerableAbi = parseAbi([
    "function balanceOf(address owner) view returns (uint256)",
    "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
    "function tokenURI(uint256 tokenId) view returns (string)",
]);
