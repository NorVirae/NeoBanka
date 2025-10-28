import { ethers } from "hardhat";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

async function main() {
    console.log("RPC URL:", process.env.HEDERA_RPC_URL);
    console.log("Private key set:", !!process.env.HEDERA_PRIVATE_KEY);
    const HBAR_Address = "0xA219e375D1F84A50273c93FaaF5EACD285bD9990"
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", await deployer.getAddress());

    // const MockERC20 = await ethers.getContractFactory("MockERC20");
    // const mockERC20 = await MockERC20.deploy("MockERC20", "MOCK", ethers.parseEther("1000000"));
    // await mockERC20.waitForDeployment();
    // console.log("MockERC20 deployed to:", await mockERC20.getAddress());

    const NeoBankVault = await ethers.getContractFactory("NeoBankVault");
    const vault = await NeoBankVault.deploy(HBAR_Address);
    await vault.waitForDeployment();
    console.log("NeoBankVault deployed to:", await vault.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});