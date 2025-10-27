// scripts/testFile/testDepositWithoutShares.ts
import { ethers } from "hardhat";

async function main() {
    const VAULT_ADDRESS = "0x8D03Cab8D66D923ae267f9e6727721aFDBdd25E2";
    const MOCK_ADDRESS = "0x66B8244b08be8F4Cec1A23C5c57A1d7b8A27189D";
    const DEPOSIT_AMOUNT = ethers.parseEther("100"); // 100 HBAR

    const VAULT_ABI = [
        "function depositLiquidityWithoutShares(uint256 amount) external",
        "function totalAssets() external view returns (uint256)",
        "function totalSupply() external view returns (uint256)",
        "function getSharePrice() external view returns (uint256)",
        "function authorizedAgents(address agent) external view returns (bool)",
        "function owner() external view returns (address)",
        "function getVaultState() external view returns (uint256, uint256, uint256, uint256, uint256)"
    ];

    const HBAR_ABI = [
        "function balanceOf(address account) external view returns (uint256)",
        "function transfer(address to, uint256 amount) external returns (bool)",
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function allowance(address owner, address spender) external view returns (uint256)"
    ];

    const [signer] = await ethers.getSigners();
    console.log("DEPOSIT WITHOUT SHARES TEST");
    console.log("=".repeat(50));
    console.log(`Signer: ${signer.address}`);
    console.log(`Vault: ${VAULT_ADDRESS}`);
    console.log(`HBAR: ${MOCK_ADDRESS}`);
    console.log(`Deposit Amount: ${ethers.formatEther(DEPOSIT_AMOUNT)} HBAR`);

    const vault = await ethers.getContractAt(VAULT_ABI, VAULT_ADDRESS);
    const hbar = await ethers.getContractAt(HBAR_ABI, MOCK_ADDRESS);

    try {
        // 1. Check authorization
        console.log("\n1. Checking authorization:");
        const isAuthorizedAgent = await vault.authorizedAgents(signer.address);
        const owner = await vault.owner();
        const isOwner = signer.address.toLowerCase() === owner.toLowerCase();
        
        console.log(`   Is authorized agent: ${isAuthorizedAgent}`);
        console.log(`   Is owner: ${isOwner}`);
        console.log(`   Vault owner: ${owner}`);
        
        if (!isAuthorizedAgent && !isOwner) {
            console.log("\nERROR: Signer is neither an authorized agent nor the owner");
            console.log("SOLUTION: Add signer as authorized agent or use owner account");
            return;
        }

        // 2. Check vault state BEFORE deposit
        console.log("\n2. Vault state BEFORE deposit:");
        const [vaultBalance, totalAssets, totalSupply, sharePrice, accumulatedFees] = await vault.getVaultState();
        
        console.log(`   Vault balance: ${ethers.formatEther(vaultBalance)} HBAR`);
        console.log(`   Total assets: ${ethers.formatEther(totalAssets)} HBAR`);
        console.log(`   Total supply: ${ethers.formatEther(totalSupply)} shares`);
        console.log(`   Share price: ${ethers.formatEther(sharePrice)}`);
        console.log(`   Accumulated fees: ${ethers.formatEther(accumulatedFees)} HBAR`);

        // 3. Check HBAR balance and allowance
        console.log("\n3. Checking HBAR balance and allowance:");
        const hbarBalance = await hbar.balanceOf(signer.address);
        const currentAllowance = await hbar.allowance(signer.address, VAULT_ADDRESS);
        
        console.log(`   HBAR balance: ${ethers.formatEther(hbarBalance)} HBAR`);
        console.log(`   Current allowance: ${ethers.formatEther(currentAllowance)} HBAR`);
        
        if (hbarBalance < DEPOSIT_AMOUNT) {
            console.log(`   ERROR: Insufficient HBAR balance`);
            console.log(`   Required: ${ethers.formatEther(DEPOSIT_AMOUNT)} HBAR`);
            console.log(`   Available: ${ethers.formatEther(hbarBalance)} HBAR`);
            return;
        }

        // 4. Approve if needed
        if (currentAllowance < DEPOSIT_AMOUNT) {
            console.log("\n4. Approving HBAR spend:");
            const approveTx = await hbar.approve(VAULT_ADDRESS, DEPOSIT_AMOUNT);
            console.log(`   Approval transaction: ${approveTx.hash}`);
            await approveTx.wait();
            console.log(`   Approved ${ethers.formatEther(DEPOSIT_AMOUNT)} HBAR`);
        } else {
            console.log("\n4. Sufficient allowance already exists");
        }

        // 5. Execute depositLiquidityWithoutShares
        console.log("\n5. Executing depositLiquidityWithoutShares:");
        console.log(`   Depositing ${ethers.formatEther(DEPOSIT_AMOUNT)} HBAR without minting shares...`);
        
        const depositTx = await vault.depositLiquidityWithoutShares(DEPOSIT_AMOUNT, {
            gasLimit: 300000
        });
        
        console.log(`   Transaction sent: ${depositTx.hash}`);
        console.log("   Waiting for confirmation...");
        
        const receipt = await depositTx.wait();
        
        if (receipt.status === 1) {
            console.log("   Deposit successful!");
            console.log(`   Gas used: ${receipt.gasUsed}`);
            
            // Check for ProfitsDeposited event
            if (receipt.logs && receipt.logs.length > 0) {
                console.log(`   Events emitted: ${receipt.logs.length}`);
                const profitsDepositedEvents = receipt.logs.filter((log: any) => 
                    log.topics[0] === ethers.id("ProfitsDeposited(uint256)")
                );
                if (profitsDepositedEvents.length > 0) {
                    console.log(`   ProfitsDeposited event detected`);
                }
            }
        } else {
            console.log("   Deposit failed!");
            return;
        }

        // 6. Check vault state AFTER deposit
        console.log("\n6. Vault state AFTER deposit:");
        const [vaultBalanceAfter, totalAssetsAfter, totalSupplyAfter, sharePriceAfter, accumulatedFeesAfter] = await vault.getVaultState();
        
        console.log(`   Vault balance: ${ethers.formatEther(vaultBalanceAfter)} HBAR`);
        console.log(`   Total assets: ${ethers.formatEther(totalAssetsAfter)} HBAR`);
        console.log(`   Total supply: ${ethers.formatEther(totalSupplyAfter)} shares`);
        console.log(`   Share price: ${ethers.formatEther(sharePriceAfter)}`);
        console.log(`   Accumulated fees: ${ethers.formatEther(accumulatedFeesAfter)} HBAR`);

        // 7. Analyze the impact
        console.log("\n7. Impact analysis:");
        const vaultBalanceIncrease = vaultBalanceAfter - vaultBalance;
        const totalAssetsIncrease = totalAssetsAfter - totalAssets;
        const totalSupplyChange = totalSupplyAfter - totalSupply;
        const sharePriceChange = sharePriceAfter - sharePrice;
        
        console.log(`   Vault balance increased by: ${ethers.formatEther(vaultBalanceIncrease)} HBAR`);
        console.log(`   Total assets increased by: ${ethers.formatEther(totalAssetsIncrease)} HBAR`);
        console.log(`   Total supply changed by: ${ethers.formatEther(totalSupplyChange)} shares`);
        console.log(`   Share price changed by: ${ethers.formatEther(sharePriceChange)}`);
        
        // Validate expected behavior
        console.log("\n8. Validation:");
        
        if (BigInt(vaultBalanceIncrease) === DEPOSIT_AMOUNT) {
            console.log(`   Vault balance increased correctly by ${ethers.formatEther(DEPOSIT_AMOUNT)} HBAR`);
        } else {
            console.log(`   ERROR: Vault balance increase mismatch`);
            console.log(`       Expected: ${ethers.formatEther(DEPOSIT_AMOUNT)} HBAR`);
            console.log(`       Actual: ${ethers.formatEther(vaultBalanceIncrease)} HBAR`);
        }
        
        if (BigInt(totalAssetsIncrease) === DEPOSIT_AMOUNT) {
            console.log(`   Total assets increased correctly by ${ethers.formatEther(DEPOSIT_AMOUNT)} HBAR`);
        } else {
            console.log(`   ERROR: Total assets increase mismatch`);
        }
        
        if (BigInt(totalSupplyChange) === BigInt(0)) {
            console.log(`   Total supply unchanged (no shares minted)`);
        } else {
            console.log(`   ERROR: Total supply should not change`);
            console.log(`       Supply change: ${ethers.formatEther(totalSupplyChange)} shares`);
        }
        
        if (totalSupply > 0) {
            const expectedSharePriceIncrease = (DEPOSIT_AMOUNT * ethers.parseEther("1")) / totalSupply;
            if (sharePriceChange >= expectedSharePriceIncrease * BigInt(99) / BigInt(100)) { // Allow 1% tolerance
                console.log(`   Share price increased correctly (benefits existing shareholders)`);
                console.log(`       Previous: ${ethers.formatEther(sharePrice)}`);
                console.log(`       Current: ${ethers.formatEther(sharePriceAfter)}`);
                console.log(`       Increase: ${ethers.formatEther(sharePriceChange)}`);
            } else {
                console.log(`   WARNING: Share price increase lower than expected`);
            }
        } else {
            console.log(`   INFO: No existing shares, so share price impact is N/A`);
        }

        console.log("\nDEPOSIT WITHOUT SHARES COMPLETED!");
        console.log("This function successfully deposits funds without diluting existing shareholders");

    } catch (error: any) {
        console.error("\nError during deposit without shares:");
        console.error("Error message:", error.message);
        
        // Analysis of common errors
        if (error.message.includes("Not authorized")) {
            console.log("SOLUTION: Add signer as authorized agent or use owner account");
        } else if (error.message.includes("Cannot deposit zero")) {
            console.log("SOLUTION: Ensure deposit amount is greater than 0");
        } else if (error.message.includes("transfer amount exceeds balance")) {
            console.log("SOLUTION: Ensure sufficient HBAR balance");
        } else if (error.message.includes("transfer amount exceeds allowance")) {
            console.log("SOLUTION: Approve sufficient HBAR allowance");
        }
        
        if (error.reason) {
            console.log("Reason:", error.reason);
        }
        if (error.code) {
            console.log("Code:", error.code);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Script failed:", error);
        process.exit(1);
    });