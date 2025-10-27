import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ImpactPool, MockToken, SimpleImpactCertificate } from "../typechain-types";

describe("ImpactPool", function () {
    let impactPool: ImpactPool;
    let whbarToken: MockToken;
    let certificateContract: SimpleImpactCertificate;
    let owner: Signer;
    let donor1: Signer;
    let donor2: Signer;
    let charity1: Signer;
    let charity2: Signer;
    let charity3: Signer;

    const INITIAL_SUPPLY = ethers.parseEther("1000000");
    const DONATION_AMOUNT = ethers.parseEther("100");
    const LARGE_DONATION = ethers.parseEther("500");

    beforeEach(async function () {
        [owner, donor1, donor2, charity1, charity2, charity3] = await ethers.getSigners();

        // Deploy mock WHBAR token
        const MockERC20 = await ethers.getContractFactory("MockToken");
        whbarToken = await MockERC20.deploy("Wrapped HBAR", "WHBAR", INITIAL_SUPPLY);
        await whbarToken.waitForDeployment();

        // Deploy SimpleImpactCertificate
        const SimpleImpactCertificate = await ethers.getContractFactory("SimpleImpactCertificate");
        certificateContract = await SimpleImpactCertificate.deploy();
        await certificateContract.waitForDeployment();

        // Deploy ImpactPool
        const ImpactPool = await ethers.getContractFactory("ImpactPool");
        impactPool = await ImpactPool.deploy(
            await whbarToken.getAddress(),
            await certificateContract.getAddress()
        );
        await impactPool.waitForDeployment();

        // Transfer tokens to donors
        await whbarToken.transfer(await donor1.getAddress(), ethers.parseEther("10000"));
        await whbarToken.transfer(await donor2.getAddress(), ethers.parseEther("10000"));

        // Approve ImpactPool to spend tokens
        await whbarToken.connect(donor1).approve(await impactPool.getAddress(), ethers.MaxUint256);
        await whbarToken.connect(donor2).approve(await impactPool.getAddress(), ethers.MaxUint256);
    });

    describe("Deployment", function () {
        it("Should set the correct WHBAR token address", async function () {
            expect(await impactPool.whbarToken()).to.equal(await whbarToken.getAddress());
        });

        it("Should set the correct certificate contract address", async function () {
            expect(await impactPool.certificateContract()).to.equal(await certificateContract.getAddress());
        });

        it("Should initialize with 3 charities", async function () {
            expect(await impactPool.charityCount()).to.equal(3);
        });

        it("Should initialize charities with correct data", async function () {
            const charity0 = await impactPool.getCharity(0);
            expect(charity0.name).to.equal("The Giving Block");
            expect(charity0.isActive).to.be.true;
            expect(charity0.targetAmount).to.equal(ethers.parseEther("75000"));
            expect(charity0.weight).to.equal(40);

            const charity1 = await impactPool.getCharity(1);
            expect(charity1.name).to.equal("Power Ledger Foundation");
            expect(charity1.weight).to.equal(35);

            const charity2 = await impactPool.getCharity(2);
            expect(charity2.name).to.equal("Climate Collective");
            expect(charity2.weight).to.equal(25);
        });

        it("Should start with zero total pool balance", async function () {
            expect(await impactPool.getTotalPoolBalance()).to.equal(0);
        });
    });

    describe("Donations", function () {
        it("Should allow users to donate", async function () {
            const tx = await impactPool.connect(donor1).donate(DONATION_AMOUNT);
            const receipt = await tx.wait();
            const block = await ethers.provider.getBlock(receipt!.blockNumber);

            await expect(tx)
                .to.emit(impactPool, "DonationMade")
                .withArgs(await donor1.getAddress(), DONATION_AMOUNT, block!.timestamp);
        });

        it("Should update user balance after donation", async function () {
            await impactPool.connect(donor1).donate(DONATION_AMOUNT);
            expect(await impactPool.getUserBalance(await donor1.getAddress())).to.equal(DONATION_AMOUNT);
        });

        it("Should update total pool balance after donation", async function () {
            await impactPool.connect(donor1).donate(DONATION_AMOUNT);
            expect(await impactPool.getTotalPoolBalance()).to.equal(DONATION_AMOUNT);
        });

        it("Should update user total donated", async function () {
            await impactPool.connect(donor1).donate(DONATION_AMOUNT);
            expect(await impactPool.getUserTotalDonated(await donor1.getAddress())).to.equal(DONATION_AMOUNT);
        });

        it("Should track multiple donations from same user", async function () {
            await impactPool.connect(donor1).donate(DONATION_AMOUNT);
            await impactPool.connect(donor1).donate(DONATION_AMOUNT);

            expect(await impactPool.getUserDonationCount(await donor1.getAddress())).to.equal(2);
            expect(await impactPool.getUserTotalDonated(await donor1.getAddress())).to.equal(DONATION_AMOUNT * 2n);
        });

        it("Should revert if donation amount is zero", async function () {
            await expect(impactPool.connect(donor1).donate(0))
                .to.be.revertedWith("Amount must be greater than 0");
        });

        it("Should revert if user has insufficient balance", async function () {
            const tooMuch = ethers.parseEther("20000");
            await expect(impactPool.connect(donor1).donate(tooMuch))
                .to.be.reverted;
        });

        it("Should revert if user hasn't approved tokens", async function () {
            const donor3 = (await ethers.getSigners())[6];
            await whbarToken.transfer(await donor3.getAddress(), DONATION_AMOUNT);

            await expect(impactPool.connect(donor3).donate(DONATION_AMOUNT))
                .to.be.reverted;
        });

        it("Should store donation details correctly", async function () {
            const tx = await impactPool.connect(donor1).donate(DONATION_AMOUNT);
            await tx.wait();

            const donation = await impactPool.getUserDonation(await donor1.getAddress(), 0);
            expect(donation.amount).to.equal(DONATION_AMOUNT);
            expect(donation.certificateIssued).to.be.false;
            expect(donation.certificateId).to.equal(0);
        });
    });

    describe("Donation Rate", function () {
        it("Should allow users to set donation rate", async function () {
            await expect(impactPool.connect(donor1).setDonationRate(5000))
                .to.emit(impactPool, "DonationRateUpdated")
                .withArgs(await donor1.getAddress(), 5000);
        });

        it("Should update donation rate correctly", async function () {
            await impactPool.connect(donor1).setDonationRate(7500);
            expect(await impactPool.getUserDonationRate(await donor1.getAddress())).to.equal(7500);
        });

        it("Should revert if rate exceeds 10000 (100%)", async function () {
            await expect(impactPool.connect(donor1).setDonationRate(10001))
                .to.be.revertedWith("Rate cannot exceed 100%");
        });

        it("Should allow setting rate to 10000 (exactly 100%)", async function () {
            await impactPool.connect(donor1).setDonationRate(10000);
            expect(await impactPool.getUserDonationRate(await donor1.getAddress())).to.equal(10000);
        });
    });

    describe("Charity Distribution", function () {
        beforeEach(async function () {
            await impactPool.connect(donor1).donate(ethers.parseEther("1000"));
        });

        it("Should distribute funds to charities", async function () {
            const initialBalance = await impactPool.getTotalPoolBalance();
            const expectedDistribution = initialBalance / 10n;

            await impactPool.distributeToCharities();

            const finalBalance = await impactPool.getTotalPoolBalance();
            expect(finalBalance).to.equal(initialBalance - expectedDistribution);
        });

        it("Should distribute according to weights", async function () {
            const poolBalance = await impactPool.getTotalPoolBalance();
            const distributionAmount = poolBalance / 10n;

            await impactPool.distributeToCharities();

            const charity0 = await impactPool.getCharity(0);
            const charity1 = await impactPool.getCharity(1);
            const charity2 = await impactPool.getCharity(2);

            // Total weight = 40 + 35 + 25 = 100
            const expectedCharity0 = (distributionAmount * 40n) / 100n;
            const expectedCharity1 = (distributionAmount * 35n) / 100n;
            const expectedCharity2 = (distributionAmount * 25n) / 100n;

            expect(charity0.totalReceived).to.equal(expectedCharity0);
            expect(charity1.totalReceived).to.equal(expectedCharity1);
            expect(charity2.totalReceived).to.equal(expectedCharity2);
        });

        it("Should emit CharityFunded events", async function () {
            const poolBalance = await impactPool.getTotalPoolBalance();
            const distributionAmount = poolBalance / 10n;
            const expectedCharity0Amount = (distributionAmount * 40n) / 100n;

            await expect(impactPool.distributeToCharities())
                .to.emit(impactPool, "CharityFunded")
                .withArgs(0, expectedCharity0Amount);
        });

        it("Should transfer tokens to charity wallets", async function () {
            const charity0 = await impactPool.getCharity(0);
            const initialCharityBalance = await whbarToken.balanceOf(charity0.walletAddress);

            const poolBalance = await impactPool.getTotalPoolBalance();
            const distributionAmount = poolBalance / 10n;
            const expectedAmount = (distributionAmount * 40n) / 100n;

            await impactPool.distributeToCharities();

            const finalCharityBalance = await whbarToken.balanceOf(charity0.walletAddress);
            expect(finalCharityBalance - initialCharityBalance).to.equal(expectedAmount);
        });

        it("Should revert if no funds to distribute", async function () {
            const ImpactPool = await ethers.getContractFactory("ImpactPool");
            const emptyPool = await ImpactPool.deploy(
                await whbarToken.getAddress(),
                await certificateContract.getAddress()
            );

            await expect(emptyPool.distributeToCharities())
                .to.be.revertedWith("No funds to distribute");
        });

        it("Should handle multiple distributions", async function () {
            await impactPool.distributeToCharities();
            const firstDistribution = (await impactPool.getCharity(0)).totalReceived;

            await impactPool.connect(donor2).donate(ethers.parseEther("1000"));
            await impactPool.distributeToCharities();

            const secondTotal = (await impactPool.getCharity(0)).totalReceived;
            expect(secondTotal).to.be.gt(firstDistribution);
        });
    });

    describe("Certificate Issuance", function () {
        beforeEach(async function () {
            await impactPool.connect(donor1).donate(DONATION_AMOUNT);
        });

        it("Should issue certificate for valid donation", async function () {
            await expect(impactPool.connect(donor1).issueCertificate(0))
                .to.emit(impactPool, "CertificateIssued");
        });

        it("Should mint certificate via certificate contract", async function () {
            const tx = await impactPool.connect(donor1).issueCertificate(0);
            await tx.wait();

            // Check certificate was minted
            const userCerts = await certificateContract.getUserCertificates(await donor1.getAddress());
            expect(userCerts.length).to.equal(1);

            const certificate = await certificateContract.getCertificate(0);
            expect(certificate.donor).to.equal(await donor1.getAddress());
            expect(certificate.amount).to.equal(DONATION_AMOUNT);
            expect(certificate.projectName).to.equal("Impact Pool Contribution");
            expect(certificate.exists).to.be.true;
        });

        it("Should update certificate balance in certificate contract", async function () {
            await impactPool.connect(donor1).issueCertificate(0);

            const balance = await certificateContract.balanceOf(await donor1.getAddress());
            expect(balance).to.equal(1);
        });

        it("Should set correct token owner", async function () {
            await impactPool.connect(donor1).issueCertificate(0);

            const owner = await certificateContract.ownerOf(0);
            expect(owner).to.equal(await donor1.getAddress());
        });

        it("Should store token URI", async function () {
            await impactPool.connect(donor1).issueCertificate(0);

            const uri = await certificateContract.tokenURI(0);
            expect(uri).to.include("data:application/json;base64,");
        });

        it("Should mark donation as certificate issued", async function () {
            await impactPool.connect(donor1).issueCertificate(0);

            const donation = await impactPool.getUserDonation(await donor1.getAddress(), 0);
            expect(donation.certificateIssued).to.be.true;
        });

        it("Should store certificate ID in donation", async function () {
            await impactPool.connect(donor1).issueCertificate(0);

            const donation = await impactPool.getUserDonation(await donor1.getAddress(), 0);
            expect(donation.certificateId).to.equal(0);
        });

        it("Should revert if certificate already issued", async function () {
            await impactPool.connect(donor1).issueCertificate(0);

            await expect(impactPool.connect(donor1).issueCertificate(0))
                .to.be.revertedWith("Certificate already issued");
        });

        it("Should revert if donation index is invalid", async function () {
            await expect(impactPool.connect(donor1).issueCertificate(5))
                .to.be.revertedWith("Invalid donation index");
        });

        it("Should revert if donation is below minimum (10 WHBAR)", async function () {
            await impactPool.connect(donor1).donate(ethers.parseEther("5"));

            await expect(impactPool.connect(donor1).issueCertificate(1))
                .to.be.revertedWith("Minimum 10 WHBAR for certificate");
        });

        it("Should allow certificate for exactly 10 WHBAR", async function () {
            await impactPool.connect(donor1).donate(ethers.parseEther("10"));

            await expect(impactPool.connect(donor1).issueCertificate(1))
                .to.not.be.reverted;
        });

        it("Should increment certificate counter", async function () {
            await impactPool.connect(donor1).issueCertificate(0);

            await impactPool.connect(donor1).donate(DONATION_AMOUNT);
            await impactPool.connect(donor1).issueCertificate(1);

            const donation2 = await impactPool.getUserDonation(await donor1.getAddress(), 1);
            expect(donation2.certificateId).to.equal(1);
        });

        it("Should track total donated in certificate contract", async function () {
            await impactPool.connect(donor1).issueCertificate(0);
            await impactPool.connect(donor1).donate(ethers.parseEther("200"));
            await impactPool.connect(donor1).issueCertificate(1);

            const totalDonated = await certificateContract.getUserTotalDonated(await donor1.getAddress());
            expect(totalDonated).to.equal(DONATION_AMOUNT + ethers.parseEther("200"));
        });

        it("Should emit CertificateMinted event from certificate contract", async function () {
            const result = await impactPool.connect(donor1).issueCertificate(0)
            await expect(result)
                .to.emit(certificateContract, "CertificateMinted")
        });
    });

    describe("View Functions", function () {
        beforeEach(async function () {
            await impactPool.connect(donor1).donate(DONATION_AMOUNT);
            await impactPool.connect(donor2).donate(ethers.parseEther("200"));
        });

        it("Should return correct user balance", async function () {
            expect(await impactPool.getUserBalance(await donor1.getAddress())).to.equal(DONATION_AMOUNT);
            expect(await impactPool.getUserBalance(await donor2.getAddress())).to.equal(ethers.parseEther("200"));
        });

        it("Should return correct total pool balance", async function () {
            const expected = DONATION_AMOUNT + ethers.parseEther("200");
            expect(await impactPool.getTotalPoolBalance()).to.equal(expected);
        });

        it("Should return correct user donation rate", async function () {
            await impactPool.connect(donor1).setDonationRate(5000);
            expect(await impactPool.getUserDonationRate(await donor1.getAddress())).to.equal(5000);
        });

        it("Should return zero for unset donation rate", async function () {
            expect(await impactPool.getUserDonationRate(await donor1.getAddress())).to.equal(0);
        });

        it("Should return correct user total donated", async function () {
            expect(await impactPool.getUserTotalDonated(await donor1.getAddress())).to.equal(DONATION_AMOUNT);
        });

        it("Should return correct donation count", async function () {
            expect(await impactPool.getUserDonationCount(await donor1.getAddress())).to.equal(1);
            expect(await impactPool.getUserDonationCount(await donor2.getAddress())).to.equal(1);
        });

        it("Should return correct user donation details", async function () {
            const donation = await impactPool.getUserDonation(await donor1.getAddress(), 0);
            expect(donation.amount).to.equal(DONATION_AMOUNT);
            expect(donation.certificateIssued).to.be.false;
        });

        it("Should revert for invalid donation index", async function () {
            await expect(impactPool.getUserDonation(await donor1.getAddress(), 10))
                .to.be.revertedWith("Invalid index");
        });

        it("Should return correct charity details", async function () {
            const charity = await impactPool.getCharity(0);
            expect(charity.name).to.equal("The Giving Block");
            expect(charity.isActive).to.be.true;
            expect(charity.weight).to.equal(40);
        });

        it("Should revert for invalid charity ID", async function () {
            await expect(impactPool.getCharity(99))
                .to.be.revertedWith("Invalid charity ID");
        });
    });

    describe("Certificate Contract Integration", function () {
        beforeEach(async function () {
            await impactPool.connect(donor1).donate(ethers.parseEther("50"));
            await impactPool.connect(donor2).donate(ethers.parseEther("75"));
        });

        it("Should allow multiple users to get certificates", async function () {
            await impactPool.connect(donor1).issueCertificate(0);
            await impactPool.connect(donor2).issueCertificate(0);

            const donor1Certs = await certificateContract.getUserCertificates(await donor1.getAddress());
            const donor2Certs = await certificateContract.getUserCertificates(await donor2.getAddress());

            expect(donor1Certs.length).to.equal(1);
            expect(donor2Certs.length).to.equal(1);
            expect(donor1Certs[0]).to.equal(0);
            expect(donor2Certs[0]).to.equal(1);
        });

        it("Should track certificates per user correctly", async function () {
            await impactPool.connect(donor1).issueCertificate(0);
            await impactPool.connect(donor1).donate(ethers.parseEther("100"));
            await impactPool.connect(donor1).issueCertificate(1);

            const userCerts = await certificateContract.getUserCertificates(await donor1.getAddress());
            expect(userCerts.length).to.equal(2);

            const balance = await certificateContract.balanceOf(await donor1.getAddress());
            expect(balance).to.equal(2);
        });

        it("Should retrieve correct certificate data", async function () {
            await impactPool.connect(donor1).issueCertificate(0);

            const cert = await certificateContract.getCertificate(0);
            expect(cert.id).to.equal(0);
            expect(cert.donor).to.equal(await donor1.getAddress());
            expect(cert.amount).to.equal(ethers.parseEther("50"));
            expect(cert.projectName).to.equal("Impact Pool Contribution");
        });
    });

    describe("Complex Scenarios", function () {
        it("Should handle multiple users donating, distributing, and getting certificates", async function () {
            await impactPool.connect(donor1).donate(ethers.parseEther("500"));
            await impactPool.connect(donor2).donate(ethers.parseEther("300"));

            const totalBefore = await impactPool.getTotalPoolBalance();
            expect(totalBefore).to.equal(ethers.parseEther("800"));

            await impactPool.distributeToCharities();

            const totalAfter = await impactPool.getTotalPoolBalance();
            expect(totalAfter).to.equal(ethers.parseEther("720"));

            await impactPool.connect(donor1).issueCertificate(0);
            await impactPool.connect(donor2).issueCertificate(0);

            const donor1Certs = await certificateContract.getUserCertificates(await donor1.getAddress());
            const donor2Certs = await certificateContract.getUserCertificates(await donor2.getAddress());

            expect(donor1Certs.length).to.equal(1);
            expect(donor2Certs.length).to.equal(1);
        });

        it("Should allow users to donate, get certificates, and continue donating", async function () {
            await impactPool.connect(donor1).donate(ethers.parseEther("50"));
            await impactPool.connect(donor1).issueCertificate(0);

            await impactPool.connect(donor1).donate(ethers.parseEther("100"));
            await impactPool.connect(donor1).issueCertificate(1);

            expect(await impactPool.getUserDonationCount(await donor1.getAddress())).to.equal(2);

            const donation0 = await impactPool.getUserDonation(await donor1.getAddress(), 0);
            const donation1 = await impactPool.getUserDonation(await donor1.getAddress(), 1);

            expect(donation0.certificateIssued).to.be.true;
            expect(donation1.certificateIssued).to.be.true;
            expect(donation1.certificateId).to.equal(1);

            const userCerts = await certificateContract.getUserCertificates(await donor1.getAddress());
            expect(userCerts.length).to.equal(2);
        });

        it("Should track charity progress towards target", async function () {
            await impactPool.connect(donor1).donate(ethers.parseEther("10000"));
            await impactPool.distributeToCharities();

            const charity0 = await impactPool.getCharity(0);
            expect(charity0.totalReceived).to.be.gt(0);
            expect(charity0.totalReceived).to.be.lt(charity0.targetAmount);
        });

        it("Should handle edge case of exactly minimum donation for certificate", async function () {
            await impactPool.connect(donor1).donate(ethers.parseEther("10"));
            await impactPool.connect(donor1).issueCertificate(0);

            const cert = await certificateContract.getCertificate(0);
            expect(cert.amount).to.equal(ethers.parseEther("10"));
        });
    });
});