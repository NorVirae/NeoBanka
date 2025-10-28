import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWallet } from './useWallet';
import { CONTRACTS, IMPACT_POOL_ABI, WHBAR_ABI } from '@/lib/contracts';

export interface ImpactPoolStats {
  userBalance: string;
  totalPoolBalance: string;
  userDonationRate: number;
  totalDonated: string;
  certificatesEarned: number;
  availableCertificates: ImpactCertificate[];
}

export interface ImpactCertificate {
  id: string;
  amount: string;
  timestamp: number;
  isMinted: boolean;
  tokenId?: string;
}

export interface DonationResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export const useImpactPool = () => {
  const { signer, account, isConnected } = useWallet();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ImpactPoolStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const getContracts = useCallback(() => {
    if (!signer) return null;

    const impactPoolContract = new ethers.Contract(
      CONTRACTS.IMPACT_POOL_ADDRESS,
      IMPACT_POOL_ABI,
      signer
    );

    return { impactPoolContract };
  }, [signer]);

  const fetchStats = useCallback(async () => {
    if (!signer || !account) return;

    setRefreshing(true);
    try {
      const contracts = getContracts();
      if (!contracts) return;

      const { impactPoolContract } = contracts;

      // Create WHBAR contract instance to get real token balance
      // Use provider instead of signer for view calls
      const provider = signer.provider;
      if (!provider) {
        console.error('No provider available');
        return;
      }

      const whbarContract = new ethers.Contract(
        CONTRACTS.WHBAR_ADDRESS,
        WHBAR_ABI,
        provider
      );

      // Wrap each call to guard against reverts on partially deployed contracts
      const [
        userBalance,
        realTotalPoolBalance,
        userDonationRate,
        totalDonated,
        donationCount
      ] = await Promise.all([
        (async () => {
          try { return await impactPoolContract.getUserBalance(account); } catch { return 0n; }
        })(),
        (async () => {
          try { return await whbarContract.balanceOf(CONTRACTS.IMPACT_POOL_ADDRESS); } catch { return 0n; }
        })(),
        (async () => {
          try { return await impactPoolContract.getUserDonationRate(account); } catch { return 0; }
        })(),
        (async () => {
          try { return await impactPoolContract.getUserTotalDonated(account); } catch { return 0n; }
        })(),
        (async () => {
          try { return await impactPoolContract.getUserDonationCount(account); } catch { return 0; }
        })(),
      ]);


      // Fetch individual donations to build certificates
      const formattedCertificates = [] as any[];
      const count = Math.min(Number(donationCount || 0), 10); // Limit to 10 most recent
      
      for (let i = 0; i < count; i++) {
        try {
          const donation = await impactPoolContract.getUserDonation(account, i);
          formattedCertificates.push({
            id: i.toString(),
            amount: ethers.formatEther(donation.amount),
            timestamp: Number(donation.timestamp),
            isMinted: donation.certificateIssued,
            tokenId: donation.certificateId?.toString()
          });
        } catch (error) {
          // Ignore individual donation fetch errors
        }
      }

      setStats({
        userBalance: ethers.formatEther(userBalance),
        totalPoolBalance: ethers.formatEther(realTotalPoolBalance),
        userDonationRate: Number(userDonationRate),
        totalDonated: ethers.formatEther(totalDonated),
        certificatesEarned: Number(donationCount),
        availableCertificates: formattedCertificates
      });
    } catch (error) {
      // Swallow errors to avoid crashing UI when contract not ready
      console.error('Error fetching impact pool stats:', error);
      setStats({
        userBalance: '0.0',
        totalPoolBalance: '0.0',
        userDonationRate: 0,
        totalDonated: '0.0',
        certificatesEarned: 0,
        availableCertificates: []
      });
    } finally {
      setRefreshing(false);
    }
  }, [signer, account, getContracts]);

