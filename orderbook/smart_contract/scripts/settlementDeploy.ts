// scripts/deploySettlement.ts
import { ethers } from "hardhat";
import hre from "hardhat";

async function main() {
    console.log("Setting up TradeSettlement contract...");

    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "HBAR");

    // Deploy the contract
    const TradeSettlement = await ethers.getContractFactory("TradeSettlement");
    const tradeSettlement = await TradeSettlement.deploy();
    await tradeSettlement.waitForDeployment();

    console.log("TradeSettlement deployed to:", await tradeSettlement.getAddress());
    
    const deploymentTx = tradeSettlement.deploymentTransaction();
    if (deploymentTx) {
        console.log("Deployment transaction hash:", deploymentTx.hash);
        
        // Get deployment cost info
        const receipt = await deploymentTx.wait();
        console.log("Gas used:", receipt?.gasUsed.toString());

        // Verify the contract on block explorer (if network supports it)
        if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
            console.log("Waiting for block confirmations...");
            await deploymentTx.wait(6);

        console.log("Verifying contract on block explorer...");
        try {
            await hre.run("verify:verify", {
                address: await tradeSettlement.getAddress(),
                constructorArguments: [],
            });
            console.log("Contract verified successfully");
        } catch (error) {
            if (error instanceof Error) {
                console.log("Verification failed:", error.message);
            } else {
                console.log("Verification failed: Unknown error");
            }
        }
        }
    }

    // Save deployment info
    const deploymentInfo = {
        network: hre.network.name,
        contract: "TradeSettlement",
        address: await tradeSettlement.getAddress(),
        deployer: deployer.address,
        deploymentHash: deploymentTx?.hash || "N/A",
        gasUsed: deploymentTx ? (await deploymentTx.wait())?.gasUsed.toString() : "N/A",
        timestamp: new Date().toISOString(),
    };

    console.log("DEPLOYMENT SUMMARY:");
    console.log("=".repeat(50));
    console.log(JSON.stringify(deploymentInfo, null, 2));
    console.log("=".repeat(50));

    return tradeSettlement;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Deployment failed:", error);
        process.exit(1);
    });

export default main;