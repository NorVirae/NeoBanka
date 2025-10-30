// src/hooks/useWallet.ts
import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { HEDERA_TESTNET } from '@/lib/contracts';

declare global {
  interface Window {
    ethereum?: any;
  }
}

export interface WalletState {
  account: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: number | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  isNetworkSwitching: boolean;
}

export const useWallet = () => {
  const [state, setState] = useState<WalletState>({
    account: null,
    isConnected: false,
    isConnecting: false,
    chainId: null,
    provider: null,
    signer: null,
    isNetworkSwitching: false,
  });

  // Check if wallet is available
  const isWalletAvailable = () => {
    return typeof window !== 'undefined' && 
           window.ethereum && 
           window.ethereum.request;
  };

  const forceSwitchToHederaTestnet = useCallback(async (): Promise<boolean> => {
    if (!isWalletAvailable()) return false;

    setState(prev => ({ ...prev, isNetworkSwitching: true }));

    const hederaConfig = {
      chainId: `0x${HEDERA_TESTNET.chainId.toString(16)}`,
      chainName: HEDERA_TESTNET.chainName,
      nativeCurrency: HEDERA_TESTNET.nativeCurrency,
      rpcUrls: HEDERA_TESTNET.rpcUrls,
      blockExplorerUrls: HEDERA_TESTNET.blockExplorerUrls,
    };

    try {
      // First, try to switch to existing network
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hederaConfig.chainId }],
      });
      
      setState(prev => ({ ...prev, isNetworkSwitching: false }));
      return true;
    } catch (switchError: any) {
      console.log('Switch failed, attempting to add network:', switchError);
      
      // If network doesn't exist (error 4902), add it
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [hederaConfig],
          });
          
          // Wait for network to be added, then switch
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: hederaConfig.chainId }],
          });
          
          setState(prev => ({ ...prev, isNetworkSwitching: false }));
          return true;
        } catch (addError: any) {
          console.error('Error adding Hedera testnet:', addError);
          setState(prev => ({ ...prev, isNetworkSwitching: false }));

          if (addError.code === 4001) {
            throw new Error('User rejected adding Hedera Testnet. This app requires Hedera Testnet to function.');
          }
          throw new Error(`Failed to add Hedera Testnet: ${addError.message}`);
        }
      } else if (switchError.code === 4001) {
        setState(prev => ({ ...prev, isNetworkSwitching: false }));
        throw new Error('User rejected network switch. This app requires Hedera Testnet to function.');
      } else {
        setState(prev => ({ ...prev, isNetworkSwitching: false }));
        throw new Error(`Failed to switch to Hedera Testnet: ${switchError.message}`);
      }
    }
  }, []);

  // Enhanced connection with mandatory network switching
  const connect = useCallback(async () => {
    if (!isWalletAvailable()) {
      throw new Error('No Web3 wallet detected. Please install MetaMask or another Web3 wallet.');
    }

    setState(prev => ({ ...prev, isConnecting: true }));

    try {
      // Step 1: Request account access
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts available. Please unlock your wallet.');
      }

      // Step 2: Check current network
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChainIdNum = parseInt(currentChainId, 16);

      // Step 3: Force switch to Hedera Testnet if not already on it
      if (currentChainIdNum !== HEDERA_TESTNET.chainId) {
        console.log(`Wrong network detected (${currentChainIdNum}), forcing switch to Hedera Testnet...`);

        try {
          await forceSwitchToHederaTestnet();
        } catch (networkError) {
          setState(prev => ({ ...prev, isConnecting: false }));
          throw networkError;
        }

        // Wait for network switch to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Step 4: Verify we're on correct network
      const finalChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const finalChainIdNum = parseInt(finalChainId, 16);

      if (finalChainIdNum !== HEDERA_TESTNET.chainId) {
        setState(prev => ({ ...prev, isConnecting: false }));
        throw new Error(`Failed to connect to Hedera Testnet. Current network: ${finalChainIdNum}, Required: ${HEDERA_TESTNET.chainId}`);
      }

      // Step 5: Initialize provider and signer on correct network
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      
      // Double-check network from provider
      if (Number(network.chainId) !== HEDERA_TESTNET.chainId) {
        setState(prev => ({ ...prev, isConnecting: false }));
        throw new Error(`Network mismatch after connection. Expected ${HEDERA_TESTNET.chainId}, got ${Number(network.chainId)}`);
      }

      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      // Step 6: Update state with successful connection
      setState({
        account: address,
        isConnected: true,
        isConnecting: false,
        chainId: HEDERA_TESTNET.chainId,
        provider,
        signer,
        isNetworkSwitching: false,
      });

      console.log('Successfully connected to Hedera Testnet:', {
        address,
        chainId: HEDERA_TESTNET.chainId,
        network: network.name
      });

    } catch (error: any) {
      console.error('Connection error:', error);
      setState(prev => ({
        ...prev,
        isConnecting: false,
        isNetworkSwitching: false,
        account: null,
        isConnected: false,
        provider: null,
        signer: null
      }));
      
      // Re-throw with better error messages
      if (error.code === 4001) {
        throw new Error('Connection rejected by user. Please approve the connection to continue.');
      } else if (error.code === -32002) {
        throw new Error('Connection request already pending. Please check your wallet.');
      } else if (error.message) {
        throw error;
      } else {
        throw new Error(`Connection failed: ${error.toString()}`);
      }
    }
  }, [forceSwitchToHederaTestnet]);

  // Check if already connected and on correct network
  const checkConnection = useCallback(async () => {
    if (!isWalletAvailable()) return;

    try {
      const accounts = await window.ethereum.request({ 
        method: 'eth_accounts' 
      });

      if (accounts && accounts.length > 0) {
        const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
        const currentChainIdNum = parseInt(currentChainId, 16);
        // Restore connection regardless of chain to support cross-chain flows
        const provider = new ethers.BrowserProvider(window.ethereum);
        const network = await provider.getNetwork();
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        setState({
          account: address,
          isConnected: true,
          isConnecting: false,
          chainId: Number(network.chainId),
          provider,
          signer,
          isNetworkSwitching: false,
        });
      }
    } catch (error) {
      console.error('Error checking connection:', error);
      setState(prev => ({
        ...prev,
        isConnecting: false,
        isConnected: false,
        isNetworkSwitching: false,
      }));
    }
  }, []);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    setState({
      account: null,
      isConnected: false,
      isConnecting: false,
      chainId: null,
      provider: null,
      signer: null,
      isNetworkSwitching: false,
    });
  }, []);

  // Handle network switches - force back to Hedera if user switches away
  const handleChainChanged = useCallback(async (chainId: string) => {
    console.log('Chain changed to:', chainId);
    const newChainId = parseInt(chainId, 16);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setState(prev => ({
        ...prev,
        chainId: newChainId,
        provider,
        signer,
        account: address,
        isConnected: true,
      }));
    } catch (error) {
      console.error('Error handling chain change:', error);
      disconnect();
    }
  }, [disconnect]);

  // Handle account changes
  const handleAccountsChanged = useCallback(async (accounts: string[]) => {
    console.log('Accounts changed:', accounts);
    
    if (!accounts || accounts.length === 0) {
      disconnect();
    } else {
      // Check if still on Hedera testnet
      try {
        const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
        const currentChainIdNum = parseInt(currentChainId, 16);
        
        if (currentChainIdNum === HEDERA_TESTNET.chainId) {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();
          const address = await signer.getAddress();
          
          setState(prev => ({ 
            ...prev, 
            account: address,
            provider,
            signer,
            isConnected: true
          }));
        } else {
          // Wrong network, disconnect
          disconnect();
        }
      } catch (error) {
        console.error('Error handling account change:', error);
        disconnect();
      }
    }
  }, [disconnect]);

  // Setup event listeners
  useEffect(() => {
    if (!isWalletAvailable()) return;

    const safeAddEventListener = (event: string, handler: (...args: any[]) => void) => {
      try {
        if (window.ethereum.on) {
          window.ethereum.on(event, handler);
        }
      } catch (error) {
        console.error(`Error adding ${event} listener:`, error);
      }
    };

    safeAddEventListener('accountsChanged', handleAccountsChanged);
    safeAddEventListener('chainChanged', handleChainChanged);

    // Check connection on mount
    const timeoutId = setTimeout(() => {
      checkConnection();
    }, 500);

    return () => {
      clearTimeout(timeoutId);
      if (window.ethereum && window.ethereum.removeListener) {
        try {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
          window.ethereum.removeListener('chainChanged', handleChainChanged);
        } catch (error) {
          console.error('Error removing event listeners:', error);
        }
      }
    };
  }, [checkConnection, handleAccountsChanged, handleChainChanged]);

  return {
    ...state,
    connect,
    disconnect,
    switchToHederaTestnet: forceSwitchToHederaTestnet,
    isOnHederaTestnet: state.chainId === HEDERA_TESTNET.chainId,
    // Convenience method to check if user needs to switch networks
    needsNetworkSwitch: state.isConnected && state.chainId !== HEDERA_TESTNET.chainId,
  };
};