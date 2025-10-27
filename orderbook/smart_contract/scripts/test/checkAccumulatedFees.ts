import { ethers } from "hardhat";

async function main() {
    const VAULT_ADDRESS = "0x8D03Cab8D66D923ae267f9e6727721aFDBdd25E2";

    const VAULT_ABI = [
        "function getTotalAccumulatedFees() external view returns (uint256)",
        "function feeRecipient() external view returns (address)",
        "function withdrawalFeeBps() external view returns (uint256)",
        "function totalAssets() external view returns (uint256)",
        "function totalSupply() external view returns (uint256)",
        "function getSharePrice() external view returns (uint256)"
    ];

    const [signer] = await ethers.getSigners();
    console.log("Signer:", signer.address);

    const vault = await ethers.getContractAt(VAULT_ABI, VAULT_ADDRESS);

    try {
        console.log("VAULT ACCUMULATED FEES CHECK");
        console.log("=".repeat(40));
        
        // Get fee information
        const accumulatedFees = await vault.getTotalAccumulatedFees();
        const feeRecipient = await vault.feeRecipient();
        const withdrawalFeeBps = await vault.withdrawalFeeBps();
        
        // Get vault state
        const totalAssets = await vault.totalAssets();
        const totalSupply = await vault.totalSupply();
        const sharePrice = await vault.getSharePrice();

        console.log("\nVAULT STATE:");
        console.log(`Total assets: ${ethers.formatEther(totalAssets)} HBAR`);
        console.log(`Total supply: ${ethers.formatEther(totalSupply)} shares`);
        console.log(`Share price: ${ethers.formatEther(sharePrice)}`);
        
        console.log("\nFEE INFORMATION:");
        console.log(`Accumulated fees: ${ethers.formatEther(accumulatedFees)} HBAR`);
        console.log(`Fee recipient: ${feeRecipient}`);
        console.log(`Withdrawal fee rate: ${withdrawalFeeBps.toString()} bps (${Number(withdrawalFeeBps) / 100}%)`);
        
        if (feeRecipient === ethers.ZeroAddress) {
            console.log("\nSTATUS: No fee recipient set");
            if (BigInt(accumulatedFees) > 0) {
                console.log(`- ${ethers.formatEther(accumulatedFees)} HBAR fees are accumulated`);
                console.log("- Set a fee recipient to enable auto-withdrawal");
                console.log("- Or use withdrawFees() function to manually withdraw");
            } else {
                console.log("- No fees accumulated");
            }
        } else {
            console.log(`\nSTATUS: Fee recipient set to ${feeRecipient}`);
            if (BigInt(accumulatedFees) > 0) {
                console.log(`- WARNING: ${ethers.formatEther(accumulatedFees)} HBAR fees accumulated`);
                console.log("- These should have been auto-withdrawn");
                console.log("- Check if auto-withdrawal logic is working");
            } else {
                console.log("- No fees accumulated (normal with auto-withdrawal)");
            }
        }

    } catch (error: any) {
        console.error("Error:", error.message);
        
        if (error.reason) {
            console.error("Reason:", error.reason);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Script failed:", error);
        process.exit(1);
    });