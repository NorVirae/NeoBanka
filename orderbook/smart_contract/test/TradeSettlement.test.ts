import { expect } from "chai";
import { ethers } from "hardhat";
import { TradeSettlement, MockToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Cross-Chain Trade Settlement", function () {
  let tradeSettlement: TradeSettlement;
  let mockHBAR: MockToken;
  let mockUSDT: MockToken;
  let owner: SignerWithAddress;
  let traderA: SignerWithAddress;
  let traderB: SignerWithAddress;
  let party1ReceiveWallet: SignerWithAddress;
  let party2ReceiveWallet: SignerWithAddress;
  
  const CHAIN_A_ID = 31337n;
  const CHAIN_B_ID = 31337n;
  const PRICE = ethers.parseEther("5");
  const QUANTITY = ethers.parseEther("100");
  const QUOTE_AMOUNT = (QUANTITY * PRICE) / ethers.parseEther("1");

  beforeEach(async function () {
    [owner, traderA, traderB, party1ReceiveWallet, party2ReceiveWallet] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20Factory = await ethers.getContractFactory("MockToken");
    mockHBAR = await MockERC20Factory.deploy("HBAR", "HBAR", ethers.parseEther("10000"));
    mockUSDT = await MockERC20Factory.deploy("USDT", "USDT", ethers.parseEther("10000"));

    // Deploy settlement contract
    const TradeSettlementFactory = await ethers.getContractFactory("TradeSettlement");
    tradeSettlement = await TradeSettlementFactory.deploy();

    // Fund traders
    await mockHBAR.transfer(traderA.address, ethers.parseEther("1000"));
    await mockUSDT.transfer(traderB.address, ethers.parseEther("1000"));

    // Approve contract
    await mockHBAR.connect(traderA).approve(await tradeSettlement.getAddress(), ethers.parseEther("1000"));
    await mockUSDT.connect(traderB).approve(await tradeSettlement.getAddress(), ethers.parseEther("1000"));
  });

  function createTradeData(orderId: string, timestamp: number, nonce1 = 0n, nonce2 = 0n) {
    return {
      orderId: ethers.id(orderId),
      party1: traderA.address,
      party2: traderB.address,
      party1ReceiveWallet: party1ReceiveWallet.address,
      party2ReceiveWallet: party2ReceiveWallet.address,
      baseAsset: mockHBAR.target,
      quoteAsset: mockUSDT.target,
      price: PRICE,
      quantity: QUANTITY,
      party1Side: "ask",
      party2Side: "bid",
      sourceChainId: CHAIN_A_ID,
      destinationChainId: CHAIN_B_ID,
      timestamp: BigInt(timestamp),
      nonce1,
      nonce2
    };
  }

  async function signTrade(signer: SignerWithAddress, tradeData: any, receiveWallet: string, side: string) {
    const messageHash = ethers.solidityPackedKeccak256(
      ["bytes32", "address", "address", "uint256", "uint256", "string", "address", "uint256", "uint256", "uint256", "uint256"],
      [
        tradeData.orderId,
        tradeData.baseAsset,
        tradeData.quoteAsset,
        tradeData.price,
        tradeData.quantity,
        side,
        receiveWallet,
        tradeData.sourceChainId,
        tradeData.destinationChainId,
        tradeData.timestamp,
        side === "ask" ? tradeData.nonce1 : tradeData.nonce2
      ]
    );
    return await signer.signMessage(ethers.getBytes(messageHash));
  }

  async function signMatchingEngine(tradeData: any, isSourceChain: boolean, chainId: bigint) {
    const messageHash = ethers.solidityPackedKeccak256(
      ["bytes32", "address", "address", "address", "address", "address", "address", "uint256", "uint256", "bool", "uint256"],
      [
        tradeData.orderId,
        tradeData.party1,
        tradeData.party2,
        tradeData.party1ReceiveWallet,
        tradeData.party2ReceiveWallet,
        tradeData.baseAsset,
        tradeData.quoteAsset,
        tradeData.price,
        tradeData.quantity,
        isSourceChain,
        chainId
      ]
    );
    return await owner.signMessage(ethers.getBytes(messageHash));
  }

  it("1. Should deposit and lock funds for both traders", async function () {
    await tradeSettlement.connect(traderA).depositToEscrow(mockHBAR.target, QUANTITY);
    await tradeSettlement.connect(traderB).depositToEscrow(mockUSDT.target, QUOTE_AMOUNT);

    const balanceA = await tradeSettlement.checkEscrowBalance(traderA.address, mockHBAR.target);
    const balanceB = await tradeSettlement.checkEscrowBalance(traderB.address, mockUSDT.target);

    expect(balanceA[0]).to.equal(QUANTITY);
    expect(balanceA[1]).to.equal(QUANTITY);
    expect(balanceB[0]).to.equal(QUOTE_AMOUNT);
    expect(balanceB[1]).to.equal(QUOTE_AMOUNT);
  });

  it("2. Should settle on source chain - TraderA sends HBAR to party2ReceiveWallet", async function () {
    const orderId = "order1";
    const timestamp = Math.floor(Date.now() / 1000);
    const tradeData = createTradeData(orderId, timestamp);

    await tradeSettlement.connect(traderA).depositToEscrow(mockHBAR.target, QUANTITY);
    
    // Manually lock the funds before settlement
    const contractAddress = await tradeSettlement.getAddress();
    const orderIdBytes32 = ethers.id(orderId);
    await tradeSettlement.lockEscrowForOrder(traderA.address, mockHBAR.target, QUANTITY, orderIdBytes32);
    
    const sig1 = await signTrade(traderA, tradeData, party1ReceiveWallet.address, "ask");
    const sig2 = await signTrade(traderB, tradeData, party2ReceiveWallet.address, "bid");
    const matchingSig = await signMatchingEngine(tradeData, true, CHAIN_A_ID);

    const initialBalance = await mockHBAR.balanceOf(party2ReceiveWallet.address);

    await tradeSettlement.settleCrossChainTrade(tradeData, sig1, sig2, matchingSig, true);

    const finalBalance = await mockHBAR.balanceOf(party2ReceiveWallet.address);
    expect(finalBalance - initialBalance).to.equal(QUANTITY);

    const [total, , locked] = await tradeSettlement.checkEscrowBalance(traderA.address, mockHBAR.target);
    expect(total).to.equal(0n);
    expect(locked).to.equal(0n);
  });

  it("3. Should settle on destination chain - TraderB sends USDT to party1ReceiveWallet", async function () {
    const orderId = "order2";
    const timestamp = Math.floor(Date.now() / 1000);
    const tradeData = createTradeData(orderId, timestamp);

    await tradeSettlement.connect(traderB).depositToEscrow(mockUSDT.target, QUOTE_AMOUNT);

    // Manually lock the funds before settlement
    const orderIdBytes32 = ethers.id(orderId);
    await tradeSettlement.lockEscrowForOrder(traderB.address, mockUSDT.target, QUOTE_AMOUNT, orderIdBytes32);

    const sig1 = await signTrade(traderA, tradeData, party1ReceiveWallet.address, "ask");
    const sig2 = await signTrade(traderB, tradeData, party2ReceiveWallet.address, "bid");
    const matchingSig = await signMatchingEngine(tradeData, false, CHAIN_B_ID);

    const initialBalance = await mockUSDT.balanceOf(party1ReceiveWallet.address);

    await tradeSettlement.settleCrossChainTrade(tradeData, sig1, sig2, matchingSig, false);

    const finalBalance = await mockUSDT.balanceOf(party1ReceiveWallet.address);
    expect(finalBalance - initialBalance).to.equal(QUOTE_AMOUNT);

    const [total, , locked] = await tradeSettlement.checkEscrowBalance(traderB.address, mockUSDT.target);
    expect(total).to.equal(0n);
    expect(locked).to.equal(0n);
  });

  it("4. Should revert with invalid party1 signature", async function () {
    const orderId = "order3";
    const timestamp = Math.floor(Date.now() / 1000);
    const tradeData = createTradeData(orderId, timestamp);

    await tradeSettlement.connect(traderA).depositToEscrow(mockHBAR.target, QUANTITY);

    const invalidSig1 = await signTrade(traderB, tradeData, party1ReceiveWallet.address, "ask");
    const sig2 = await signTrade(traderB, tradeData, party2ReceiveWallet.address, "bid");
    const matchingSig = await signMatchingEngine(tradeData, true, CHAIN_A_ID);

    await expect(
      tradeSettlement.settleCrossChainTrade(tradeData, invalidSig1, sig2, matchingSig, true)
    ).to.be.revertedWith("Invalid party1 signature");
  });

  it("5. Should revert with invalid matching engine signature", async function () {
    const orderId = "order4";
    const timestamp = Math.floor(Date.now() / 1000);
    const tradeData = createTradeData(orderId, timestamp);

    await tradeSettlement.connect(traderA).depositToEscrow(mockHBAR.target, QUANTITY);

    const sig1 = await signTrade(traderA, tradeData, party1ReceiveWallet.address, "ask");
    const sig2 = await signTrade(traderB, tradeData, party2ReceiveWallet.address, "bid");
    
    const invalidMatchingSig = await signTrade(traderA, tradeData, party1ReceiveWallet.address, "ask");

    await expect(
      tradeSettlement.settleCrossChainTrade(tradeData, sig1, sig2, invalidMatchingSig, true)
    ).to.be.revertedWith("Invalid matching engine signature");
  });

  it("6. Should prevent replay attacks", async function () {
    const orderId = "order5";
    const timestamp = Math.floor(Date.now() / 1000);
    const tradeData = createTradeData(orderId, timestamp);

    await tradeSettlement.connect(traderA).depositToEscrow(mockHBAR.target, QUANTITY * 2n);

    // Lock funds before first settlement
    const orderIdBytes32 = ethers.id(orderId);
    await tradeSettlement.lockEscrowForOrder(traderA.address, mockHBAR.target, QUANTITY, orderIdBytes32);

    const sig1 = await signTrade(traderA, tradeData, party1ReceiveWallet.address, "ask");
    const sig2 = await signTrade(traderB, tradeData, party2ReceiveWallet.address, "bid");
    const matchingSig = await signMatchingEngine(tradeData, true, CHAIN_A_ID);

    await tradeSettlement.settleCrossChainTrade(tradeData, sig1, sig2, matchingSig, true);

    await expect(
      tradeSettlement.settleCrossChainTrade(tradeData, sig1, sig2, matchingSig, true)
    ).to.be.revertedWith("Order already settled on this chain");
  });

  it("7. Should revert with insufficient locked balance", async function () {
    const orderId = "order6";
    const timestamp = Math.floor(Date.now() / 1000);
    const tradeData = createTradeData(orderId, timestamp);

    // Deposit less than required
    await tradeSettlement.connect(traderA).depositToEscrow(mockHBAR.target, QUANTITY / 2n);

    const sig1 = await signTrade(traderA, tradeData, party1ReceiveWallet.address, "ask");
    const sig2 = await signTrade(traderB, tradeData, party2ReceiveWallet.address, "bid");
    const matchingSig = await signMatchingEngine(tradeData, true, CHAIN_A_ID);

    await expect(
      tradeSettlement.settleCrossChainTrade(tradeData, sig1, sig2, matchingSig, true)
    ).to.be.revertedWith("Insufficient locked base balance on source chain");
  });

  it("8. Should revert with invalid receive wallet", async function () {
    const orderId = "order7";
    const timestamp = Math.floor(Date.now() / 1000);
    const tradeData = createTradeData(orderId, timestamp);
    tradeData.party1ReceiveWallet = ethers.ZeroAddress;

    await tradeSettlement.connect(traderA).depositToEscrow(mockHBAR.target, QUANTITY);

    const sig1 = await signTrade(traderA, tradeData, ethers.ZeroAddress, "ask");
    const sig2 = await signTrade(traderB, tradeData, party2ReceiveWallet.address, "bid");
    const matchingSig = await signMatchingEngine(tradeData, true, CHAIN_A_ID);

    await expect(
      tradeSettlement.settleCrossChainTrade(tradeData, sig1, sig2, matchingSig, true)
    ).to.be.revertedWith("Invalid party1 receive wallet");
  });

  it("9. Should revert when parties are on same side", async function () {
    const orderId = "order8";
    const timestamp = Math.floor(Date.now() / 1000);
    const tradeData = createTradeData(orderId, timestamp);
    tradeData.party2Side = "ask"; // Both asking

    await tradeSettlement.connect(traderA).depositToEscrow(mockHBAR.target, QUANTITY);

    const sig1 = await signTrade(traderA, tradeData, party1ReceiveWallet.address, "ask");
    const sig2 = await signTrade(traderB, tradeData, party2ReceiveWallet.address, "ask");
    const matchingSig = await signMatchingEngine(tradeData, true, CHAIN_A_ID);

    await expect(
      tradeSettlement.settleCrossChainTrade(tradeData, sig1, sig2, matchingSig, true)
    ).to.be.revertedWith("Parties must be on opposite sides");
  });

  it("10. Should allow withdrawal of unlocked funds", async function () {
    await tradeSettlement.connect(traderA).depositToEscrow(mockHBAR.target, QUANTITY * 2n);

    const initialBalance = await mockHBAR.balanceOf(traderA.address);

    await tradeSettlement.connect(traderA).withdrawFromEscrow(mockHBAR.target, QUANTITY);

    const finalBalance = await mockHBAR.balanceOf(traderA.address);
    expect(finalBalance - initialBalance).to.equal(QUANTITY);

    const [total, available] = await tradeSettlement.checkEscrowBalance(traderA.address, mockHBAR.target);
    expect(total).to.equal(QUANTITY);
    expect(available).to.equal(QUANTITY);
  });
});