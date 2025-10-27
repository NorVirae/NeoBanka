import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
     
    const MOCK_ADDRESS = "0x66B8244b08be8F4Cec1A23C5c57A1d7b8A27189D";
    const VAULT_ADDRESS = "0x8D03Cab8D66D923ae267f9e6727721aFDBdd25E2";
    
    // Define ABIs
    const MOCK_TOKEN_ABI = [
        "function balanceOf(address owner) external view returns (uint256)",
        "function decimals() external view returns (uint8)",
        "function symbol() external view returns (string)",
        "function name() external view returns (string)"
    ];
    
    const VAULT_ABI = [
        "function getSharePrice() external view returns (uint256)",
        "function totalAssets() external view returns (uint256)",
        "function totalSupply() external view returns (uint256)",
        "function shareToUser(address user) external view returns (uint256)",
        "function getUserProfits(address user) external view returns (uint256)",
        "function getUserTotalDeposited(address user) external view returns (uint256)",
        "function getAvailableAssets() external view returns (uint256)",
        "function totalAllocated() external view returns (uint256)",
        "function getTotalAccumulatedFees() external view returns (uint256)",
        "function impactPool() external view returns (address)"
    ];
    
    try {
        console.log("GET BALANCE INFORMATION");
        console.log("=".repeat(50));
        console.log(`Deployer address: ${deployer.address}`);
        console.log(`Mock Token address: ${MOCK_ADDRESS}`);
        console.log(`Vault address: ${VAULT_ADDRESS}`);
        console.log("");
        
        // Connect to contracts using ABIs
        const mockERC20 = new ethers.Contract(MOCK_ADDRESS, MOCK_TOKEN_ABI, deployer);
        const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, deployer);
        
        // Get token information
        const tokenName = await mockERC20.name();
        const tokenSymbol = await mockERC20.symbol();
        const tokenDecimals = await mockERC20.decimals();
        
        console.log("TOKEN INFORMATION:");
        console.log(`Name: ${tokenName}`);
        console.log(`Symbol: ${tokenSymbol}`);
        console.log(`Decimals: ${tokenDecimals}`);
        console.log("");
        
        // Get balances
        const deployerBalance = await mockERC20.balanceOf(deployer.address);
        const vaultBalance = await mockERC20.balanceOf(VAULT_ADDRESS);
        
        console.log("TOKEN BALANCES:");
        console.log(`Deployer balance: ${ethers.formatUnits(deployerBalance, tokenDecimals)} ${tokenSymbol}`);
        console.log(`Vault balance: ${ethers.formatUnits(vaultBalance, tokenDecimals)} ${tokenSymbol}`);
        console.log("");
        
        // Get vault information
        const sharePrice = await vault.getSharePrice();
        const totalAssets = await vault.totalAssets();
        const totalSupply = await vault.totalSupply();
        const availableAssets = await vault.getAvailableAssets();
        const totalAllocated = await vault.totalAllocated();
        const accumulatedFees = await vault.getTotalAccumulatedFees();
        const impactPool = await vault.impactPool();
        
        console.log("VAULT INFORMATION:");
        console.log(`Share price: ${ethers.formatEther(sharePrice)} (18 decimals)`);
        console.log(`Total assets: ${ethers.formatUnits(totalAssets, tokenDecimals)} ${tokenSymbol}`);
        console.log(`Total supply: ${ethers.formatEther(totalSupply)} shares`);
        console.log(`Available assets: ${ethers.formatUnits(availableAssets, tokenDecimals)} ${tokenSymbol}`);
        console.log(`Total allocated: ${ethers.formatUnits(totalAllocated, tokenDecimals)} ${tokenSymbol}`);
        console.log(`Accumulated fees: ${ethers.formatUnits(accumulatedFees, tokenDecimals)} ${tokenSymbol}`);
        console.log(`Impact pool: ${impactPool}`);
        console.log("");
        
        // Get user-specific information
        const userShares = await vault.shareToUser(deployer.address);
        const userProfits = await vault.getUserProfits(deployer.address);
        const userTotalDeposited = await vault.getUserTotalDeposited(deployer.address);
        
        console.log("USER INFORMATION (DEPLOYER):");
        console.log(`User shares: ${ethers.formatEther(userShares)} shares`);
        console.log(`User profits: ${ethers.formatUnits(userProfits, tokenDecimals)} ${tokenSymbol}`);
        console.log(`User total deposited: ${ethers.formatUnits(userTotalDeposited, tokenDecimals)} ${tokenSymbol}`);
        
        if (userShares > 0) {
            const userCurrentValue = (userShares * totalAssets) / totalSupply;
            console.log(`User current value: ${ethers.formatUnits(userCurrentValue, tokenDecimals)} ${tokenSymbol}`);
        }
        
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

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Script failed:", error);
        process.exit(1);
    });

