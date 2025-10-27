import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
     
    const MOCK_ADDRESS = "0x66B8244b08be8F4Cec1A23C5c57A1d7b8A27189D";
    const POOL_ADDRESS = "0x518fC4A2b56f592E0296649D4955Fde16F464549";
    
    // Define ABIs
    const MOCK_TOKEN_ABI = [
        "function balanceOf(address owner) external view returns (uint256)",
        "function decimals() external view returns (uint8)",
        "function symbol() external view returns (string)",
        "function name() external view returns (string)"
    ];
    
    try {
        console.log("GET POOL BALANCE INFORMATION");
        console.log("=".repeat(50));
        console.log(`Deployer address: ${deployer.address}`);
        console.log(`Mock Token address: ${MOCK_ADDRESS}`);
        console.log(`Pool address: ${POOL_ADDRESS}`);
        console.log("");
        
        // Connect to contracts using ABIs
        const mockERC20 = new ethers.Contract(MOCK_ADDRESS, MOCK_TOKEN_ABI, deployer);
        
        // Get token information
        const tokenName = await mockERC20.name();
        const tokenSymbol = await mockERC20.symbol();
        const tokenDecimals = await mockERC20.decimals();
        
        console.log("TOKEN INFORMATION:");
        console.log(`Name: ${tokenName}`);
        console.log(`Symbol: ${tokenSymbol}`);
        console.log(`Decimals: ${tokenDecimals}`);
        console.log("");
        
        // Get native balance (HBAR)
        const nativeBalance = await ethers.provider.getBalance(POOL_ADDRESS);
        
        // Get token balance
        const tokenBalance = await mockERC20.balanceOf(POOL_ADDRESS);
        
        console.log("POOL BALANCES:");
        console.log(`Native (HBAR) balance: ${ethers.formatEther(nativeBalance)} HBAR`);
        console.log(`Token balance: ${ethers.formatUnits(tokenBalance, tokenDecimals)} ${tokenSymbol}`);
        
    } catch (error: any) {
        console.error("Error getting balance information:");
        console.error("Error message:", error.message);
        
        if (error.message.includes("call revert exception")) {
            console.log("SOLUTION: Check that contract addresses are correct and deployed");
        }
        
        if (error.reason) {
            console.log("Reason:", error.reason);
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});