import { ethers } from "hardhat";

async function main() {
    const VAULT_ADDRESS = "0x8D03Cab8D66D923ae267f9e6727721aFDBdd25E2";
    const FEE_RECIPIENT_ADDRESS = "0xa7b84453a22AdAdC015CFd3ec5104e9C43BA6224";
    
    const VAULT_ABI = [
        "function setFeeRecipient(address newRecipient) external",
        "function feeRecipient() external view returns (address)",
        "function owner() external view returns (address)"
    ];

    const vault = await ethers.getContractAt(VAULT_ABI, VAULT_ADDRESS);

    try {
        // 1. Verify the current fee recipient
        console.log("Verification the current fee recipient...");
        const currentFeeRecipient = await vault.feeRecipient();
        console.log(`Fee recipient current: ${currentFeeRecipient}`);
        
        // 2. Verify the owner of the contract
        const owner = await vault.owner();
        console.log(`Owner of the contract: ${owner}`);
        
        // 3. Get the current signer
        const [signer] = await ethers.getSigners();
        console.log(`Signer used: ${signer.address}`);
        
        // 4. Verify that the signer is the owner
        if (owner.toLowerCase() !== signer.address.toLowerCase()) {
            throw new Error("The signer is not the owner of the contract");
        }
        
        // 5. If the fee recipient is already correct, no need to change
        if (currentFeeRecipient.toLowerCase() === FEE_RECIPIENT_ADDRESS.toLowerCase()) {
            console.log("The fee recipient is already configured correctly");
            return;
        }
        
        // 6. Change the fee recipient
        console.log("Change the fee recipient...");
        const tx = await vault.setFeeRecipient(FEE_RECIPIENT_ADDRESS);
        
        console.log(`Transaction sent: ${tx.hash}`);
        console.log("Waiting for confirmation...");
        
        // 7. Wait for confirmation
        const receipt = await tx.wait();
        
        console.log(`Transaction confirmed in block: ${receipt.blockNumber}`);
        console.log(`Gas used: ${receipt.gasUsed.toString()}`);
        
        // 8. Verify that the change has been made
        const newFeeRecipient = await vault.feeRecipient();
        console.log(`New fee recipient: ${newFeeRecipient}`);
        
        if (newFeeRecipient.toLowerCase() === FEE_RECIPIENT_ADDRESS.toLowerCase()) {
            console.log("Fee recipient changed successfully!");
        } else {
            console.log("Error: the fee recipient has not been changed correctly");
        }
        
    } catch (error: any) {
        console.error("Error:", error.message);
        
        // Display more details if it's a transaction error
        if (error.transaction) {
            console.error("Transaction failed:", error.transaction);
        }
        if (error.receipt) {
            console.error("Receipt of the transaction:", error.receipt);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Script failed:", error);
        process.exit(1);
    });