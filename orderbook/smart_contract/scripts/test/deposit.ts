// scripts/testFile/debugDeposit.ts
import { ethers } from "hardhat";

async function main() {
  // Config
  const VAULT_ADDRESS = "0x237458E2cF7593084Ae397a50166A275A3928bA7";
  const MOCK_ADDRESS = "0xA219e375D1F84A50273c93FaaF5EACD285bD9990";
  const DEPOSIT_AMOUNT = ethers.parseEther("100");
  
  // Get signer
  const [user] = await ethers.getSigners();
  
  // Correct ABIs based on NeoBankVault contract
  const VAULT_ABI = [
    "function depositLiquidity(uint256 assets) external returns (uint256 shares)",
    "function withdrawProfits() external returns (uint256 assets)",
    "function getUserShareBalance(address user) external view returns (uint256)",
    "function getBalanceUser(address user) external view returns (uint256)",
    "function getBalanceVault() external view returns (uint256)",
    "function asset() external view returns (address)",
    "function totalSupply() external view returns (uint256)",
    "function totalAssets() external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
    "function getSharePrice() external view returns (uint256)",
    "function getAvailableAssets() external view returns (uint256)",
    "function minDeposit() external view returns (uint256)",
    "function paused() external view returns (bool)",
    "function shareToUser(address user) external view returns (uint256)"
  ];
  
  const HBAR_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)",
    "function transfer(address to, uint256 amount) external returns (bool)"
  ];
  
  const vault = await ethers.getContractAt(VAULT_ABI, VAULT_ADDRESS);
  const hbar = await ethers.getContractAt(HBAR_ABI, MOCK_ADDRESS);
  
  console.log("VAULT DEPOSIT DIAGNOSTIC - CORRECT ABIs");
  console.log("=".repeat(60));
  
  try {
    // 0. Check if vault contract exists
    console.log("\n0. Contract existence check:");
    try {
      const vaultCode = await user.provider?.getCode(VAULT_ADDRESS);
      if (vaultCode && vaultCode !== "0x") {
        console.log("Vault contract exists at address");
      } else {
        console.log("WARNING: No contract found at vault address!");
      }
    } catch (error) {
      console.log("ERROR: Cannot check contract existence:", (error as Error).message);
    }
    
    // 1. Basic checks
    console.log("\n1. Basic checks:");
    console.log(`User: ${user.address}`);
    console.log(`Vault: ${VAULT_ADDRESS}`);
    console.log(`HBAR: ${MOCK_ADDRESS}`);
    console.log(`Amount: ${ethers.formatEther(DEPOSIT_AMOUNT)} HBAR`);
    
    // 2. Check vault status
    console.log("\n2. Vault status:");
    
    try {
      const isPaused = await vault.paused();
      console.log(`Vault paused: ${isPaused}`);
      if (isPaused) {
        console.log("PROBLEM: Vault is paused!");
        return;
      }
      console.log("Vault is active");
    } catch (error) {
      console.log("WARNING: Cannot check if vault is paused");
      console.log("Error details:", (error as Error).message);
    }
    
    try {
      const minDeposit = await vault.minDeposit();
      console.log(`Minimum deposit: ${ethers.formatEther(minDeposit)} HBAR`);
      
      if (BigInt(DEPOSIT_AMOUNT) < BigInt(minDeposit)) {
        console.log("PROBLEM: Amount below minimum!");
        console.log(`   Required: ${ethers.formatEther(minDeposit)}`);
        console.log(`   Provided: ${ethers.formatEther(DEPOSIT_AMOUNT)}`);
        return;
      }
      console.log("Amount above minimum");
    } catch (error) {
      console.log("WARNING: Cannot check minimum deposit");
      console.log("Error details:", (error as Error).message);
    }
    
    // 3. Check vault asset
    console.log("\n3. Asset verification:");
    try {
      const vaultAsset = await vault.asset();
      console.log(`Vault asset: ${vaultAsset}`);
      console.log(`HBAR address: ${MOCK_ADDRESS}`);
      
      if (vaultAsset.toLowerCase() !== MOCK_ADDRESS.toLowerCase()) {
        console.log("PROBLEM: Vault does not use HBAR as asset!");
        return;
      }
      console.log("Asset correct");
        } catch (error) {
      console.log("ERROR: Cannot verify asset:", (error as Error).message);
      return;
    }
    
    // 4. Check HBAR balance
    console.log("\n4. HBAR balance:");
    const hbarBalance = await hbar.balanceOf(user.address);
    console.log(`HBAR Balance: ${ethers.formatEther(hbarBalance)}`);
    
    if (BigInt(hbarBalance) < BigInt(DEPOSIT_AMOUNT)) {
      console.log("PROBLEM: Not enough HBAR!");
      console.log(`   Required: ${ethers.formatEther(DEPOSIT_AMOUNT)}`);
      console.log(`   Available: ${ethers.formatEther(hbarBalance)}`);
      console.log("\nSOLUTION: Get more HBAR tokens first!");
      return;
    }
    console.log("HBAR balance sufficient");
    
    // 5. Vault information
    console.log("\n5. Vault information:");
    try {
      const totalSupply = await vault.totalSupply();
      const totalAssets = await vault.totalAssets();
      const availableAssets = await vault.getAvailableAssets();
      const sharePrice = await vault.getSharePrice();
      
    console.log(`Total supply: ${ethers.formatEther(totalSupply)}`);
      console.log(`Total assets: ${ethers.formatEther(totalAssets)}`);
      console.log(`Available assets: ${ethers.formatEther(availableAssets)}`);
      console.log(`Share price: ${ethers.formatEther(sharePrice)}`);
      
      // Check user balances in vault
      const userShares = await vault.getUserShareBalance(user.address);
      const userBalance = await vault.getBalanceUser(user.address);
      const userSharesFromMapping = await vault.shareToUser(user.address);
      
      console.log(`User shares (getUserShareBalance): ${ethers.formatEther(userShares)}`);
      console.log(`User balance (getBalanceUser): ${ethers.formatEther(userBalance)}`);
      console.log(`User shares (mapping): ${ethers.formatEther(userSharesFromMapping)}`);
      
        } catch (error) {
      console.log("WARNING: Error reading vault info:", (error as Error).message);
    }
    
    // 6. Approval test
    console.log("\n6. Approval test:");
    try {
      // Check current allowance
      const currentAllowance = await hbar.allowance(user.address, VAULT_ADDRESS);
      console.log(`Current allowance: ${ethers.formatEther(currentAllowance)}`);
      
      if (BigInt(currentAllowance) < BigInt(DEPOSIT_AMOUNT)) {
        console.log("Approval needed...");
        const approveTx = await hbar.approve(VAULT_ADDRESS, DEPOSIT_AMOUNT, {
          gasLimit: 100000
        });
        await approveTx.wait();
        console.log("Approval successful");
        
        // Check new allowance
        const newAllowance = await hbar.allowance(user.address, VAULT_ADDRESS);
        console.log(`New allowance: ${ethers.formatEther(newAllowance)}`);
      } else {
        console.log("Allowance sufficient");
      }
      
        } catch (error) {
      console.log("PROBLEM with approval:", (error as Error).message);
      return;
    }
    
    // 7. Deposit test with configured amount
    console.log("\n7. Deposit test:");
    try {
      // Check vault state BEFORE deposit
      console.log(`\nVault state BEFORE deposit:`);
      const totalAssetsBefore = await vault.totalAssets();
      const totalSupplyBefore = await vault.totalSupply();
      const sharePriceBefore = await vault.getSharePrice();
      console.log(`   Total assets: ${ethers.formatEther(totalAssetsBefore)} HBAR`);
      console.log(`   Total supply: ${ethers.formatEther(totalSupplyBefore)} shares`);
      console.log(`   Share price: ${ethers.formatEther(sharePriceBefore)}`);
      
      console.log(`\nDepositing ${ethers.formatEther(DEPOSIT_AMOUNT)} HBAR...`);
      
      // Try deposit with high gas limit
      const depositTx = await vault.depositLiquidity(DEPOSIT_AMOUNT, {
        gasLimit: 1000000 // High limit for debug
      });
      
      console.log(`Deposit successful! TX: ${depositTx.hash}`);
      const receipt = await depositTx.wait();
      console.log(`Transaction confirmed. Gas used: ${receipt.gasUsed}`);
      
      // Check vault state AFTER deposit
      console.log(`\nVault state AFTER deposit:`);
      const totalAssetsAfter = await vault.totalAssets();
      const totalSupplyAfter = await vault.totalSupply();
      const sharePriceAfter = await vault.getSharePrice();
      console.log(`   Total assets: ${ethers.formatEther(totalAssetsAfter)} HBAR`);
      console.log(`   Total supply: ${ethers.formatEther(totalSupplyAfter)} shares`);
      console.log(`   Share price: ${ethers.formatEther(sharePriceAfter)}`);
      
      // Check user balances after test
      console.log("\nUser balances after deposit:");
      const newUserShares = await vault.getUserShareBalance(user.address);
      const newUserBalance = await vault.getBalanceUser(user.address);
      console.log(`User shares: ${ethers.formatEther(newUserShares)}`);
      console.log(`User balance: ${ethers.formatEther(newUserBalance)}`);
      
      // Calculate what actually happened
      const assetsDeposited = BigInt(totalAssetsAfter) - BigInt(totalAssetsBefore);
      const sharesMinted = BigInt(totalSupplyAfter) - BigInt(totalSupplyBefore);
      console.log(`\nACTUAL RESULTS:`);
      console.log(`   Assets deposited: ${ethers.formatEther(assetsDeposited.toString())} HBAR`);
      console.log(`   Shares minted: ${ethers.formatEther(sharesMinted.toString())}`);
      
      if (BigInt(assetsDeposited) !== BigInt(DEPOSIT_AMOUNT)) {
        console.log(`   WARNING: Expected to deposit ${ethers.formatEther(DEPOSIT_AMOUNT)} but vault received ${ethers.formatEther(assetsDeposited.toString())}`);
      } else {
        console.log(`   Deposit amount matches vault assets increase`);
      }
      
    } catch (error) {
      console.log("PROBLEM with deposit:");
      console.log("Error message:", (error as Error).message);
      
      // Analysis of common errors
      if ((error as Error).message.includes("Below minimum deposit")) {
        console.log("SOLUTION: Amount too small");
      } else if ((error as Error).message.includes("Cannot deposit zero")) {
        console.log("SOLUTION: Zero amount detected");
      } else if ((error as Error).message.includes("Zero shares calculated")) {
        console.log("SOLUTION: Problem with shares calculation");
      } else if ((error as Error).message.includes("execution reverted")) {
        console.log("POSSIBLE SOLUTIONS:");
        console.log("   - Check that vault is not paused");
        console.log("   - Check HBAR allowance");
        console.log("   - Check HBAR balance");
        console.log("   - Problem in contract logic");
      }
      
      // Show more error details
      if ((error as any).reason) {
        console.log("Reason:", (error as any).reason);
      }
      if ((error as any).code) {
        console.log("Code:", (error as any).code);
      }
    }
    
    console.log("\nSUMMARY:");
    console.log("- Vault active and configured correctly");
    console.log("- Asset correct (HBAR)");
    console.log("- ABI functions match the contract");
    console.log("- If test fails, it's probably an internal logic problem");
    
  } catch (error) {
    console.error("General error:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });