import { useState } from 'react';
import { ethers } from 'ethers';
import { useWallet } from './useWallet';
import { orderbookApi, OrderData } from '../lib/api';
import { ERC20_ABI, SETTLEMENT_ABI, CONTRACTS, TOKEN_DECIMALS, HEDERA_TESTNET } from '../lib/contracts';

interface TradeState {
  loading: boolean;
  error: string | null;
  orderStatus: 'idle' | 'approving' | 'depositing' | 'submitting' | 'settling' | 'completed' | 'failed';
}

interface EscrowBalance {
  total: bigint;
  available: bigint;
  locked: bigint;
}

export interface OrderParams {
  baseAsset: string;
  quoteAsset: string;
  price: string;
  quantity: string;
  side: 'bid' | 'ask';
  fromNetwork: string;
  toNetwork: string;
  receiveWallet: string;
  type?: 'limit' | 'market';
}

export interface TradeResult {
  success: boolean;
  orderId: string;
  trades: Array<{
    id: string;
    price: string;
    quantity: string;
    timestamp: number;
  }>;
}

export function useTrade() {
  const [state, setState] = useState<TradeState>({
    loading: false,
    error: null,
    orderStatus: 'idle'
  });

  const { provider, account, signer } = useWallet();
  const settlementAddress = CONTRACTS.SETTLEMENT_ADDRESS;
  
  // Ensure wallet has enough HBAR for gas
  const ensureSufficientHbar = async (minimumHbar: string = '0.001') => {
    if (!provider || !account) throw new Error('Wallet not connected');
    const balance = await provider.getBalance(account);
    console.log('BalancesdnsdJSHDD:  ', balance);
    const minWei = ethers.parseEther(minimumHbar);
    if (balance < minWei) {
      throw new Error('INSUFFICIENT_PAYER_BALANCE: Not enough HBAR to cover gas fees');
    }
  };
  
  // Decode Hedera provider error messages (hex ASCII in data)
  const decodeHexAscii = (hex: string): string | null => {
    if (!hex || typeof hex !== 'string') return null;
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (clean.length % 2 !== 0) return null;
    try {
      const bytes = clean.match(/.{1,2}/g) || [];
      const chars = bytes.map(b => String.fromCharCode(parseInt(b, 16)));
      const text = chars.join('');
      return text && /[A-Z_]/.test(text) ? text : null;
    } catch {
      return null;
    }
  };

  const extractHederaErrorMessage = (error: any): string | null => {
    const candidates: any[] = [
      error?.data,
      error?.error?.data,
      error?.value?.data,
      error?.info?.error?.data,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.startsWith('0x')) {
        const decoded = decodeHexAscii(c);
        if (decoded) return decoded;
      }
    }
    return null;
  };
  
  const getSettlementContract = async () => {
    if (!signer || !account) throw new Error('Wallet not connected');
    return new ethers.Contract(settlementAddress, SETTLEMENT_ABI, signer);
  };

  const getTokenContract = async (tokenAddress: string) => {
    if (!signer) throw new Error('Wallet not connected');
    return new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  };

  // Safely get token decimals with fallbacks to known values
  const getTokenDecimals = async (tokenAddress: string): Promise<number> => {
    try {
      const token = await getTokenContract(tokenAddress);
      const d = await token.decimals();
      return Number(d);
    } catch {
      const fallback = TOKEN_DECIMALS[tokenAddress];
      return fallback !== undefined ? fallback : 18;
    }
  };

  // Ensure we are on Hedera Testnet
  const ensureHederaNetwork = async () => {
    if (!provider) throw new Error('Wallet not connected');
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== HEDERA_TESTNET.chainId) {
      throw new Error('Wrong network: please switch to Hedera Testnet');
    }
  };

  // Ensure the token address is a deployed contract on this network
  const ensureErc20Contract = async (tokenAddress: string) => {
    if (!provider) throw new Error('Wallet not connected');
    const code = await provider.getCode(tokenAddress);
    if (!code || code === '0x') {
      throw new Error('Token contract not found on current network. Verify token address for Hedera Testnet');
    }
  };

  // Get token address based on asset name
  const getTokenAddress = (asset: string): string => {
    const upperAsset = asset.toUpperCase();
    if (upperAsset === 'HBAR' || upperAsset === 'WHBAR') {
      return CONTRACTS.HBAR_TOKEN;
    } else if (upperAsset === 'USDT') {
      return CONTRACTS.USDT_TOKEN;
    }
    throw new Error(`Unknown asset: ${asset}`);
  };

  const checkAndApproveToken = async (
    tokenAddress: string,
    amount: string | number
  ): Promise<boolean> => {
    if (!signer || !account) throw new Error('Wallet not connected');

    try {
      await ensureHederaNetwork();
      await ensureSufficientHbar();
      await ensureErc20Contract(tokenAddress);
      const token = await getTokenContract(tokenAddress);
      const decimals = await getTokenDecimals(tokenAddress);
      const amountStr = typeof amount === 'number' ? amount.toString() : amount;
      const requiredAmount = ethers.parseUnits(amountStr, decimals);

      let hadAllowanceInfo = false;
      try {
        const currentAllowance: bigint = await token.allowance(account, settlementAddress);
        hadAllowanceInfo = true;
        if (currentAllowance >= requiredAmount) {
          return true;
        }

        setState(prev => ({ ...prev, orderStatus: 'approving' }));
        if (currentAllowance > 0n) {
          try {
            const resetTx = await token.approve(settlementAddress, 0, { gasLimit: 100000, gasPrice: ethers.parseUnits('1', 'gwei') });
            await resetTx.wait();
          } catch (e: any) {
            // Retry without explicit gasPrice
            const resetTx = await token.approve(settlementAddress, 0, { gasLimit: 100000 });
            await resetTx.wait();
          }
        }
        try {
          const approveTx = await token.approve(settlementAddress, requiredAmount, { gasLimit: 150000, gasPrice: ethers.parseUnits('1', 'gwei') });
          await approveTx.wait();
        } catch (e: any) {
          // Retry without explicit gasPrice if RPC rejects
          const approveTx = await token.approve(settlementAddress, requiredAmount, { gasLimit: 150000 });
          await approveTx.wait();
        }
        return true;
      } catch (allowanceErr) {
        console.warn('allowance() call failed; falling back to blind approval flow', allowanceErr);
        // Fallback: attempt zero-approve then max-approve without knowing current allowance
        setState(prev => ({ ...prev, orderStatus: 'approving' }));
        try {
          try {
            const resetTx = await token.approve(settlementAddress, 0, { gasLimit: 100000, gasPrice: ethers.parseUnits('1', 'gwei') });
            await resetTx.wait();
          } catch {
            const resetTx = await token.approve(settlementAddress, 0, { gasLimit: 100000 });
            await resetTx.wait();
          }
        } catch (resetErr) {
          // It's OK if reset fails when current allowance is already zero; continue to max-approve
          console.warn('zero-approve failed or unnecessary, continuing to max-approve', resetErr);
        }
        try {
          const approveTx = await token.approve(settlementAddress, requiredAmount, { gasLimit: 150000, gasPrice: ethers.parseUnits('1', 'gwei') });
          await approveTx.wait();
        } catch {
          const approveTx = await token.approve(settlementAddress, requiredAmount, { gasLimit: 150000 });
          await approveTx.wait();
        }
        return true;
      }
    } catch (error) {
      console.error('Approval error:', error);
      const hederaMsg = extractHederaErrorMessage(error);
      if (hederaMsg) throw new Error(hederaMsg);
      if (typeof (error as any)?.message === 'string') throw new Error((error as any).message);
      throw error as any;
    }
  };

  const submitOrder = async (orderData: OrderParams): Promise<TradeResult> => {
    if (!provider || !account) {
      throw new Error('Wallet not connected');
    }

    setState(prev => ({ ...prev, loading: true, error: null, orderStatus: 'idle' }));

    try {
      // Get token addresses
      const baseTokenAddress = getTokenAddress(orderData.baseAsset);
      const quoteTokenAddress = getTokenAddress(orderData.quoteAsset);
      await ensureSufficientHbar();
      
      // Normalize numeric fields to strings for safe unit parsing
      const priceStr: string = typeof (orderData as any).price === 'number' ? String((orderData as any).price) : String((orderData as any).price);
      const qtyStr: string = typeof (orderData as any).quantity === 'number' ? String((orderData as any).quantity) : String((orderData as any).quantity);

      // Determine which token and amount is needed for this order
      const tokenToUse = orderData.side === 'ask' ? baseTokenAddress : quoteTokenAddress;
      const amountToUse = orderData.side === 'ask' ? 
        qtyStr : 
        (Number(qtyStr) * Number(priceStr)).toFixed(18);

      console.log('Order details:', {
        side: orderData.side,
        token: tokenToUse,
        amount: amountToUse
      });

      // Step 1: Check and approve token to settlement contract
      console.log('Step 1: Checking and approving token...');
      await checkAndApproveToken(tokenToUse, amountToUse);

      // Step 2: Check escrow balance
      console.log('Step 2: Checking escrow balance...');
      const escrowBalance = await checkEscrowBalance(tokenToUse);
      const decimals = await getTokenDecimals(tokenToUse);
      const requiredAmount = ethers.parseUnits(amountToUse, decimals);

      console.log('Escrow balance:', {
        available: ethers.formatUnits(escrowBalance.available, decimals),
        required: amountToUse
      });

      // Step 3: Deposit to escrow if needed
      if (escrowBalance.available < requiredAmount) {
        const needed = requiredAmount - escrowBalance.available;
        const neededFormatted = ethers.formatUnits(needed, decimals);
        console.log(`Step 3: Depositing ${neededFormatted} to escrow...`);
        await depositToEscrow(tokenToUse, neededFormatted);
      } else {
        console.log('Step 3: Sufficient escrow balance, skipping deposit');
      }

      // Step 4: Create and sign order
      console.log('Step 4: Creating and signing order...');
      const currentChainId = Number((await provider.getNetwork()).chainId);
      const timestamp = Math.floor(Date.now() / 1000);
      
      // Submit to orderbook without signatures (backend will handle signing)
      setState(prev => ({ ...prev, orderStatus: 'submitting' }));
      
      const apiOrderData: OrderData = {
        account,
        // Matching engine expects asset symbols; backend maps to token addresses internally
        baseAsset: orderData.baseAsset,
        quoteAsset: orderData.quoteAsset,
        price: priceStr,
        quantity: qtyStr,
        side: orderData.side,
        // @ts-ignore include order type if provided
        type: (orderData as any).type || 'limit',
        signature1: '', // Backend will handle signing
        fromNetwork: orderData.fromNetwork,
        toNetwork: orderData.toNetwork,
        // Also include snake_case names expected by the backend
        // @ts-ignore - these fields are accepted by backend and sent as-is
        from_network: orderData.fromNetwork,
        // @ts-ignore
        to_network: orderData.toNetwork,
        receiveWallet: orderData.receiveWallet,
        privateKey: '', // Not exposing private keys to backend
      };

      console.log('Step 5: Submitting order to orderbook...');
      const response = await orderbookApi.registerOrder(apiOrderData);

      if (response.status_code === 1) {
        console.log('Order submitted successfully!');
        setState(prev => ({ ...prev, orderStatus: 'completed', loading: false }));
        return {
          success: true,
          orderId: response.order.orderId,
          trades: response.order.trades || []
        };
      } else {
        // Surface backend validation details when available
        const details = (response as any)?.errors?.join?.(', ') || '';
        const extra = (response as any)?.validation_details ? ` | details: ${JSON.stringify((response as any).validation_details)}` : '';
        throw new Error(`${response.message || 'Order submission failed'} ${details}${extra}`.trim());
      }

    } catch (error) {
      console.error('Trade error:', error);
      const hederaMsg = extractHederaErrorMessage(error);
      const message = hederaMsg || (typeof (error as any)?.message === 'string' ? (error as any).message : 'Unknown error occurred');
      setState(prev => ({
        ...prev,
        loading: false,
        error: message,
        orderStatus: 'failed'
      }));
      throw new Error(message);
    }
  };

  const checkBalance = async (asset: string, amount: string): Promise<boolean> => {
    if (!provider || !account) return false;

    try {
      const tokenAddress = getTokenAddress(asset);
      const token = await getTokenContract(tokenAddress);
      const decimals = await token.decimals();
      const balance = await token.balanceOf(account);
      const required = ethers.parseUnits(amount, decimals);
      return balance >= required;
    } catch (error) {
      console.error('Balance check error:', error);
      return false;
    }
  };

  const checkEscrowBalance = async (tokenAddress: string): Promise<EscrowBalance> => {
    if (!provider || !account) throw new Error('Wallet not connected');

    try {
      const settlement = await getSettlementContract();
      const [total, available, locked] = await settlement.checkEscrowBalance(account, tokenAddress);
      return { total, available, locked };
    } catch (error) {
      console.error('Escrow balance check error:', error);
      throw error;
    }
  };

  const depositToEscrow = async (tokenAddress: string, amount: string): Promise<void> => {
    if (!signer || !account) throw new Error('Wallet not connected');

    setState(prev => ({ ...prev, loading: true, orderStatus: 'depositing' }));
    
    try {
      await ensureHederaNetwork();
      await ensureSufficientHbar();
      await ensureErc20Contract(tokenAddress);
      const decimals = await getTokenDecimals(tokenAddress);
      const parsedAmount = ethers.parseUnits(amount, decimals);

      console.log(`Depositing ${amount} tokens to escrow...`);

      // Ensure unlimited allowance before depositing
      await checkAndApproveToken(tokenAddress, amount);

      // Then deposit to escrow with simulate + retry
      const settlement = await getSettlementContract();
      console.log('Depositing to escrow contract...');
      try {
        // Simulate to surface revert reasons early (ethers v6)
        const depositFn: any = settlement.getFunction('depositToEscrow');
        await depositFn.staticCall(tokenAddress, parsedAmount);
      } catch (simErr) {
        const hederaMsg = extractHederaErrorMessage(simErr);
        if (hederaMsg) throw new Error(hederaMsg);
      }
      try {
        const depositTx = await settlement.depositToEscrow(tokenAddress, parsedAmount, { gasLimit: 300000, gasPrice: ethers.parseUnits('1', 'gwei') });
        await depositTx.wait();
      } catch (e: any) {
        const depositTx = await settlement.depositToEscrow(tokenAddress, parsedAmount, { gasLimit: 300000 });
        await depositTx.wait();
      }
      console.log('Escrow deposit complete');

      setState(prev => ({ ...prev, loading: false, orderStatus: 'completed' }));
    } catch (error) {
      console.error('Escrow deposit error:', error);
      const hederaMsg = extractHederaErrorMessage(error);
      const message = hederaMsg || (typeof (error as any)?.message === 'string' ? (error as any).message : 'Failed to deposit to escrow');
      setState(prev => ({
        ...prev,
        loading: false,
        error: message,
        orderStatus: 'failed'
      }));
      throw new Error(message);
    }
  };

  const withdrawFromEscrow = async (tokenAddress: string, amount: string): Promise<void> => {
    if (!signer || !account) throw new Error('Wallet not connected');

    setState(prev => ({ ...prev, loading: true }));
    
    try {
      const decimals = await getTokenDecimals(tokenAddress);
      const parsedAmount = ethers.parseUnits(amount, decimals);

      const settlement = await getSettlementContract();
      const withdrawTx = await settlement.withdrawFromEscrow(tokenAddress, parsedAmount, { gasLimit: 250000, gasPrice: ethers.parseUnits('1', 'gwei') });
      await withdrawTx.wait();

      setState(prev => ({ ...prev, loading: false }));
    } catch (error) {
      console.error('Escrow withdrawal error:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to withdraw from escrow'
      }));
      throw error;
    }
  };

  const getUserNonce = async (tokenAddress: string): Promise<bigint> => {
    if (!provider || !account) throw new Error('Wallet not connected');
    const settlement = await getSettlementContract();
    return await settlement.getUserNonce(account, tokenAddress);
  };

  return {
    ...state,
    submitOrder,
    checkBalance,
    checkAndApproveToken,
    // Escrow management functions
    checkEscrowBalance,
    depositToEscrow,
    withdrawFromEscrow,
    getUserNonce,
  };
}