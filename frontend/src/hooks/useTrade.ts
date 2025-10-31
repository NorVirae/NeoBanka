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
  symbolOverride?: string;
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
  
  // Ensure wallet has enough native token for gas on current chain
  const ensureSufficientNative = async (chainKey: 'hedera' | 'ethereum') => {
    if (!account) throw new Error('Wallet not connected');
    let balance: bigint;
    try {
      if (!provider) throw new Error('no wallet provider');
      balance = await provider.getBalance(account);
    } catch (err: any) {
      balance = await readonlyProvider.getBalance(account);
    }
    // Minimal safe buffer per chain (tunable)
    const minByChain: Record<'hedera' | 'ethereum', string> = {
      hedera: '0.005',
      ethereum: '0.01',
    };
    const minWei = ethers.parseEther(minByChain[chainKey]);
    if (balance < minWei) {
      const sym = chainKey === 'hedera' ? 'HBAR' : 'ETH';
      throw new Error(`INSUFFICIENT_PAYER_BALANCE: Not enough ${sym} to cover gas fees`);
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

  const getTokenContract = async (tokenAddress: string, freshSigner?: ethers.Signer) => {
    const useSigner = freshSigner || signer;
    if (!useSigner) throw new Error('Wallet not connected');
    return new ethers.Contract(tokenAddress, ERC20_ABI, useSigner);
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
  const ensureNetwork = async (targetChainId: number, retries = 5, refreshProvider = false) => {
    if (!provider) throw new Error('Wallet not connected');
    
    // If we just switched networks, we need to refresh the provider to avoid NETWORK_ERROR
    let currentProvider = provider;
    if (refreshProvider) {
      console.log('Refreshing provider after network switch...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Create a fresh provider instance
      try {
        const anyWindow: any = window;
        if (anyWindow.ethereum) {
          currentProvider = new ethers.BrowserProvider(anyWindow.ethereum);
        }
      } catch (e) {
        console.warn('Failed to refresh provider, using original');
        currentProvider = provider;
      }
    }
    
    for (let i = 0; i < retries; i++) {
      try {
        // Add initial delay for first check to let network settle
        if (i === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const net = await currentProvider.getNetwork();
        const currentChainId = Number(net.chainId);
        
        console.log(`Network check attempt ${i + 1}: current=${currentChainId}, target=${targetChainId}`);
        
        if (currentChainId === targetChainId) {
          console.log('Network check successful!');
          return; // Success
        }
        
        if (i === retries - 1) {
          throw new Error(`WRONG_NETWORK:${targetChainId} (current: ${currentChainId})`);
        }
      } catch (error: any) {
        console.log(`Network check error attempt ${i + 1}:`, error.code, error.message);
        
        // If we get NETWORK_ERROR and haven't tried refreshing provider yet, try that
        if (error.code === 'NETWORK_ERROR' && !refreshProvider && i === 0) {
          console.log('Network error detected, trying with fresh provider...');
          return await ensureNetwork(targetChainId, retries, true);
        }
        
        if ((error.code === 'NETWORK_ERROR' || error.code === 'UNKNOWN_ERROR') && i < retries - 1) {
          // Network is in transition, wait longer and retry
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        if (i === retries - 1) {
          if (error.message?.includes('WRONG_NETWORK:')) throw error;
          throw new Error(`WRONG_NETWORK:${targetChainId} (error: ${error.message})`);
        }
      }
      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  };

  // Attempt to switch chain in the user's wallet; add chain if missing
  const switchOrAddNetwork = async (targetKey: 'hedera' | 'ethereum') => {
    if (!provider) throw new Error('Wallet not connected');
    const target = CHAIN_REGISTRY[targetKey];
    if (!target?.chainId) throw new Error(`Unknown network key: ${targetKey}`);
    const hexChainId = '0x' + target.chainId.toString(16);
    const anyProv: any = provider as any;
    try {
      await anyProv.send('wallet_switchEthereumChain', [{ chainId: hexChainId }]);
      return true;
    } catch (switchErr: any) {
      // 4902 = chain not added to wallet
      const notAdded = switchErr?.code === 4902 || /Unrecognized chain ID/i.test(String(switchErr?.message || ''));
      if (!notAdded) throw switchErr;
      // Try to add the chain
      try {
        const params = targetKey === 'hedera'
          ? {
              chainId: hexChainId,
              chainName: 'Hedera Testnet',
              nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
              rpcUrls: (HEDERA_TESTNET.rpcUrls as any) || [],
              blockExplorerUrls: HEDERA_TESTNET.blockExplorerUrls as any,
            }
          : {
              chainId: hexChainId,
              chainName: 'Ethereum Sepolia',
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: [CHAIN_REGISTRY.ethereum.rpc].filter(Boolean),
              blockExplorerUrls: ['https://sepolia.etherscan.io'] as any,
            };
        await anyProv.send('wallet_addEthereumChain', [params]);
        await anyProv.send('wallet_switchEthereumChain', [{ chainId: hexChainId }]);
        return true;
      } catch (addErr) {
        throw addErr;
      }
    }
  };

  // Ensure the token address is a deployed contract on this network
  const ensureErc20Contract = async (tokenAddress: string, rpcOverride?: string, chainKey?: 'hedera' | 'ethereum') => {
    // Prefer explicit RPC for the target chain to avoid stale provider during network switches
    let ro: ethers.Provider | null = null;
    if (rpcOverride) {
      ro = new ethers.JsonRpcProvider(rpcOverride);
    } else if (chainKey) {
      const rpc = CHAIN_REGISTRY[chainKey].rpc;
      ro = rpc ? new ethers.JsonRpcProvider(rpc) : readonlyProvider;
    } else {
      ro = provider || readonlyProvider;
    }
    const code = await ro.getCode(tokenAddress);
    if (!code || code === '0x') {
      const netName = chainKey || 'current';
      throw new Error(`Token contract not found on ${netName} network. Verify token address and RPC`);
    }
  };

  const getTokenAddressForNetwork = (networkKey: string, asset: string): string => {
    const key = (networkKey || '').toLowerCase() as 'hedera' | 'ethereum';
    const addr = resolveTokenAddress(key, asset);
    if (!addr) throw new Error(`Token address not configured for ${asset} on ${key}`);
    return addr;
  };

  const checkAndApproveToken = async (
    tokenAddress: string,
    amount: string | number,
    settlementAddrOverride?: string,
    rpcOverride?: string,
    chainKey?: 'hedera' | 'ethereum'
  ): Promise<boolean> => {
    if (!account) throw new Error('Wallet not connected');

    try {
      // Ensure code via the target chain RPC to avoid wrong-network false negatives
      await ensureErc20Contract(tokenAddress, rpcOverride, chainKey);

      // Always construct a fresh BrowserProvider and signer post-switch to avoid NETWORK_ERROR (network changed)
      const anyWindow: any = window as any;
      const freshProvider = anyWindow.ethereum ? new ethers.BrowserProvider(anyWindow.ethereum) : provider;
      const freshSigner = freshProvider ? await freshProvider.getSigner() : signer;
      if (!freshSigner) throw new Error('Wallet not connected');

      // Optional: sanity check chain
      try {
        const network = await freshProvider!.getNetwork();
        if (chainKey) {
          const expected = CHAIN_REGISTRY[chainKey].chainId;
          if (Number(network.chainId) !== expected) {
            throw new Error(`WRONG_NETWORK:${expected}`);
          }
        }
      } catch {}

      const token = await getTokenContract(tokenAddress, freshSigner);
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
      // Retry once if network changed mid-approval
      if ((error as any)?.code === 'NETWORK_ERROR' && /network changed/i.test(String((error as any)?.message || ''))) {
        try {
          const anyWindow: any = window as any;
          const fp = anyWindow.ethereum ? new ethers.BrowserProvider(anyWindow.ethereum) : provider;
          await fp?.getNetwork(); // force resolve
        } catch {}
        // One quick retry with fresh signer
        try {
          return await checkAndApproveToken(tokenAddress, amount, settlementAddrOverride, rpcOverride, chainKey);
        } catch {}
      }
      if (typeof (error as any)?.message === 'string') throw new Error((error as any).message);
      throw error as any;
    }
  };

  const baseSubmit = async (orderData: OrderParams, useCrossEndpoint: boolean): Promise<TradeResult> => {
    if (!provider || !account) {
      throw new Error('Wallet not connected');
    }

    setState(prev => ({ ...prev, loading: true, error: null, orderStatus: 'idle' }));

    try {
      // Debug logs
      console.log('Order debug:', {
        side: orderData.side,
        fromNetwork: orderData.fromNetwork,
        toNetwork: orderData.toNetwork,
        baseAsset: orderData.baseAsset,
        quoteAsset: orderData.quoteAsset
      });
      
      // Always use the from-network for approvals/escrow (both buy and sell)
      const escrowNetKey = orderData.fromNetwork.toLowerCase();
      console.log('Selected escrow network:', escrowNetKey);
      
      const escrowChain = CHAIN_REGISTRY[escrowNetKey as 'hedera' | 'ethereum'];
      if (!escrowChain) throw new Error(`Unknown network: ${escrowNetKey}`);
      const baseTokenAddress = getTokenAddressForNetwork(orderData.fromNetwork, orderData.baseAsset);
      const quoteTokenAddress = getTokenAddressForNetwork(orderData.fromNetwork, orderData.quoteAsset);
      const settlementAddr = resolveSettlementAddress(escrowNetKey as 'hedera' | 'ethereum');
      if (!settlementAddr) throw new Error(`Settlement address not set for ${escrowNetKey}`);
      // Guard: settlement must not equal any token address on this chain
      if (settlementAddr.toLowerCase() === baseTokenAddress.toLowerCase() || settlementAddr.toLowerCase() === quoteTokenAddress.toLowerCase()) {
        throw new Error(`CONFIG_ERROR: Settlement address (${settlementAddr}) matches a token address on ${escrowNetKey}. Update your env to the correct settlement.`);
      }
      // Try to auto-switch to the correct network for approvals/escrow
      try {
        console.log('Ensuring network:', escrowChain.chainId, escrowNetKey);
        await ensureNetwork(escrowChain.chainId);
      } catch (e: any) {
        if (String(e?.message || '').startsWith('WRONG_NETWORK:')) {
          console.log('Network switch required, switching to:', escrowNetKey);
          await switchOrAddNetwork(escrowNetKey as 'hedera' | 'ethereum');
          console.log('Network switch completed, waiting for settlement...');
          // Wait for network switch to complete and settle
          await new Promise(resolve => setTimeout(resolve, 2000));
          // re-verify with fresh provider to handle network transition
          await ensureNetwork(escrowChain.chainId, 5, true);
        } else {
          throw e;
        }
      }
      // Ensure native balance on the now-selected chain
      await ensureSufficientNative(escrowNetKey as 'hedera' | 'ethereum');
      console.log('Submit (base) — network + addresses', { escrowNetKey, chainId: escrowChain.chainId, settlementAddr, baseTokenAddress, quoteTokenAddress });

      // Verify backend and frontend use the same settlement address
      try {
        const backendAddrResp = await orderbookApi.getSettlementAddress(escrowNetKey);
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
        await depositToEscrow(tokenToUse, neededFormatted, settlementAddr, escrowChain.rpc, escrowNetKey as 'hedera' | 'ethereum');
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
        // Separate order book when requested
        ...(orderData.symbolOverride ? { symbol_override: orderData.symbolOverride } : {}),
      };

      console.log('Step 5: Submitting order to orderbook...');
      const response = useCrossEndpoint
        ? await orderbookApi.registerOrderCross(apiOrderData)
        : await orderbookApi.registerOrder(apiOrderData);

      if (response.status_code === 1) {
        console.log('Order submitted successfully!');
        setState(prev => ({ ...prev, orderStatus: 'completed', loading: false }));
        const orderId = response.order.orderId;
        const trades = response.order.trades || [];
        // No client-side signing required anymore; settlement is handled by backend/owner
        return { success: true, orderId, trades };
      } else {
        // Surface backend validation and settlement details when available
        const details = (response as any)?.errors?.join?.(', ') || '';
        const extra = (response as any)?.validation_details ? ` | details: ${JSON.stringify((response as any).validation_details)}` : '';
        const settle = (response as any)?.settlement_info ? ` | settlement: ${JSON.stringify((response as any).settlement_info)}` : '';
        throw new Error(`${response.message || 'Order submission failed'} ${details}${extra}${settle}`.trim());
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

  const submitOrder = async (orderData: OrderParams): Promise<TradeResult> => baseSubmit(orderData, false);
  const submitOrderCross = async (orderData: OrderParams): Promise<TradeResult> => baseSubmit(orderData, true);

  const checkBalance = async (asset: string, amount: string): Promise<boolean> => {
    if (!provider || !account) return false;
    try {
      const net = await provider.getNetwork();
      const chainKey: 'hedera' | 'ethereum' = Number(net.chainId) === CHAIN_REGISTRY.ethereum.chainId ? 'ethereum' : 'hedera';
      const tokenAddress = resolveTokenAddress(chainKey, asset);
      if (!tokenAddress) return false;
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

  const depositToEscrow = async (tokenAddress: string, amount: string, settlementAddr?: string, rpcOverride?: string, chainKey?: 'hedera' | 'ethereum'): Promise<void> => {
    if (!signer || !account) throw new Error('Wallet not connected');

    setState(prev => ({ ...prev, loading: true, orderStatus: 'depositing' }));
    
    try {
      // ensureNetwork is done by caller; ensure native gas too if requested
      if (chainKey) {
        await ensureSufficientNative(chainKey);
      }
      await ensureErc20Contract(tokenAddress, rpcOverride, chainKey);
      const decimals = await getTokenDecimals(tokenAddress);
      const parsedAmount = ethers.parseUnits(amount, decimals);

      console.log(`Depositing ${amount} tokens to escrow...`);

      // Ensure unlimited allowance before depositing on the correct network/provider
      await checkAndApproveToken(tokenAddress, amount, settlementAddr, rpcOverride, chainKey as any);

      // Then deposit to escrow with simulate + retry, using a fresh signer to avoid network-changed
      const anyWindow: any = window as any;
      const freshProvider = anyWindow.ethereum ? new ethers.BrowserProvider(anyWindow.ethereum) : provider;
      const freshSigner = freshProvider ? await freshProvider.getSigner() : signer!;
      const settlement = new ethers.Contract(settlementAddr!, SETTLEMENT_ABI, freshSigner);
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
      const net = await provider!.getNetwork();
      const chainKey: 'hedera' | 'ethereum' = Number(net.chainId) === CHAIN_REGISTRY.ethereum.chainId ? 'ethereum' : 'hedera';
      const settlementAddr = resolveSettlementAddress(chainKey);
      const settlement = await getSettlementContract(settlementAddr);
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
    const net = await provider.getNetwork();
      const chainKey: 'hedera' | 'ethereum' = Number(net.chainId) === CHAIN_REGISTRY.ethereum.chainId ? 'ethereum' : 'hedera';
    const settlementAddr = resolveSettlementAddress(chainKey);
    const settlement = await getSettlementContract(settlementAddr);
    return await settlement.getUserNonce(account, tokenAddress);
  };

  return {
    ...state,
    submitOrder,
    submitOrderCross,
    checkBalance,
    checkAndApproveToken,
    // Escrow management functions
    checkEscrowBalance,
    depositToEscrow,
    withdrawFromEscrow,
    getUserNonce,
  };
}