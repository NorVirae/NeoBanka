import { ethers } from "hardhat";

async function main() {
    const MOCK_ADDRESS = "0x66B8244b08be8F4Cec1A23C5c57A1d7b8A27189D";
    const TRANSFER_AMOUNT = ethers.parseEther("10000");
    const TO_ADDRESS = "0xa7b84453a22AdAdC015CFd3ec5104e9C43BA6224";
    


    const MOCK_ABI = [
        "function transfer(address to, uint256 amount) external returns (bool)",
        "function balanceOf(address account) external view returns (uint256)"
    ];

    const [signer] = await ethers.getSigners();
    const mock = await ethers.getContractAt(MOCK_ABI, MOCK_ADDRESS);

    const tx = await mock.transfer(TO_ADDRESS, TRANSFER_AMOUNT);
    const receipt = await tx.wait();
    console.log(`Transaction sent: ${tx.hash}`);
    console.log(`Transaction confirmed: ${receipt.status}`);
}

main();