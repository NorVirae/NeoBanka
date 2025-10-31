import { useState } from 'react';
import { ethers } from 'ethers';
import { useWallet } from './useWallet';
import { orderbookApi, OrderData } from '../lib/api';
import { ERC20_ABI, SETTLEMENT_ABI, HEDERA_TESTNET, CHAIN_REGISTRY, resolveTokenAddress, resolveSettlementAddress } from '../lib/contracts';

interface TradeState {
  loading: boolean;
  error: string | null;
  orderStatus: 'idle' | 'approving' | 'depositing' | 'submitting' | 'completed' | 'failed';
}

export interface OrderParamsCross {
  baseAsset: string;
  quoteAsset: string;
  price: string;
  quantity: string;
  side: 'bid' | 'ask';
  fromNetwork: 'hedera' | 'ethereum';
  toNetwork: 'hedera' | 'ethereum';
  receiveWallet: string;
  type?: 'limit' | 'market';
}

export interface TradeResult {
  success: boolean;
  orderId: string;
  trades: Array<{ id: string; price: string; quantity: string; timestamp: number }>;
}

export function useTradeCross() {
  const [state, setState] = useState<TradeState>({ loading: false, error: null, orderStatus: 'idle' });
  const { provider, account, signer } = useWallet();
  const readonlyProvider = new ethers.JsonRpcProvider(HEDERA_TESTNET.rpcUrls[0]);

  const ensureNetwork = async (targetChainId: number, retries: number = 4) => {
    const anyWindow: any = window as any;
    const getFreshProvider = () => (anyWindow?.ethereum ? new ethers.BrowserProvider(anyWindow.ethereum) : provider);
    if (!getFreshProvider()) throw new Error('Wallet not connected');
    let lastErr: any = null;
    for (let i = 0; i < retries; i++) {
      try {
        const fp = getFreshProvider()!;
        // Small initial delay on first attempt to let wallet finish switching
        if (i === 0) { await new Promise(r => setTimeout(r, 250)); }
        const net = await fp.getNetwork();
        if (Number(net.chainId) === targetChainId) return; // OK
        lastErr = new Error(`WRONG_NETWORK:${targetChainId}`);
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message || '');
        if ((e?.code === 'NETWORK_ERROR' || /network changed/i.test(msg))) {
          await new Promise(r => setTimeout(r, 400 * (i + 1)));
          continue; // retry on transient network-changed
        }
        // Unknown error → break early
        break;
      }
      await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
    throw lastErr || new Error(`WRONG_NETWORK:${targetChainId}`);
  };

  const switchOrAddNetwork = async (targetKey: 'hedera' | 'ethereum') => {
    if (!provider) throw new Error('Wallet not connected');
    const target = CHAIN_REGISTRY[targetKey];
    const hexChainId = '0x' + target.chainId.toString(16);
    const anyProv: any = provider as any;
    try { await anyProv.send('wallet_switchEthereumChain', [{ chainId: hexChainId }]); }
    catch (e: any) {
      if (e?.code !== 4902) throw e;
      const params = targetKey === 'hedera'
        ? { chainId: hexChainId, chainName: 'Hedera Testnet', nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 }, rpcUrls: HEDERA_TESTNET.rpcUrls as any, blockExplorerUrls: HEDERA_TESTNET.blockExplorerUrls as any }
        : { chainId: hexChainId, chainName: 'Ethereum Sepolia', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: [CHAIN_REGISTRY.ethereum.rpc], blockExplorerUrls: ['https://sepolia.etherscan.io'] as any };
      await anyProv.send('wallet_addEthereumChain', [params]);
      await anyProv.send('wallet_switchEthereumChain', [{ chainId: hexChainId }]);
    }
  };

  const getTokenContract = async (tokenAddress: string) => {
    if (!signer) throw new Error('Wallet not connected');
    return new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  };
  const getTokenDecimals = async (tokenAddress: string): Promise<number> => {
    try { return Number(await (new ethers.Contract(tokenAddress, ERC20_ABI, readonlyProvider)).decimals()); } catch { return 18; }
  };
  const ensureErc20Contract = async (tokenAddress: string, rpcOverride?: string) => {
    const ro = rpcOverride ? new ethers.JsonRpcProvider(rpcOverride) : (provider || readonlyProvider);
    const code = await ro.getCode(tokenAddress);
    if (!code || code === '0x') throw new Error('Token contract not found on current network');
  };

  const checkAndApproveToken = async (tokenAddress: string, amount: string | number, settlementAddr: string, rpcOverride?: string) => {
    if (!account) throw new Error('Wallet not connected');
    await ensureErc20Contract(tokenAddress, rpcOverride);
    const anyWindow: any = window as any;
    const freshProvider = anyWindow?.ethereum ? new ethers.BrowserProvider(anyWindow.ethereum) : provider;
    const freshSigner = freshProvider ? await freshProvider.getSigner() : signer;
    if (!freshSigner) throw new Error('Wallet not connected');
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, freshSigner);
    const decimals = await getTokenDecimals(tokenAddress);
    const amountStr = typeof amount === 'number' ? String(amount) : amount;
    const required = ethers.parseUnits(amountStr, decimals);
    const current: bigint = await token.allowance(account, settlementAddr).catch(() => 0n);
    if (current >= required) return true;
    setState(prev => ({ ...prev, orderStatus: 'approving' }));
    try { await (await token.approve(settlementAddr, required)).wait(); return true; } catch {
      try { await (await token.approve(settlementAddr, 0)).wait(); await (await token.approve(settlementAddr, required)).wait(); return true; } catch (e) { throw e; }
    }
  };

  const checkEscrowBalance = async (settlementAddr: string, tokenAddress: string): Promise<{ available: bigint }> => {
    if (!account) throw new Error('Wallet not connected');
    const settlement = new ethers.Contract(settlementAddr, SETTLEMENT_ABI, readonlyProvider);
    try { const [, available] = await settlement.checkEscrowBalance(account, tokenAddress); return { available } as any; } catch { return { available: 0n } as any; }
  };

  const submitOrder = async (orderData: OrderParamsCross): Promise<TradeResult> => {
    if (!provider || !account) throw new Error('Wallet not connected');
    setState(prev => ({ ...prev, loading: true, error: null, orderStatus: 'idle' }));
    try {
      // Always perform approval/escrow on the from network, regardless of side
      const escrowNetKey: 'hedera' | 'ethereum' = orderData.fromNetwork;
      const chain = CHAIN_REGISTRY[escrowNetKey];
      const settlementAddr = resolveSettlementAddress(escrowNetKey);
      const baseTokenAddressFrom = resolveTokenAddress(orderData.fromNetwork, orderData.baseAsset);
      const quoteTokenAddressFrom = resolveTokenAddress(orderData.fromNetwork, orderData.quoteAsset);
      if (settlementAddr.toLowerCase() === baseTokenAddressFrom.toLowerCase() || settlementAddr.toLowerCase() === quoteTokenAddressFrom.toLowerCase()) {
        throw new Error(`CONFIG_ERROR: Settlement address (${settlementAddr}) matches a token address on ${escrowNetKey}. Update your env to the correct settlement.`);
      }
      if (!baseTokenAddressFrom) {
        throw new Error(`CONFIG_ERROR: Token ${orderData.baseAsset} not configured on ${orderData.fromNetwork}`);
      }
      if (!quoteTokenAddressFrom) {
        throw new Error(`CONFIG_ERROR: Token ${orderData.quoteAsset} not configured on ${orderData.fromNetwork}`);
      }

      // Debug: Log settlement and token addresses used for submit
      try {
        console.log('Submit (cross) — addresses', {
          escrowNetKey,
          chainId: chain?.chainId,
          settlementAddr,
          baseTokenAddress: baseTokenAddressFrom,
          quoteTokenAddress: quoteTokenAddressFrom,
          from: orderData.fromNetwork,
          to: orderData.toNetwork,
          side: orderData.side,
        });
      } catch {}

      try { await ensureNetwork(chain.chainId); }
      catch (e: any) {
        const msg = String(e?.message || '');
        if (msg.startsWith('WRONG_NETWORK:')) {
          await switchOrAddNetwork(escrowNetKey);
          // brief settle wait and re-verify with retries
          await new Promise(r => setTimeout(r, 800));
          await ensureNetwork(chain.chainId);
        } else if (e?.code === 'NETWORK_ERROR' || /network changed/i.test(msg)) {
          // Give wallet time to finish switching, then re-verify
          await new Promise(r => setTimeout(r, 800));
          await ensureNetwork(chain.chainId);
        } else {
          throw e;
        }
      }

      const priceStr = String(orderData.price); const qtyStr = String(orderData.quantity);
      const tokenToUse = orderData.side === 'ask' ? baseTokenAddressFrom : quoteTokenAddressFrom;
      const decimals = await getTokenDecimals(tokenToUse);
      const requiredAmount = orderData.side === 'ask' ? ethers.parseUnits(qtyStr, decimals) : ethers.parseUnits((Number(qtyStr) * Number(priceStr)).toFixed(18), decimals);

      const escrow = await checkEscrowBalance(settlementAddr, tokenToUse);
      if (escrow.available < requiredAmount) {
        const need = requiredAmount - escrow.available;
        await checkAndApproveToken(tokenToUse, ethers.formatUnits(need, decimals), settlementAddr, CHAIN_REGISTRY[escrowNetKey].rpc);
        const anyWindow: any = window as any;
        const freshProvider = anyWindow?.ethereum ? new ethers.BrowserProvider(anyWindow.ethereum) : provider;
        const freshSigner = freshProvider ? await freshProvider.getSigner() : signer!;
        const settlement = new ethers.Contract(settlementAddr, SETTLEMENT_ABI, freshSigner);
        setState(prev => ({ ...prev, orderStatus: 'depositing' }));
        await (await settlement.depositToEscrow(tokenToUse, need)).wait();
      }

      setState(prev => ({ ...prev, orderStatus: 'submitting' }));
      const payload: OrderData = {
        account,
        baseAsset: orderData.baseAsset,
        quoteAsset: orderData.quoteAsset,
        price: priceStr,
        quantity: qtyStr,
        side: orderData.side,
        type: (orderData as any).type || 'limit',
        signature1: '',
        fromNetwork: orderData.fromNetwork,
        toNetwork: orderData.toNetwork,
        from_network: orderData.fromNetwork,
        to_network: orderData.toNetwork,
        receiveWallet: orderData.receiveWallet,
      };
      const res = await orderbookApi.registerOrderCross(payload);
      if (res.status_code !== 1) throw new Error(res.message || 'Order submission failed');
      setState(prev => ({ ...prev, orderStatus: 'completed', loading: false }));
      const orderId = res.order.orderId; const trades = res.order.trades || [];
      return { success: true, orderId, trades };
    } catch (e: any) {
      setState(prev => ({ ...prev, loading: false, orderStatus: 'failed', error: typeof e?.message === 'string' ? e.message : 'Unknown error' }));
      throw e;
    }
  };

  return { ...state, submitOrder };
}