  const updateDonationRate = useCallback(async (rate: number): Promise<DonationResult> => {
    if (!signer) {
      return { success: false, error: 'No signer available' };
    }

    try {
      setLoading(true);
      const contracts = getContracts();
      if (!contracts) return { success: false, error: 'Failed to get contracts' };

      const { impactPoolContract } = contracts;

      const tx = await impactPoolContract.setDonationRate(rate * 100, {
        gasLimit: 200000,
      });

      const receipt = await tx.wait();

      await fetchStats();

      return {
        success: true,
        txHash: tx.hash,
      };
    } catch (error: any) {
      console.error('Error updating donation rate:', error);
      let errorMessage = 'Unknown error occurred';

      if (error.reason) {
        errorMessage = error.reason;
      } else if (error.message) {
        errorMessage = error.message;
      }

      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [signer, getContracts, fetchStats]);

  const mintCertificate = useCallback(async (certificateId: string): Promise<DonationResult> => {
    if (!signer) {
      return { success: false, error: 'No signer available' };
    }

    try {
      setLoading(true);
      const contracts = getContracts();
      if (!contracts) return { success: false, error: 'Failed to get contracts' };

      const { impactPoolContract } = contracts;

      const tx = await impactPoolContract.mintCertificate(certificateId, {
        gasLimit: 300000,
      });

      const receipt = await tx.wait();

      await fetchStats();

      return {
        success: true,
        txHash: tx.hash,
      };
    } catch (error: any) {
      console.error('Error minting certificate:', error);
      let errorMessage = 'Unknown error occurred';

      if (error.reason) {
        errorMessage = error.reason;
      } else if (error.message) {
        errorMessage = error.message;
      }

      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [signer, getContracts, fetchStats]);

  const donateToPool = useCallback(async (amount: string): Promise<DonationResult> => {
    if (!signer) {
      return { success: false, error: 'No signer available' };
    }

    try {
      setLoading(true);
      const contracts = getContracts();
      if (!contracts) return { success: false, error: 'Failed to get contracts' };

      const { impactPoolContract } = contracts;
      const amountWei = ethers.parseEther(amount);

      // Create WHBAR contract instance
      const whbarContract = new ethers.Contract(
        CONTRACTS.WHBAR_ADDRESS,
        WHBAR_ABI,
        signer
      );

      // Check current allowance
      const currentAllowance = await whbarContract.allowance(
        await signer.getAddress(),
        CONTRACTS.IMPACT_POOL_ADDRESS
      );

      // If allowance is insufficient, request approval
      if (currentAllowance < amountWei) {
        const approveTx = await whbarContract.approve(
          CONTRACTS.IMPACT_POOL_ADDRESS,
          amountWei,
          { gasLimit: 100000 }
        );
        await approveTx.wait();
      }

      // Now call donate function (without value field)
      const tx = await impactPoolContract.donate(amountWei, {
        gasLimit: 300000,
      });

      const receipt = await tx.wait();

      await fetchStats();

      return {
        success: true,
        txHash: tx.hash,
      };
    } catch (error: any) {
      console.error('Error donating to pool:', error);
      let errorMessage = 'Unknown error occurred';

      if (error.reason) {
        errorMessage = error.reason;
      } else if (error.message) {
        errorMessage = error.message;
      }

      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [signer, getContracts, fetchStats]);

  const withdrawFromPool = useCallback(async (amount: string): Promise<DonationResult> => {
    if (!signer) {
      return { success: false, error: 'No signer available' };
    }

    try {
      setLoading(true);
      const contracts = getContracts();
      if (!contracts) return { success: false, error: 'Failed to get contracts' };

      const { impactPoolContract } = contracts;
      const amountWei = ethers.parseEther(amount);

      const tx = await impactPoolContract.withdraw(amountWei, {
        gasLimit: 250000,
      });

      const receipt = await tx.wait();

      await fetchStats();

      return {
        success: true,
        txHash: tx.hash,
      };
    } catch (error: any) {
      console.error('Error withdrawing from pool:', error);
      let errorMessage = 'Unknown error occurred';

      if (error.reason) {
        errorMessage = error.reason;
      } else if (error.message) {
        errorMessage = error.message;
      }

      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [signer, getContracts, fetchStats]);

  useEffect(() => {
    if (isConnected && account) {
      fetchStats();
    } else {
      setStats(null);
    }
  }, [isConnected, account, fetchStats]);

  return {
    stats,
    loading,
    refreshing,
    updateDonationRate,
    donateToPool,
    mintCertificate,
    withdrawFromPool,
    refreshStats: fetchStats,
  };
};