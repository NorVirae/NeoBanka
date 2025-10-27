import { ethers } from "hardhat";

async function main() {
    const VAULT_ADDRESS = "0x8D03Cab8D66D923ae267f9e6727721aFDBdd25E2";
    const MOCK_ADDRESS = "0x66B8244b08be8F4Cec1A23C5c57A1d7b8A27189D";
    
    const VAULT_ABI = [
        "function withdrawFees() external",
        "function getTotalAccumulatedFees() external view returns (uint256)",
        "function feeRecipient() external view returns (address)",
        "function owner() external view returns (address)"
    ];

    const HBAR_ABI = [
        "function balanceOf(address account) external view returns (uint256)"
    ];

    const [signer] = await ethers.getSigners();
    const vault = await ethers.getContractAt(VAULT_ABI, VAULT_ADDRESS);
    const hbar = await ethers.getContractAt(HBAR_ABI, MOCK_ADDRESS);

    try {
        console.log("MANUAL FEE WITHDRAWAL TEST");
        console.log("=".repeat(40));
        console.log(`Signer: ${signer.address}`);
        
        // 1. Check current state
        console.log("\\n1. Current state:");
        const accumulatedFees = await vault.getTotalAccumulatedFees();
        const feeRecipient = await vault.feeRecipient();
        const owner = await vault.owner();
        
        console.log(`   Accumulated fees: ${ethers.formatEther(accumulatedFees)} HBAR`);
        console.log(`   Fee recipient: ${feeRecipient}`);
        console.log(`   Contract owner: ${owner}`);
        
        // Check if there are fees to withdraw
        if (BigInt(accumulatedFees) === BigInt(0)) {
            console.log("\nNo fees accumulated to withdraw");
            console.log("Make a withdrawal first to generate fees");
            return;
        }
        
        // Check authorization
        if (signer.address.toLowerCase() !== feeRecipient.toLowerCase() && 
            signer.address.toLowerCase() !== owner.toLowerCase()) {
            console.log("\nERROR: Signer is not authorized to withdraw fees");
            console.log(`   Signer: ${signer.address}`);
            console.log(`   Fee recipient: ${feeRecipient}`);
            console.log(`   Owner: ${owner}`);
            return;
        }
        
        // Check fee recipient is set
        if (feeRecipient === ethers.ZeroAddress) {
            console.log("\nERROR: No fee recipient set");
            console.log("Set fee recipient first using addFeeRecipient.ts");
            return;
        }
        
        // 2. Check balances before
        console.log("\n2. Balances BEFORE fee withdrawal:");
        const recipientBalanceBefore = await hbar.balanceOf(feeRecipient);
        console.log(`   Fee recipient balance: ${ethers.formatEther(recipientBalanceBefore)} HBAR`);
        
        // 3. Execute fee withdrawal
        console.log("\n3. Withdrawing accumulated fees...");
        const tx = await vault.withdrawFees({
            gasLimit: 200000
        });
        
        console.log(`   Transaction sent: ${tx.hash}`);
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            console.log(`   Fee withdrawal successful!`);
            console.log(`   Gas used: ${receipt.gasUsed}`);
            
            // Check for FeesWithdrawn event
            if (receipt.logs && receipt.logs.length > 0) {
                console.log(`   Events emitted: ${receipt.logs.length}`);
            }
        } else {
            console.log(`   Fee withdrawal failed!`);
            return;
        }
        
        // 4. Check state after withdrawal
        console.log("\n4. State AFTER fee withdrawal:");
        const accumulatedFeesAfter = await vault.getTotalAccumulatedFees();
        const recipientBalanceAfter = await hbar.balanceOf(feeRecipient);
        
        console.log(`   Accumulated fees: ${ethers.formatEther(accumulatedFeesAfter)} HBAR`);
        console.log(`   Fee recipient balance: ${ethers.formatEther(recipientBalanceAfter)} HBAR`);
        
        // 5. Verify results
        console.log("\n5. Results verification:");
        const feesWithdrawn = BigInt(recipientBalanceAfter) - BigInt(recipientBalanceBefore);
        
        console.log(`   Fees withdrawn: ${ethers.formatEther(feesWithdrawn.toString())} HBAR`);
        console.log(`   Expected fees: ${ethers.formatEther(accumulatedFees)} HBAR`);
        
        if (BigInt(feesWithdrawn) === BigInt(accumulatedFees)) {
            console.log("   Correct amount withdrawn");
        } else {
            console.log("   ERROR: Wrong amount withdrawn");
        }
        
        if (BigInt(accumulatedFeesAfter) === BigInt(0)) {
            console.log("   Accumulated fees reset to zero");
        } else {
            console.log("   ERROR: Accumulated fees not reset");
        }
        
        console.log("\nMANUAL FEE WITHDRAWAL COMPLETED!");
        
    } catch (error: any) {
        console.error("\nError during fee withdrawal:");
        console.error(`   Message: ${error.message}`);
        
        if (error.message.includes("Not authorized to withdraw fees")) {
            console.log("\nSOLUTION: Use the fee recipient or owner account");
        } else if (error.message.includes("No fee recipient set")) {
            console.log("\nSOLUTION: Set fee recipient first using addFeeRecipient.ts");
        } else if (error.message.includes("No fees to withdraw")) {
            console.log("\nSOLUTION: Make a withdrawal first to generate fees");
        }
        
        if (error.reason) {
            console.error(`   Reason: ${error.reason}`);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Script failed:", error);
        process.exit(1);
    });