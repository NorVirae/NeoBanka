import { ethers } from "hardhat";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

async function main() {
    console.log("RPC URL:", process.env.HEDERA_RPC_URL);
    console.log("Private key set:", !!process.env.HEDERA_PRIVATE_KEY);
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", await deployer.getAddress());

    const HBAR = await ethers.getContractFactory("MockToken");
    const hbar = await HBAR.deploy("Hedera", "HBAR", ethers.parseEther("1000000"));
    await hbar.waitForDeployment();
    console.log("HBAR deployed to:", await hbar.getAddress());


    const USDT = await ethers.getContractFactory("MockToken");
    const usdt = await USDT.deploy("USD Token", "USDT", ethers.parseEther("1000000"));
    await usdt.waitForDeployment();
    console.log("USDT deployed to:", await usdt.getAddress());


}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});