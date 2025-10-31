import { ethers } from "hardhat";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

async function main() {
  console.log("RPC URL:", process.env.POLYGON_RPC_URL);
  console.log("Private key set:", !!process.env.POLYGON_PRIVATE_KEY);

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", await deployer.getAddress());

  // Get current network fee data
  const feeData = await ethers.provider.getFeeData();
  console.log("Current network fees:", {
    maxFeePerGas: feeData.maxFeePerGas ? ethers.formatUnits(feeData.maxFeePerGas, "gwei") + " gwei" : "N/A",
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? ethers.formatUnits(feeData.maxPriorityFeePerGas, "gwei") + " gwei" : "N/A",
  });

  // Polygon-optimized gas settings
  // Bump the priority fee significantly for faster inclusion
  const priorityFee = feeData.maxPriorityFeePerGas 
    ? (feeData.maxPriorityFeePerGas * 150n) / 100n  // 1.5x current priority fee
    : ethers.parseUnits("50", "gwei");  // fallback: 50 gwei

  const maxFee = feeData.maxFeePerGas
    ? (feeData.maxFeePerGas * 150n) / 100n  // 1.5x current max fee
    : ethers.parseUnits("200", "gwei");  // fallback: 200 gwei

  const feeOverrides = {
    maxPriorityFeePerGas: priorityFee,
    maxFeePerGas: maxFee > priorityFee ? maxFee : priorityFee + ethers.parseUnits("50", "gwei"),
  };

  console.log("Using gas settings:", {
    maxPriorityFeePerGas: ethers.formatUnits(feeOverrides.maxPriorityFeePerGas, "gwei") + " gwei",
    maxFeePerGas: ethers.formatUnits(feeOverrides.maxFeePerGas, "gwei") + " gwei",
  });

  // Helper function with timeout
  async function deployWithTimeout(factory: any, name: string, ...args: any[]) {
    console.log(`\n🚀 Deploying ${name}...`);
    
    // Estimate gas with buffer
    let gasLimit;
    try {
      const estimated = await factory.estimateGas.deploy(...args);
      gasLimit = (estimated * 130n) / 100n;  // 30% buffer
      console.log(`   Estimated gas: ${estimated.toString()}, using: ${gasLimit.toString()}`);
    } catch (err) {
      console.warn(`   Gas estimation failed, using default: 3000000`);
      gasLimit = 3_000_000n;
    }

    const deploymentPromise = factory.deploy(...args, {
      gasLimit,
      ...feeOverrides,
    });

    // Add timeout (5 minutes)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${name} deployment timed out after 5 minutes`)), 300000);
    });

    const contract = await Promise.race([deploymentPromise, timeoutPromise]);
    console.log(`   Transaction sent, waiting for confirmation...`);
    
    const deployedContract = await contract.waitForDeployment();
    const address = await deployedContract.getAddress();
    console.log(`   ✅ ${name} deployed to: ${address}`);
    
    return deployedContract;
  }

  try {
    // Deploy HBAR
    const HBAR = await ethers.getContractFactory("MockToken");
    const hbar = await deployWithTimeout(
      HBAR,
      "HBAR",
      "Hedera",
      "HBAR",
      ethers.parseEther("1000000")
    );

    // Wait a bit between deployments to avoid nonce issues
    console.log("\nWaiting 5 seconds before next deployment...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Deploy USDT
    const USDT = await ethers.getContractFactory("MockToken");
    const usdt = await deployWithTimeout(
      USDT,
      "USDT",
      "USD Token",
      "USDT",
      ethers.parseEther("1000000")
    );

    console.log("\n✨ All contracts deployed successfully!");
    console.log("HBAR:", await hbar.getAddress());
    console.log("USDT:", await usdt.getAddress());

  } catch (error: any) {
    console.error("\n❌ Deployment failed:");
    console.error(error.message);
    
    if (error.message.includes("timed out")) {
      console.log("\n💡 Troubleshooting tips:");
      console.log("1. Check if your RPC endpoint is responsive");
      console.log("2. Verify you have enough MATIC for gas fees");
      console.log("3. Try increasing gas prices in the script");
      console.log("4. Check Polygon network status: https://polygonscan.com/");
    }
    
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});