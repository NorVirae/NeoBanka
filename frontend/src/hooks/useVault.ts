// src/hooks/useVault.ts
import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWallet } from './useWallet';
import { CONTRACTS, VAULT_ABI, WHBAR_ABI, ERC20_ABI } from '@/lib/contracts';

export interface VaultStats {
  userShares: string;
  userBalance: string;
  totalAssets: string;
  totalSupply: string;
  sharePrice: string;
  availableAssets: string;
  minDeposit: string;
  isPaused: boolean;
  whbarBalance: string;
  whbarAllowance: string;
}

export interface DepositResult {
  success: boolean;
  txHash?: string;
  shares?: string;
  error?: string;
}

export interface WithdrawResult {
  success: boolean;
  txHash?: string;
  assets?: string;
  error?: string;
}

export interface ApprovalResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export const useVault = () => {
  const { signer, account, isConnected } = useWallet();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Create contract instances
  const getContracts = useCallback(() => {
    if (!signer) return null;
    
    const vaultContract = new ethers.Contract(
      CONTRACTS.VAULT_ADDRESS,
      VAULT_ABI,
      signer
    );
    
    const whbarContract = new ethers.Contract(
      CONTRACTS.WHBAR_ADDRESS,
      WHBAR_ABI,
      signer
    );

    return { vaultContract, whbarContract };
  }, [signer]);

  // Simplified fetch stats - only get essential data
  const fetchStats = useCallback(async () => {
    if (!account) return;

    setRefreshing(true);
    try {
      // Use same approach as quick test - direct provider calls
      if (!(window as any).ethereum) {
        console.error('No ethereum provider available');
        return;
      }
      
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      
      // Create minimal contracts for essential data only
      const vaultContract = new ethers.Contract(
        CONTRACTS.VAULT_ADDRESS,
        [
          "function totalAssets() external view returns (uint256)",
          "function getUserShareBalance(address user) external view returns (uint256)",
          "function getSharePrice() external view returns (uint256)"
        ],
        provider
      );
      
      // Resolve underlying asset from the vault
      const assetAddr: string = await new ethers.Contract(
        CONTRACTS.VAULT_ADDRESS,
        ["function asset() view returns (address)"] ,
        provider
      ).asset();
      const tokenContract = new ethers.Contract(
        assetAddr,
        ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)"],
        provider
      );

      // Get only the data that's actually displayed on the UI
      const totalAssets = await vaultContract.totalAssets();
      const userShares = await vaultContract.getUserShareBalance(account);
      const sharePrice = await vaultContract.getSharePrice();
      const whbarBalance = await tokenContract.balanceOf(account);
      const whbarAllowance = await tokenContract.allowance(account, CONTRACTS.VAULT_ADDRESS);
      

      setStats({
        userShares: ethers.formatEther(userShares),
        userBalance: ethers.formatEther(userShares), // Use shares as balance for now
        totalAssets: ethers.formatEther(totalAssets),
        totalSupply: "0", // Default values for non-essential data
        sharePrice: ethers.formatEther(sharePrice),
        availableAssets: ethers.formatEther(totalAssets), // Use totalAssets as fallback
        minDeposit: "1.0", // Default minimum (contract exposes minDeposit, can add later)
        isPaused: false, // Default not paused
        whbarBalance: ethers.formatEther(whbarBalance),
        whbarAllowance: ethers.formatEther(whbarAllowance),
      });
    } catch (error) {
      console.error('Error fetching vault stats:', error);
    } finally {
      setRefreshing(false);
    }
  }, [account]);

  // Approve underlying asset spending
  const approveWHBAR = useCallback(async (amount: string): Promise<ApprovalResult> => {
    if (!signer) {
      return { success: false, error: 'No signer available' };
    }

    try {
      setLoading(true);
      const contracts = getContracts();
      if (!contracts) return { success: false, error: 'Failed to get contracts' };
      const { vaultContract } = contracts;
      // Resolve vault underlying asset dynamically
      const assetAddr: string = await vaultContract.asset();
      const token = new ethers.Contract(assetAddr, ERC20_ABI, signer);
      const amountWei = ethers.parseEther(amount);
      const tx = await token.approve(CONTRACTS.VAULT_ADDRESS, amountWei);
      await tx.wait();

      // Refresh stats after approval
      await fetchStats();
      return { success: true, txHash: tx.hash };
    } catch (error: any) {
      console.error('Error approving WHBAR:', error);
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

  // Deposit to vault
  const deposit = useCallback(async (amount: string): Promise<DepositResult> => {
    if (!signer) {
      return { success: false, error: 'No signer available' };
    }

    try {
      setLoading(true);
      const contracts = getContracts();
      if (!contracts) return { success: false, error: 'Failed to get contracts' };

      const { vaultContract } = contracts;
      const amountWei = ethers.parseEther(amount);

      // Check if approval is needed
      if (stats) {
        const allowance = ethers.parseEther(stats.whbarAllowance);
        if (allowance < (amountWei)) {
          const approvalResult = await approveWHBAR(amount);
          if (!approvalResult.success) {
            return { success: false, error: approvalResult.error || 'Failed to approve WHBAR' };
          }
        }
      }

      // Execute deposit
      // Simulate first to catch minDeposit or other reverts
      try {
        await vaultContract.callStatic.depositLiquidity(amountWei);
      } catch (e: any) {
        return { success: false, error: e?.message || 'Deposit simulation failed' };
      }
      const tx = await vaultContract.depositLiquidity(amountWei, {
        gasLimit: 300000, // Set reasonable gas limit
      });

      const receipt = await tx.wait();

      // Parse events to get shares received
      let sharesReceived = '0';
      if (receipt.events) {
        const depositEvent = receipt.events.find((e: any) => e.event === 'LiquidityAdded');
        if (depositEvent) {
          sharesReceived = ethers.formatEther(depositEvent.args.shares);
        }
      }

      // Refresh stats
      await fetchStats();

      return {
        success: true,
        txHash: tx.hash,
        shares: sharesReceived,
      };
    } catch (error: any) {
      console.error('Error depositing:', error);
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
  }, [signer, getContracts, stats, approveWHBAR, fetchStats]);

  // Withdraw from vault
  const withdraw = useCallback(async (impactAllocationBps: number = 0): Promise<WithdrawResult> => {
    if (!signer) {
      return { success: false, error: 'No signer available' };
    }

    try {
      setLoading(true);
      const contracts = getContracts();
      if (!contracts) return { success: false, error: 'Failed to get contracts' };

      const { vaultContract } = contracts;

      // Execute withdraw with impact allocation
      const tx = await vaultContract.withdrawProfits(impactAllocationBps, {
        gasLimit: 300000, // Set reasonable gas limit
      });

      const receipt = await tx.wait();

      // Parse events to get assets received
      let assetsReceived = '0';
      if (receipt.events) {
        const withdrawEvent = receipt.events.find((e: any) => e.event === 'LiquidityRemoved');
        if (withdrawEvent) {
          assetsReceived = ethers.formatEther(withdrawEvent.args.assets);
        }
      }

      // Refresh stats
      await fetchStats();

      return {
        success: true,
        txHash: tx.hash,
        assets: assetsReceived,
      };
    } catch (error: any) {
      console.error('Error withdrawing:', error);
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

  // Auto-fetch stats when wallet connects
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
    deposit,
    withdraw,
    approveWHBAR,
    refreshStats: fetchStats,
  };
};