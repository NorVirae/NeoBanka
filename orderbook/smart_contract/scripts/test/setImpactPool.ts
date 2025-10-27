// scripts/testFile/setImpactPool.ts
import { ethers } from "hardhat";

async function main() {
    const VAULT_ADDRESS = "0x8D03Cab8D66D923ae267f9e6727721aFDBdd25E2";
    const NEW_IMPACT_POOL_ADDRESS = "0x518fC4A2b56f592E0296649D4955Fde16F464549"; 

    const VAULT_ABI = [
        "function setImpactPool(address newImpactPool) external",
        "function impactPool() external view returns (address)",
        "function owner() external view returns (address)"
    ];

    const [signer] = await ethers.getSigners();
    console.log("Signer:", signer.address);
    console.log("Vault:", VAULT_ADDRESS);
    console.log("New Impact Pool Address:", NEW_IMPACT_POOL_ADDRESS);

    const vault = await ethers.getContractAt(VAULT_ABI, VAULT_ADDRESS);

    try {
        console.log("SET IMPACT POOL ADDRESS");
        console.log("=".repeat(40));
        
        // Check current impact pool
        const currentImpactPool = await vault.impactPool();
        console.log(`Current impact pool: ${currentImpactPool}`);
        
        // Check if signer is owner
        const owner = await vault.owner();
        console.log(`Vault owner: ${owner}`);
        
        if (signer.address.toLowerCase() !== owner.toLowerCase()) {
            console.log("ERROR: Signer is not the vault owner");
            console.log("Only the owner can set the impact pool address");
            return;
        }
        
        if (currentImpactPool === NEW_IMPACT_POOL_ADDRESS) {
            console.log("INFO: Impact pool is already set to this address");
            return;
        }
        
        // Validate new address
        if (NEW_IMPACT_POOL_ADDRESS === ethers.ZeroAddress) {
            console.log("ERROR: Cannot set impact pool to zero address");
            return;
        }
        
        console.log("\nSetting new impact pool address...");
        
        const tx = await vault.setImpactPool(NEW_IMPACT_POOL_ADDRESS);
        console.log(`Transaction sent: ${tx.hash}`);
        console.log("Waiting for confirmation...");
        
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            console.log("Impact pool address set successfully!");
            console.log(`Gas used: ${receipt.gasUsed}`);
            
            // Verify the change
            const newImpactPool = await vault.impactPool();
            console.log(`\nVerification:`);
            console.log(`Previous impact pool: ${currentImpactPool}`);
            console.log(`New impact pool: ${newImpactPool}`);
            
            if (newImpactPool === NEW_IMPACT_POOL_ADDRESS) {
                console.log("Impact pool address updated successfully!");
            } else {
                console.log("ERROR: Impact pool address was not updated correctly");
            }
        } else {
            console.log("Transaction failed!");
        }

    } catch (error: any) {
        console.error("Error setting impact pool:");
        console.error("Error message:", error.message);
        
        if (error.message.includes("Invalid impact pool address")) {
            console.log("SOLUTION: Provide a valid non-zero address");
        } else if (error.message.includes("Ownable: caller is not the owner")) {
            console.log("SOLUTION: Use the owner account to set impact pool");
        }
        
        if (error.reason) {
            console.log("Reason:", error.reason);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Script failed:", error);
        process.exit(1);
    });