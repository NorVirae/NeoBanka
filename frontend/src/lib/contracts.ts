// src/lib/contracts.ts

// ===== PER-CHAIN REGISTRY (read from env) =====
const env = (import.meta as any).env || {};

export const CHAIN_REGISTRY = {
  hedera: {
    chainId: Number(env.VITE_HEDERA_CHAIN_ID) || 296,
    rpc: env.VITE_HEDERA_RPC || "",
    settlement: env.VITE_HEDERA_SETTLEMENT || "",
    tokens: {
      HBAR: env.VITE_HEDERA_HBAR || "",
      USDT: env.VITE_HEDERA_USDT || "",
      xZAR: env.VITE_HEDERA_XZAR || "",
      cNGN: env.VITE_HEDERA_CNGN || "",
    },
  },
  ethereum: {
    chainId: Number(env.VITE_ETHEREUM_CHAIN_ID) || 11155111,
    rpc: env.VITE_ETHEREUM_RPC || "https://ethereum-sepolia-rpc.publicnode.com",
    settlement: env.VITE_ETHEREUM_SETTLEMENT || "",
    tokens: {
      USDT: env.VITE_ETHEREUM_USDT || "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06",
      xZAR: env.VITE_ETHEREUM_XZAR || "0x48f07301e9e29c3c38a80ae8d9ae771f224f1054",
      cNGN: env.VITE_ETHEREUM_CNGN || "0x17CDB2a01e7a34CbB3DD4b83260B05d0274C8dab",
    },
  },
  polygon: {
    chainId: Number(env.VITE_POLYGON_CHAIN_ID) || 137,
    rpc: env.VITE_POLYGON_RPC || "https://polygon-rpc.com",
    settlement: env.VITE_POLYGON_SETTLEMENT || "",
    tokens: {
      HBAR: env.VITE_POLYGON_HBAR || "",
      USDT: env.VITE_POLYGON_USDT || "",
      xZAR: env.VITE_POLYGON_XZAR || "",
      cNGN: env.VITE_POLYGON_CNGN || "",
    },
  },
} as const;
  
  // ===== HEDERA TESTNET CONFIG =====
export const HEDERA_TESTNET = {
    chainId: 296,
    chainName: "Hedera Testnet",
    nativeCurrency: {
      name: "HBAR",
      symbol: "HBAR",
      decimals: 18,
    },
    rpcUrls: [env.VITE_HEDERA_RPC],
    blockExplorerUrls: ["https://hashscan.io/testnet"],
  } as const;
  
  // ===== VAULT ABI =====
