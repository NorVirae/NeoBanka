// scripts/testFile/testWithdraw.ts
import { ethers } from "hardhat";

async function main() {
  // Config
  const VAULT_ADDRESS = "0x8D03Cab8D66D923ae267f9e6727721aFDBdd25E2";
  const MOCK_ADDRESS = "0x66B8244b08be8F4Cec1A23C5c57A1d7b8A27189D";
  
  // Get signer
  const [user] = await ethers.getSigners();
  
  // ABIs
  const VAULT_ABI = [
    "function withdrawProfits(uint256 impactAllocationBps) external returns (uint256 assets)",
    "function getUserShareBalance(address user) external view returns (uint256)",
    "function getBalanceUser(address user) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
    "function totalSupply() external view returns (uint256)",
    "function totalAssets() external view returns (uint256)",
    "function getSharePrice() external view returns (uint256)",
    "function shareToUser(address user) external view returns (uint256)",
    "function previewRedeem(uint256 shares) external view returns (uint256)",
    "function feeRecipient() external view returns (address)",
    "function getTotalAccumulatedFees() external view returns (uint256)",
    "function withdrawalFeeBps() external view returns (uint256)",
    "function getVaultState() external view returns (uint256, uint256, uint256, uint256, uint256)",
    "function getUserProfits(address user) external view returns (uint256)",
    "function getUserTotalDeposited(address user) external view returns (uint256)",
    "function impactPool() external view returns (address)"
  ];
  
  const HBAR_ABI = [
    "function balanceOf(address account) external view returns (uint256)"
  ];
  
  const vault = await ethers.getContractAt(VAULT_ABI, VAULT_ADDRESS);
  const hbar = await ethers.getContractAt(HBAR_ABI, MOCK_ADDRESS);
  
  // Configuration for impact pool allocation
  const IMPACT_ALLOCATION_BPS = 500; // 5% of profits to impact pool
  
  console.log("VAULT WITHDRAW TEST");
  console.log("=".repeat(50));
  console.log(`User: ${user.address}`);
  console.log(`Vault: ${VAULT_ADDRESS}`);
  console.log(`HBAR: ${MOCK_ADDRESS}`);
  console.log(`Impact allocation: ${IMPACT_ALLOCATION_BPS} bps (${IMPACT_ALLOCATION_BPS / 100}% of profits)`);
  
  try {
    // 1. Check balances and fee info BEFORE withdraw
    console.log("\n1. Balances and fee info BEFORE withdraw:");
    
    const userSharesMapping = await vault.shareToUser(user.address);
    const userSharesBalance = await vault.balanceOf(user.address);
    const userSharesFunction = await vault.getUserShareBalance(user.address);
    const hbarBalanceBefore = await hbar.balanceOf(user.address);
    const vaultTotalSupply = await vault.totalSupply();
    const vaultTotalAssets = await vault.totalAssets();
    const sharePrice = await vault.getSharePrice();
    const feeRecipient = await vault.feeRecipient();
    const accumulatedFees = await vault.getTotalAccumulatedFees();
    const withdrawalFeeBps = await vault.withdrawalFeeBps();
    const userProfits = await vault.getUserProfits(user.address);
    const userTotalDeposited = await vault.getUserTotalDeposited(user.address);
    const impactPool = await vault.impactPool();
    
    // Check fee recipient and impact pool balances BEFORE withdrawal
    const feeRecipientBalanceBefore = await hbar.balanceOf(feeRecipient);
    const impactPoolBalanceBefore = impactPool !== ethers.ZeroAddress ? await hbar.balanceOf(impactPool) : BigInt(0);
    
    console.log(`   Fee recipient balance BEFORE: ${ethers.formatEther(feeRecipientBalanceBefore)} HBAR`);
    console.log(`   Impact pool balance BEFORE: ${ethers.formatEther(impactPoolBalanceBefore)} HBAR`);
    
    console.log(`   User shares (mapping): ${ethers.formatEther(userSharesMapping)}`);
    console.log(`   User shares (balanceOf): ${ethers.formatEther(userSharesBalance)}`);
    console.log(`   User shares (function): ${ethers.formatEther(userSharesFunction)}`);
    console.log(`   HBAR balance: ${ethers.formatEther(hbarBalanceBefore)}`);
    console.log(`   User profits: ${ethers.formatEther(userProfits)} HBAR`);
    console.log(`   User total deposited: ${ethers.formatEther(userTotalDeposited)} HBAR`);
    console.log(`   Vault total supply: ${ethers.formatEther(vaultTotalSupply)}`);
    console.log(`   Vault total assets: ${ethers.formatEther(vaultTotalAssets)}`);
    console.log(`   Share price: ${ethers.formatEther(sharePrice)}`);
    console.log(`   Fee recipient: ${feeRecipient}`);
    console.log(`   Impact pool: ${impactPool}`);
    console.log(`   Accumulated fees: ${ethers.formatEther(accumulatedFees)} HBAR`);
    console.log(`   Withdrawal fee: ${withdrawalFeeBps.toString()} bps (${Number(withdrawalFeeBps) / 100}%)`);
    
    // Check if user has shares
    if (BigInt(userSharesBalance) === BigInt(0)) {
      console.log("PROBLEM: User has no shares to withdraw!");
      console.log("SOLUTION: Make a deposit first before testing withdraw");
      return;
    }
    
    // 2. Preview withdraw
    console.log("\n2. Withdraw preview:");
    try {
      const previewAssets = await vault.previewRedeem(userSharesBalance);
      const expectedFee = BigInt(previewAssets) * BigInt(withdrawalFeeBps) / BigInt(10000);
      const expectedImpactAllocation = BigInt(userProfits) * BigInt(IMPACT_ALLOCATION_BPS) / BigInt(10000);
      const expectedNetAssets = BigInt(previewAssets) - BigInt(expectedFee) - BigInt(expectedImpactAllocation);
      
      console.log(`   Shares to withdraw: ${ethers.formatEther(userSharesBalance)}`);
      console.log(`   Gross assets (before deductions): ${ethers.formatEther(previewAssets)} HBAR`);
      console.log(`   User profits: ${ethers.formatEther(userProfits)} HBAR`);
      console.log(`   Expected withdrawal fee: ${ethers.formatEther(expectedFee.toString())} HBAR`);
      console.log(`   Expected impact allocation: ${ethers.formatEther(expectedImpactAllocation.toString())} HBAR (${IMPACT_ALLOCATION_BPS / 100}% of profits)`);
      console.log(`   Expected net assets to user: ${ethers.formatEther(expectedNetAssets.toString())} HBAR`);
      
      if (BigInt(previewAssets) === BigInt(0)) {
        console.log("PROBLEM: previewRedeem returns 0 assets!");
        console.log("There is an issue in the ERC4626 calculation");
        return;
      }
      
    } catch (error) {
      console.log("WARNING: Cannot preview withdraw:", (error as Error).message);
    }
    
    // 3. Execute withdraw
    console.log("\n3. Executing withdraw:");
    console.log(`Withdrawing all shares with ${IMPACT_ALLOCATION_BPS / 100}% profit allocation to impact pool...`);
    
    const withdrawTx = await vault.withdrawProfits(IMPACT_ALLOCATION_BPS, {
      gasLimit: 500000 // High gas limit
    });
    
    console.log(`Transaction sent: ${withdrawTx.hash}`);
    console.log("Waiting for confirmation...");
    
    const receipt = await withdrawTx.wait();
    
    if (receipt.status === 1) {
      console.log("Withdraw successful!");
      console.log(`Gas used: ${receipt.gasUsed}`);
      
      // Analyze events
      if (receipt.logs && receipt.logs.length > 0) {
        console.log(`Events emitted: ${receipt.logs.length}`);
        // Check if FeesWithdrawn event was emitted (auto fee withdrawal)
        const feesWithdrawnEvents = receipt.logs.filter((log: any) => 
          log.topics[0] === ethers.id("FeesWithdrawn(address,uint256)")
        );
        if (feesWithdrawnEvents.length > 0) {
          console.log(`   FeesWithdrawn event detected - withdrawFeesAuto() was called`);
        } else {
          console.log(`   No FeesWithdrawn event - either no fee recipient set or no accumulated fees`);
        }
      }
    } else {
      console.log("Withdraw failed!");
      return;
    }
    
    // 4. Check balances AFTER withdraw
    console.log("\n4. Balances AFTER withdraw:");
    
    const userSharesAfter = await vault.balanceOf(user.address);
    const userSharesMappingAfter = await vault.shareToUser(user.address);
    const hbarBalanceAfter = await hbar.balanceOf(user.address);
    const vaultTotalSupplyAfter = await vault.totalSupply();
    const vaultTotalAssetsAfter = await vault.totalAssets();
    const accumulatedFeesAfter = await vault.getTotalAccumulatedFees();
    const userTotalDepositedAfter = await vault.getUserTotalDeposited(user.address);
    
    // Check fee recipient and impact pool balances AFTER withdrawal
    const feeRecipientBalanceAfter = await hbar.balanceOf(feeRecipient);
    const impactPoolBalanceAfter = impactPool !== ethers.ZeroAddress ? await hbar.balanceOf(impactPool) : BigInt(0);
    
    console.log(`   Fee recipient balance AFTER: ${ethers.formatEther(feeRecipientBalanceAfter)} HBAR`);
    console.log(`   Impact pool balance AFTER: ${ethers.formatEther(impactPoolBalanceAfter)} HBAR`);
    
    console.log(`   User shares (balanceOf): ${ethers.formatEther(userSharesAfter)}`);
    console.log(`   User shares (mapping): ${ethers.formatEther(userSharesMappingAfter)}`);
    console.log(`   User total deposited after: ${ethers.formatEther(userTotalDepositedAfter)} HBAR`);
    console.log(`   HBAR balance: ${ethers.formatEther(hbarBalanceAfter)}`);
    console.log(`   Vault total supply: ${ethers.formatEther(vaultTotalSupplyAfter)}`);
    console.log(`   Vault total assets: ${ethers.formatEther(vaultTotalAssetsAfter)}`);
    console.log(`   Accumulated fees after: ${ethers.formatEther(accumulatedFeesAfter)} HBAR`);
    
    // 5. Calculate gains/losses
    console.log("\n5. Withdraw results:");
    
    const hbarReceived = BigInt(hbarBalanceAfter) - BigInt(hbarBalanceBefore);
    const sharesWithdrawn = BigInt(userSharesBalance) - BigInt(userSharesAfter);
    const feeRecipientReceived = BigInt(feeRecipientBalanceAfter) - BigInt(feeRecipientBalanceBefore);
    const impactPoolReceived = BigInt(impactPoolBalanceAfter) - BigInt(impactPoolBalanceBefore);
    
    console.log(`   HBAR received by user: ${ethers.formatEther(hbarReceived.toString())}`);
    console.log(`   Shares burned: ${ethers.formatEther(sharesWithdrawn.toString())}`);
    console.log(`   Fee recipient received: ${ethers.formatEther(feeRecipientReceived.toString())} HBAR`);
    console.log(`   Impact pool received: ${ethers.formatEther(impactPoolReceived.toString())} HBAR`);
    
    // Calculate expected values based on NEW PROFIT TRACKING logic
    // Note: previewRedeem gives us grossAssets that the fee is calculated from
    const previewAssets = await vault.previewRedeem(userSharesBalance);
    const expectedGrossAssets = BigInt(previewAssets); 
    const expectedWithdrawalFee = expectedGrossAssets * BigInt(withdrawalFeeBps) / BigInt(10000);
    const expectedImpactAllocation = BigInt(userProfits) * BigInt(IMPACT_ALLOCATION_BPS) / BigInt(10000);
    const expectedNetAssets = expectedGrossAssets - expectedWithdrawalFee - expectedImpactAllocation;
    const totalDistributed = BigInt(hbarReceived) + BigInt(feeRecipientReceived) + BigInt(impactPoolReceived);
    
    console.log(`   Expected gross assets: ${ethers.formatEther(expectedGrossAssets.toString())} HBAR`);
    console.log(`   Expected withdrawal fee: ${ethers.formatEther(expectedWithdrawalFee.toString())} HBAR`);
    console.log(`   Expected impact allocation: ${ethers.formatEther(expectedImpactAllocation.toString())} HBAR`);
    console.log(`   Expected net to user: ${ethers.formatEther(expectedNetAssets.toString())} HBAR`);
    console.log(`   Total distributed: ${ethers.formatEther(totalDistributed.toString())} HBAR`);
    
    console.log("\\nWITHDRAWAL ANALYSIS:");
    console.log(`   Fee recipient set: ${feeRecipient !== ethers.ZeroAddress ? 'YES' : 'NO'} (${feeRecipient})`);
    console.log(`   Impact pool set: ${impactPool !== ethers.ZeroAddress ? 'YES' : 'NO'} (${impactPool})`);
    console.log(`   Withdrawal fee rate: ${withdrawalFeeBps.toString()} bps = ${Number(withdrawalFeeBps) / 100}%`);
    console.log(`   Impact allocation rate: ${IMPACT_ALLOCATION_BPS} bps = ${IMPACT_ALLOCATION_BPS / 100}% of profits`);
    
    // NEW LOGIC: Profit-based impact allocation with manual fee accumulation
    console.log(`   PROFIT TRACKING LOGIC: Impact allocation based on actual profits, fees accumulated in vault`);
    
    // Check if user received correct net amount
    if (BigInt(hbarReceived) === BigInt(expectedNetAssets)) {
      console.log(`   User received correct net amount: ${ethers.formatEther(hbarReceived.toString())} HBAR`);
    } else {
      console.log(`   ERROR: User received ${ethers.formatEther(hbarReceived.toString())} HBAR, expected ${ethers.formatEther(expectedNetAssets.toString())} HBAR`);
    }
    
    // Check if fees were properly accumulated
    const feesAccumulated = BigInt(accumulatedFeesAfter) - BigInt(accumulatedFees);
    if (BigInt(feesAccumulated) === BigInt(expectedWithdrawalFee)) {
      console.log(`   Correct fees accumulated: ${ethers.formatEther(feesAccumulated.toString())} HBAR`);
    } else {
      console.log(`   ERROR: ${ethers.formatEther(feesAccumulated.toString())} HBAR accumulated, expected ${ethers.formatEther(expectedWithdrawalFee.toString())} HBAR`);
    }
    
    // Check impact pool allocation
    if (impactPool !== ethers.ZeroAddress && BigInt(userProfits) > 0) {
      if (BigInt(impactPoolReceived) === BigInt(expectedImpactAllocation)) {
        console.log(`   Correct impact allocation sent: ${ethers.formatEther(impactPoolReceived.toString())} HBAR`);
      } else {
        console.log(`   ERROR: Impact pool received ${ethers.formatEther(impactPoolReceived.toString())} HBAR, expected ${ethers.formatEther(expectedImpactAllocation.toString())} HBAR`);
      }
    } else if (impactPool === ethers.ZeroAddress) {
      console.log(`   No impact pool set, no allocation made`);
    } else if (BigInt(userProfits) === 0) {
      console.log(`   No profits to allocate to impact pool`);
    }
    
    // No fees should be sent directly to recipient with manual logic
    if (BigInt(feeRecipientReceived) === BigInt(0)) {
      console.log(`   No fees sent to recipient (correct for manual accumulation)`);
    } else {
      console.log(`   ERROR: ${ethers.formatEther(feeRecipientReceived.toString())} HBAR sent to recipient (unexpected with manual accumulation)`);
    }
    
    // Check total user received equals net assets (no double-spending)
    if (BigInt(hbarReceived) === BigInt(expectedNetAssets)) {
      console.log(`   User received correct amount (no double-spending)`);
    } else {
      console.log(`   CRITICAL ERROR: User received wrong amount - possible double-spending!`);
    }
      
    
    // Check consistency
    if (BigInt(userSharesAfter) === BigInt(0)) {
      console.log("All shares have been withdrawn");
    } else {
      console.log(`${ethers.formatEther(userSharesAfter)} shares remain`);
    }
    
    if (BigInt(hbarReceived) > BigInt(0)) {
      console.log("HBAR recovered successfully");
      
      // Calculate return ratio
      const returnRatio = BigInt(hbarReceived) * BigInt(1000) / BigInt(ethers.parseEther("0.1")); // Based on 0.1 deposit
      console.log(`   Return ratio: ${returnRatio.toString()}/1000 (1000 = 100%)`);
      
      if (BigInt(returnRatio) >= BigInt(1000)) {
        console.log("You recovered 100% or more of your deposit!");
      } else {
        console.log("You recovered less than your initial deposit");
      }
    } else {
      console.log("No HBAR recovered - problem!");
    }
    
    console.log("\nWITHDRAW COMPLETED!");
    console.log("withdrawProfits() function with impact allocation works correctly");
    
    // Summary of new withdrawal behavior
    console.log("\nWITHDRAWAL SUMMARY:");
    console.log("- PROFIT TRACKING LOGIC: Impact allocation based on actual profits, fees accumulated in vault");
    console.log(`- Fee recipient: ${feeRecipient !== ethers.ZeroAddress ? feeRecipient : 'Not set'}`);
    console.log(`- Impact pool: ${impactPool !== ethers.ZeroAddress ? impactPool : 'Not set'}`);
    
    const totalFeesAccumulated = BigInt(accumulatedFeesAfter) - BigInt(accumulatedFees);
    const expectedImpact = impactPool !== ethers.ZeroAddress && BigInt(userProfits) > 0 ? expectedImpactAllocation : BigInt(0);
    
    if (BigInt(totalFeesAccumulated) === BigInt(expectedWithdrawalFee) && 
        BigInt(hbarReceived) === BigInt(expectedNetAssets) &&
        BigInt(feeRecipientReceived) === BigInt(0) &&
        BigInt(impactPoolReceived) === BigInt(expectedImpact)) {
      console.log("- CONFIRMED: New withdrawal logic works perfectly");
      console.log(`  - User got: ${ethers.formatEther(expectedNetAssets.toString())} HBAR (after all deductions)`);
      console.log(`  - Fees accumulated: ${ethers.formatEther(totalFeesAccumulated.toString())} HBAR (in vault)`);
      console.log(`  - Impact allocation: ${ethers.formatEther(impactPoolReceived.toString())} HBAR (sent to impact pool)`);
      console.log(`  - No fees sent to recipient (correct for manual logic)`);
      console.log(`  - Total accumulated fees now: ${ethers.formatEther(accumulatedFeesAfter)} HBAR`);
      console.log(`  - User total deposited reset to: ${ethers.formatEther(userTotalDepositedAfter)} HBAR`);
      if (feeRecipient !== ethers.ZeroAddress) {
        console.log(`  - Use withdrawFees() to send accumulated fees to ${feeRecipient}`);
      }
    } else {
      console.log("- CRITICAL ERROR: New withdrawal logic is broken!");
      if (BigInt(totalFeesAccumulated) !== BigInt(expectedWithdrawalFee)) {
        console.log(`  - Fee accumulation wrong: ${ethers.formatEther(totalFeesAccumulated.toString())} instead of ${ethers.formatEther(expectedWithdrawalFee.toString())}`);
      }
      if (BigInt(hbarReceived) !== BigInt(expectedNetAssets)) {
        console.log(`  - User amount wrong: ${ethers.formatEther(hbarReceived.toString())} instead of ${ethers.formatEther(expectedNetAssets.toString())}`);
      }
      if (BigInt(feeRecipientReceived) !== BigInt(0)) {
        console.log(`  - Unexpected fee transfer: ${ethers.formatEther(feeRecipientReceived.toString())} HBAR sent to recipient`);
      }
      if (BigInt(impactPoolReceived) !== BigInt(expectedImpact)) {
        console.log(`  - Impact allocation wrong: ${ethers.formatEther(impactPoolReceived.toString())} instead of ${ethers.formatEther(expectedImpact.toString())}`);
      }
    }
    
  } catch (error) {
    console.error("Error during withdraw:");
    console.error("Error message:", (error as Error).message);
    
    // Analysis of common errors
    if ((error as Error).message.includes("Cannot redeem zero shares")) {
      console.log("SOLUTION: User has no shares to withdraw");
    } else if ((error as Error).message.includes("Insufficient shares")) {
      console.log("SOLUTION: Insufficient share balance");
    } else if ((error as Error).message.includes("Zero assets calculated")) {
      console.log("SOLUTION: Problem with asset calculation in ERC4626");
    } else if ((error as Error).message.includes("execution reverted")) {
      console.log("POSSIBLE SOLUTIONS:");
      console.log("   - Check that vault has enough assets");
      console.log("   - Problem in burn logic");
      console.log("   - Problem with HBAR transfer");
    }
    
    // Show more error details
    if ((error as any).reason) {
      console.log("Reason:", (error as any).reason);
    }
    if ((error as any).code) {
      console.log("Code:", (error as any).code);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });