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

export interface OrderParamsSame {
  baseAsset: string;
  quoteAsset: string;
  price: string;
  quantity: string;
  side: 'bid' | 'ask';
  fromNetwork: 'hedera' | 'polygon';
  toNetwork: 'hedera' | 'polygon';
  receiveWallet: string;
  type?: 'limit' | 'market';
}

export interface TradeResult {
  success: boolean;
  orderId: string;
  trades: Array<{ id: string; price: string; quantity: string; timestamp: number }>;
}

export function useTradeSame() {
  const [state, setState] = useState<TradeState>({ loading: false, error: null, orderStatus: 'idle' });
  const { provider, account, signer } = useWallet();
  const readonlyProvider = new ethers.JsonRpcProvider(HEDERA_TESTNET.rpcUrls[0]);

  const ensureNetwork = async (targetChainId: number) => {
    if (!provider) throw new Error('Wallet not connected');
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== targetChainId) throw new Error(`WRONG_NETWORK:${targetChainId}`);
  };

  const switchOrAddNetwork = async (targetKey: 'hedera' | 'polygon') => {
    if (!provider) throw new Error('Wallet not connected');
    const target = CHAIN_REGISTRY[targetKey];
    const hexChainId = '0x' + target.chainId.toString(16);
    const anyProv: any = provider as any;
    try {
      await anyProv.send('wallet_switchEthereumChain', [{ chainId: hexChainId }]);
    } catch (e: any) {
      if (e?.code !== 4902) throw e;
      const params = targetKey === 'hedera'
        ? { chainId: hexChainId, chainName: 'Hedera Testnet', nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 }, rpcUrls: HEDERA_TESTNET.rpcUrls as any, blockExplorerUrls: HEDERA_TESTNET.blockExplorerUrls as any }
        : { chainId: hexChainId, chainName: 'Polygon Amoy Testnet', nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 }, rpcUrls: [CHAIN_REGISTRY.polygon.rpc], blockExplorerUrls: ['https://www.oklink.com/amoy'] as any };
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

  const ensureErc20Contract = async (tokenAddress: string) => {
    const code = await (provider ? provider.getCode(tokenAddress) : readonlyProvider.getCode(tokenAddress));
    if (!code || code === '0x') throw new Error('Token contract not found on current network');
  };

  const checkAndApproveToken = async (tokenAddress: string, amount: string | number, settlementAddr: string, rpcOverride?: string) => {
    if (!signer || !account) throw new Error('Wallet not connected');
    await ensureErc20Contract(tokenAddress);
    const token = await getTokenContract(tokenAddress);
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

  const submitOrder = async (orderData: OrderParamsSame): Promise<TradeResult> => {
    if (!provider || !account) throw new Error('Wallet not connected');
    setState(prev => ({ ...prev, loading: true, error: null, orderStatus: 'idle' }));
    try {
      if (orderData.fromNetwork !== orderData.toNetwork) throw new Error('Same-chain only: from and to must match');
      const netKey = orderData.fromNetwork;
      const chain = CHAIN_REGISTRY[netKey];
      const settlementAddr = resolveSettlementAddress(netKey);
      const baseTokenAddress = resolveTokenAddress(netKey, orderData.baseAsset);
      const quoteTokenAddress = resolveTokenAddress(netKey, orderData.quoteAsset);

      try { await ensureNetwork(chain.chainId); } catch (e: any) { if (String(e?.message || '').startsWith('WRONG_NETWORK:')) { await switchOrAddNetwork(netKey); await ensureNetwork(chain.chainId); } else { throw e; } }

      const priceStr = String(orderData.price); const qtyStr = String(orderData.quantity);
      const tokenToUse = orderData.side === 'ask' ? baseTokenAddress : quoteTokenAddress;
      const decimals = await getTokenDecimals(tokenToUse);
      const requiredAmount = orderData.side === 'ask' ? ethers.parseUnits(qtyStr, decimals) : ethers.parseUnits((Number(qtyStr) * Number(priceStr)).toFixed(18), decimals);

      const escrow = await checkEscrowBalance(settlementAddr, tokenToUse);
      if (escrow.available < requiredAmount) {
        const need = requiredAmount - escrow.available;
        await checkAndApproveToken(tokenToUse, ethers.formatUnits(need, decimals), settlementAddr, CHAIN_REGISTRY[netKey].rpc);
        const settlement = new ethers.Contract(settlementAddr, SETTLEMENT_ABI, signer!);
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
      const res = await orderbookApi.registerOrder(payload);
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


