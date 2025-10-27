import { ethers } from "hardhat";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

async function main() {
    console.log("RPC URL:", process.env.HEDERA_RPC_URL);
    console.log("Private key set:", !!process.env.HEDERA_PRIVATE_KEY);
    const MOCK_ERC20_ADDRESS = "0x66B8244b08be8F4Cec1A23C5c57A1d7b8A27189D";
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", await deployer.getAddress());

    const SimpleImpactCertificate = await ethers.getContractFactory("SimpleImpactCertificate");
    const simpleImpactCertificate = await SimpleImpactCertificate.deploy();
    await simpleImpactCertificate.waitForDeployment();
    console.log("SimpleImpactCertificate deployed to:", await simpleImpactCertificate.getAddress());

    const ImpactPool = await ethers.getContractFactory("ImpactPool");
    const impactPool = await ImpactPool.deploy(MOCK_ERC20_ADDRESS, await simpleImpactCertificate.getAddress());
    await impactPool.waitForDeployment();
    console.log("ImpactPool deployed to:", await impactPool.getAddress());

}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});