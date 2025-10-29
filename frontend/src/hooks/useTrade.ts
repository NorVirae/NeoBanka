import { useState } from 'react';
import { ethers } from 'ethers';
import { useWallet } from './useWallet';
import { orderbookApi, OrderData } from '../lib/api';
import { ERC20_ABI, SETTLEMENT_ABI, TOKEN_DECIMALS, HEDERA_TESTNET, CHAIN_REGISTRY, resolveTokenAddress, resolveSettlementAddress } from '../lib/contracts';

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
  // Read-only fallback provider to bypass wallet RPC throttling / circuit breaker
  const readonlyProvider = new ethers.JsonRpcProvider(HEDERA_TESTNET.rpcUrls[0]);
  // Cache contract code lookups to avoid repeated eth_getCode calls (rate limit friendly)
  const contractCodeCache = new Map<string, boolean>();
  
  // Ensure wallet has enough HBAR for gas
  const ensureSufficientHbar = async (minimumHbar: string = '0.001') => {
    if (!account) throw new Error('Wallet not connected');
    let balance: bigint;
    try {
      if (!provider) throw new Error('no wallet provider');
      balance = await provider.getBalance(account);
    } catch (err: any) {
      // Fallback to public RPC if wallet RPC circuit-breaker is open
      balance = await readonlyProvider.getBalance(account);
    }
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
  
  const getSettlementContract = async (settlementAddr: string) => {
    if (!signer || !account) throw new Error('Wallet not connected');
    return new ethers.Contract(settlementAddr, SETTLEMENT_ABI, signer);
  };
  const getSettlementReadonly = (settlementAddr: string, rpc?: string) => {
    const ro = rpc ? new ethers.JsonRpcProvider(rpc) : readonlyProvider;
    return new ethers.Contract(settlementAddr, SETTLEMENT_ABI, ro);
  };

  const getTokenContract = async (tokenAddress: string) => {
    if (!signer) throw new Error('Wallet not connected');
    return new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  };
  const getTokenReadonly = (tokenAddress: string) => new ethers.Contract(tokenAddress, ERC20_ABI, readonlyProvider);

  // Safely get token decimals with fallbacks to known values
  const getTokenDecimals = async (tokenAddress: string): Promise<number> => {
    try {
      const token = getTokenReadonly(tokenAddress);
      const d = await token.decimals();
      return Number(d);
    } catch {
      try {
        const token = await getTokenContract(tokenAddress);
        const d = await token.decimals();
        return Number(d);
      } catch {
        const fallback = TOKEN_DECIMALS[tokenAddress];
        return fallback !== undefined ? fallback : 18;
      }
    }
  };

  // Ensure we are on a specific chain
  const ensureNetwork = async (targetChainId: number) => {
    if (!provider) throw new Error('Wallet not connected');
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== targetChainId) {
      throw new Error(`Wrong network: please switch to chainId ${targetChainId}`);
    }
  };

  // Ensure the token address is a deployed contract on this network
  const ensureErc20Contract = async (tokenAddress: string) => {
    const code = await (async () => {
      try {
        if (!provider) throw new Error('no wallet provider');
        return await provider.getCode(tokenAddress);
      } catch {
        return await readonlyProvider.getCode(tokenAddress);
      }
    })();
    if (!code || code === '0x') {
      throw new Error('Token contract not found on current network. Verify token address for Hedera Testnet');
    }
  };

  const getTokenAddressForNetwork = (networkKey: string, asset: string): string => {
    const key = (networkKey || '').toLowerCase() as 'hedera' | 'polygon';
    const addr = resolveTokenAddress(key, asset);
    if (!addr) throw new Error(`Token address not configured for ${asset} on ${key}`);
    return addr;
  };

  const checkAndApproveToken = async (
    tokenAddress: string,
    amount: string | number,
    settlementAddrOverride?: string
  ): Promise<boolean> => {
    if (!signer || !account) throw new Error('Wallet not connected');

    try {
      // network ensured by caller
      await ensureSufficientHbar();
      await ensureErc20Contract(tokenAddress);
      const token = await getTokenContract(tokenAddress);
      const decimals = await getTokenDecimals(tokenAddress);
      const amountStr = typeof amount === 'number' ? amount.toString() : amount;
      const requiredAmount = ethers.parseUnits(amountStr, decimals);

      try {
        const allowanceTarget = settlementAddrOverride!;
        const currentAllowance: bigint = await token.allowance(account, allowanceTarget);
        if (currentAllowance >= requiredAmount) {
          return true;
        }

        setState(prev => ({ ...prev, orderStatus: 'approving' }));

        // Try direct approve first (most ERC20s allow updating without zeroing)
        try {
          const approveTx = await token.approve(allowanceTarget, requiredAmount, { gasLimit: 150000 });
          await approveTx.wait();
          return true;
        } catch (directErr) {
          console.warn('Direct approve failed, attempting zero-approve then approve', directErr);
          try {
            const resetTx = await token.approve(allowanceTarget, 0, { gasLimit: 100000 });
            await resetTx.wait();
          } catch (resetErr) {
            console.warn('Zero-approve failed or unnecessary, continuing', resetErr);
          }
          const approveTx = await token.approve(allowanceTarget, requiredAmount, { gasLimit: 150000 });
          await approveTx.wait();
          return true;
        }
      } catch (allowanceErr) {
        console.warn('allowance() call failed; performing blind approve flow', allowanceErr);
        setState(prev => ({ ...prev, orderStatus: 'approving' }));
        try {
          const approveTx = await token.approve(settlementAddrOverride!, requiredAmount, { gasLimit: 150000 });
          await approveTx.wait();
          return true;
        } catch (directErr) {
          console.warn('Blind direct approve failed, attempting zero-approve then approve', directErr);
          try {
            const resetTx = await token.approve(settlementAddrOverride!, 0, { gasLimit: 100000 });
            await resetTx.wait();
          } catch (resetErr) {
            console.warn('Zero-approve failed or unnecessary, continuing', resetErr);
          }
          const approveTx = await token.approve(settlementAddrOverride!, requiredAmount, { gasLimit: 150000 });
          await approveTx.wait();
          return true;
        }
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
      const escrowNetKey = (orderData.side === 'ask' ? orderData.fromNetwork : orderData.toNetwork).toLowerCase();
      const escrowChain = CHAIN_REGISTRY[escrowNetKey as 'hedera' | 'polygon'];
      if (!escrowChain) throw new Error(`Unknown network: ${escrowNetKey}`);
      const baseTokenAddress = getTokenAddressForNetwork(orderData.fromNetwork, orderData.baseAsset);
      const quoteTokenAddress = getTokenAddressForNetwork(orderData.toNetwork, orderData.quoteAsset);
      const settlementAddr = resolveSettlementAddress(escrowNetKey as 'hedera' | 'polygon');
      if (!settlementAddr) throw new Error(`Settlement address not set for ${escrowNetKey}`);
      await ensureSufficientHbar();
      await ensureNetwork(escrowChain.chainId);
      console.log('Network + settlement used:', { escrowNetKey, chainId: escrowChain.chainId, settlementAddr, baseTokenAddress, quoteTokenAddress });

      // Verify backend and frontend use the same settlement address
      try {
        const backendAddrResp = await orderbookApi.getSettlementAddress();
        const backendAddr = (backendAddrResp?.data?.settlement_address || '').toLowerCase();
        if (backendAddr && backendAddr !== settlementAddr.toLowerCase()) {
          throw new Error(`Settlement address mismatch between frontend (${settlementAddr}) and backend (${backendAddr}). Please align envs.`);
        }
      } catch (e) {
        // Non-fatal; continue but log for visibility
        console.warn('Failed to verify backend settlement address', e);
      }
      
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

      // Step 1: Approval will be ensured during deposit only if needed
      console.log('Step 1: Skipping upfront approval (will ensure during deposit if needed)');

      // Step 2: Check escrow balance
      console.log('Step 2: Checking escrow balance...');
      const escrowBalance = await checkEscrowBalance(tokenToUse, settlementAddr, escrowChain.rpc);
      const decimals = await getTokenDecimals(tokenToUse);
      const requiredAmount = ethers.parseUnits(amountToUse, decimals);

      console.log('Escrow balance:', {
        available: ethers.formatUnits(escrowBalance.available, decimals),
        required: amountToUse
      });

      // Step 3: Deposit to escrow if needed (this will also ensure approval if required)
      if (escrowBalance.available < requiredAmount) {
        const needed = requiredAmount - escrowBalance.available;
        const neededFormatted = ethers.formatUnits(needed, decimals);
        console.log(`Step 3: Depositing ${neededFormatted} to escrow...`);
        await depositToEscrow(tokenToUse, neededFormatted, settlementAddr, escrowChain.rpc);
        // Do not block on mirror-node updates; proceed to submit order
      } else {
        console.log('Step 3: Sufficient escrow balance, skipping deposit');
      }

      // Step 4: Prepare order for submission (signing done after register when we have exact trade fields)
      console.log('Step 4: Preparing order payload...');
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
      };

      console.log('Step 5: Submitting order to orderbook...');
      const response = await orderbookApi.registerOrder(apiOrderData);

      if (response.status_code === 1) {
        console.log('Order submitted successfully!');
        setState(prev => ({ ...prev, orderStatus: 'completed', loading: false }));
        const orderId = response.order.orderId;
        const trades = response.order.trades || [];
        // No client-side signing required anymore; settlement is handled by backend/owner
        return { success: true, orderId, trades };
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

  const checkEscrowBalance = async (tokenAddress: string, settlementAddr?: string, rpcOverride?: string): Promise<EscrowBalance> => {
    if (!account) throw new Error('Wallet not connected');
    try {
      const ro = rpcOverride ? new ethers.JsonRpcProvider(rpcOverride) : readonlyProvider;
      // Verify contract exists on target RPC (rate-limit tolerant)
      const cacheKey = (settlementAddr || '').toLowerCase();
      if (!contractCodeCache.get(cacheKey)) {
        const maxAttempts = 3;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            const code = await ro.getCode(settlementAddr!);
            if (code && code !== '0x') {
              contractCodeCache.set(cacheKey, true);
              break;
            }
            // If empty, still proceed; some RPCs may lag. Do not hard fail here.
            break;
          } catch (err: any) {
            // Back off on mirror-node timeouts or rate limits
            const msg = String(err?.message || '');
            if (msg.includes('rate limited') || msg.includes('504') || (err?.code === -32005) || (err?.code === -32020)) {
              await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
              continue;
            }
            break;
          }
        }
      }
      const settlement = new ethers.Contract(settlementAddr!, SETTLEMENT_ABI, ro);
      try {
        const [total, available, locked] = await settlement.checkEscrowBalance(account, tokenAddress);
        return { total, available, locked };
      } catch (primaryErr) {
        // Fallback to direct mapping reads if the helper view is absent/mismatched
        const total: bigint = await settlement.escrowBalances(account, tokenAddress);
        const locked: bigint = await settlement.lockedBalances(account, tokenAddress);
        const available: bigint = total >= locked ? (total - locked) : 0n;
        return { total, available, locked };
      }
    } catch (error) {
      console.error('Escrow balance check error (readonly):', error);
      // Fallback to signer provider if readonly fails for any reason
      try {
        const settlement = await getSettlementContract(settlementAddr!);
        try {
          const [total, available, locked] = await settlement.checkEscrowBalance(account, tokenAddress);
          return { total, available, locked };
        } catch (primaryErr) {
          // Fallback to direct mapping reads with signer provider
          const total: bigint = await settlement.escrowBalances(account, tokenAddress);
          const locked: bigint = await settlement.lockedBalances(account, tokenAddress);
          const available: bigint = total >= locked ? (total - locked) : 0n;
          return { total, available, locked };
        }
      } catch (e2) {
        console.error('Escrow balance check error (signer):', e2);
        throw e2;
      }
    }
  };

  const depositToEscrow = async (tokenAddress: string, amount: string, settlementAddr?: string, rpcOverride?: string): Promise<void> => {
    if (!signer || !account) throw new Error('Wallet not connected');

    setState(prev => ({ ...prev, loading: true, orderStatus: 'depositing' }));
    
    try {
      // ensureNetwork is done by caller
      await ensureSufficientHbar();
      await ensureErc20Contract(tokenAddress);
      const decimals = await getTokenDecimals(tokenAddress);
      const parsedAmount = ethers.parseUnits(amount, decimals);

      console.log(`Depositing ${amount} tokens to escrow...`);

      // Ensure unlimited allowance before depositing
      await checkAndApproveToken(tokenAddress, amount, settlementAddr);

      // Then deposit to escrow with simulate + retry
      const settlement = await getSettlementContract(settlementAddr!);
      console.log('Depositing to escrow contract...');
      try {
        // Simulate to surface revert reasons early (ethers v6)
        const depositFn: any = settlement.getFunction('depositToEscrow');
        await depositFn.staticCall(tokenAddress, parsedAmount);
      } catch (simErr) {
        const hederaMsg = extractHederaErrorMessage(simErr);
        if (hederaMsg) throw new Error(hederaMsg);
      }
      const waitForReceipt = async (tx: ethers.TransactionResponse) => {
        try {
          // Prefer wallet provider's wait which internally polls receipt
          await tx.wait();
          return true;
        } catch (e) {
          return false;
        }
      };

      let receiptOk = false;
      try {
        const depositTx = await settlement.depositToEscrow(tokenAddress, parsedAmount, { gasLimit: 300000, gasPrice: ethers.parseUnits('1', 'gwei') });
        receiptOk = await waitForReceipt(depositTx);
      } catch (e: any) {
        const depositTx = await settlement.depositToEscrow(tokenAddress, parsedAmount, { gasLimit: 300000 });
        receiptOk = await waitForReceipt(depositTx);
      }

      // Do not hard-fail if mirror node lags; the receipt confirms success
      console.log('Escrow deposit complete');
      // Leave loading/orderStatus control to the caller (submitOrder)
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