export const VAULT_ABI = [
  "function depositLiquidity(uint256 assets) external returns (uint256 shares)",
  "function withdrawProfits(uint256 impactAllocationBps) external returns (uint256 assets)",
  "function depositLiquidityWithoutShares(uint256 amount) external",
  "function moveFromVaultToWallet(uint256 amount, address tradingWallet) external",
  "function moveFromWalletToVault(uint256 amount, uint256 profitAmount, address fromWallet) external",
  "function returnAllCapital(address fromWallet) external",
  "function getUserShareBalance(address user) external view returns (uint256)",
  "function getBalanceUser(address user) external view returns (uint256)",
  "function getBalanceVault() external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function shareToUser(address user) public view returns (uint256)",
  "function totalSupply() public view returns (uint256)",
  "function totalAssets() public view returns (uint256)",
  "function getSharePrice() external view returns (uint256)",
  "function getAvailableAssets() external view returns (uint256)",
  "function totalAllocated() public view returns (uint256)",
  "function getVaultState() external view returns (uint256, uint256, uint256, uint256, uint256)",
  "function previewDeposit(uint256 assets) public view returns (uint256)",
  "function previewRedeem(uint256 shares) public view returns (uint256)",
  "function previewWithdrawalFee(uint256 assets) external view returns (uint256)",
  "function minDeposit() public view returns (uint256)",
  "function maxAllocationBps() public view returns (uint256)",
  "function withdrawalFeeBps() public view returns (uint256)",
  "function paused() public view returns (bool)",
  "function asset() public view returns (address)",
  "function feeRecipient() public view returns (address)",
  "function getTotalAccumulatedFees() external view returns (uint256)",
  "function accumulatedWithdrawalFees() public view returns (uint256)",
  "function withdrawFees() external",
  "function impactPool() public view returns (address)",
  "function getUserProfits(address user) external view returns (uint256)",
  "function getUserTotalDeposited(address user) external view returns (uint256)",
  "function addAuthorizedAgent(address agent) external",
  "function removeAuthorizedAgent(address agent) external",
  "function authorizedAgents(address agent) public view returns (bool)",
  "function getAuthorizedAgents() external view returns (address[])",
  "function setMaxAllocation(uint256 newMaxBps) external",
  "function setMinDeposit(uint256 newMinDeposit) external",
  "function setWithdrawalFee(uint256 newFeeBps) external",
  "function setFeeRecipient(address newRecipient) external",
  "function setImpactPool(address newImpactPool) external",
  "function pause() external",
  "function unpause() external",
  "function owner() public view returns (address)"
] as const;
  
  // ===== WHBAR ABI =====
  export const WHBAR_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)",
    "function name() external view returns (string)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function deposit() external payable",
    "function withdraw(uint256 amount) external",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)"
  ] as const;

  // ===== GENERIC ERC20 ABI =====
  export const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)",
    "function name() external view returns (string)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)"
  ] as const;

  // ===== IMPACT POOL ABI =====
  export const IMPACT_POOL_ABI = [
    "function getUserBalance(address user) external view returns (uint256)",
    "function getTotalPoolBalance() external view returns (uint256)",
    "function getUserDonationRate(address user) external view returns (uint256)",
    "function setDonationRate(uint256 rate) external",
    "function getUserTotalDonated(address user) external view returns (uint256)",
    "function getUserDonationCount(address user) external view returns (uint256)",
    "function getUserDonation(address user, uint256 index) external view returns (tuple(uint256 amount, uint256 timestamp, bool certificateIssued, uint256 certificateId))",
    "function issueCertificate(uint256 donationIndex) external",
    "function withdraw(uint256 amount) external",
    "function donate(uint256 amount) external",
    "event DonationRateUpdated(address indexed user, uint256 rate)",
    "event CertificateIssued(address indexed user, uint256 donationIndex, uint256 certificateId)",
    "event DonationMade(address indexed user, uint256 amount, uint256 timestamp)",
    "event Withdrawal(address indexed user, uint256 amount)"
  ] as const;

  // ===== TRADE SETTLEMENT ABI =====
  export const SETTLEMENT_ABI = [
    "function depositToEscrow(address token, uint256 amount) external",
    "function withdrawFromEscrow(address token, uint256 amount) external",
    "function checkEscrowBalance(address user, address token) external view returns (uint256 total, uint256 available, uint256 locked)",
    "function getUserNonce(address user, address token) external view returns (uint256)",
    "function lockEscrowForOrder(address user, address token, uint256 amount, bytes32 orderId) external",
    "function settleCrossChainTrade((bytes32 orderId, address party1, address party2, address party1ReceiveWallet, address party2ReceiveWallet, address baseAsset, address quoteAsset, uint256 price, uint256 quantity, string party1Side, string party2Side, uint256 sourceChainId, uint256 destinationChainId, uint256 timestamp, uint256 nonce1, uint256 nonce2) tradeData, bool isSourceChain) external",
    "function escrowBalances(address user, address token) external view returns (uint256)",
    "function lockedBalances(address user, address token) external view returns (uint256)",
    "function orderLocks(bytes32 orderId) external view returns (bool)",
    "function settledCrossChainOrders(bytes32 orderId) external view returns (bool)",
    "function owner() external view returns (address)",
    "event EscrowDepositEvent(address indexed user, address indexed token, uint256 amount, uint256 timestamp)",
    "event EscrowWithdraw(address indexed user, address indexed token, uint256 amount, uint256 timestamp)",
    "event EscrowLocked(address indexed user, address indexed token, uint256 amount, bytes32 indexed orderId)",
    "event CrossChainTradeSettled(bytes32 indexed orderId, address indexed sender, address indexed receiver, address assetSent, uint256 amountSent, uint256 chainId, bool isSourceChain, uint256 timestamp)"
  ] as const;

  // ===== KNOWN TOKEN DECIMALS (fallbacks if on-chain decimals() fails) =====
  export const TOKEN_DECIMALS: Record<string, number> = {
  // Defaults; override at runtime if needed
  "18": 18,
  };

export function resolveTokenAddress(network: "hedera" | "polygon" | "ethereum", symbol: string): string {
  const reg = CHAIN_REGISTRY[network];
  
  // Try exact match first, then uppercase match
  let addr = reg?.tokens?.[symbol as keyof typeof reg.tokens] || "";
  
  if (!addr) {
    // Try uppercase version
    const upperSymbol = symbol.toUpperCase();
    addr = reg?.tokens?.[upperSymbol as keyof typeof reg.tokens] || "";
  }
  
  return addr;
}

export function resolveSettlementAddress(network: "hedera" | "polygon" | "ethereum"): string {
  return CHAIN_REGISTRY[network]?.settlement || "";
}
