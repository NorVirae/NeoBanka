
import { ethers } from "hardhat";

async function main() {
    const VAULT_ADDRESS = "0xF46A4BaF773a88dF32170AeEfa566016Fa518408";
    const AUTHORIZED_AGENT_ADDRESS = "0x877664Ae1f1ca217977562A04592eCbCADb2Ca58";
    
    const VAULT_ABI = [
        "function owner() external view returns (address)",
        "function addAuthorizedAgent(address agent) external"
    ];

    const vault = await ethers.getContractAt(VAULT_ABI, VAULT_ADDRESS);

    try {
        
        
        // 1. Get the current signer
        const [signer] = await ethers.getSigners();
        console.log(`Signer used: ${signer.address}`);
        
        // 2. add agent
        console.log("add authorized agents");
        const tx = await vault.addAuthorizedAgent(AUTHORIZED_AGENT_ADDRESS);
        
        console.log(`Transaction sent: ${tx.hash}`);
        console.log("Waiting for confirmation...");
        
        // 7. Wait for confirmation
        const receipt = await tx.wait();
        
        console.log(`Transaction confirmed in block: ${receipt.blockNumber}`);
        console.log(`Gas used: ${receipt.gasUsed.toString()}`);
        
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