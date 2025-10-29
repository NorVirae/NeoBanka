import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '@/hooks/useWallet';
import { CHAIN_REGISTRY, ERC20_ABI, SETTLEMENT_ABI, resolveSettlementAddress, resolveTokenAddress } from '@/lib/contracts';

const Card = ({ children, className = '' }) => (
  <div className={`bg-card border border-border rounded-lg ${className}`}>{children}</div>
);
const CardHeader = ({ children, className = '' }) => (
  <div className={`p-4 border-b border-border ${className}`}>{children}</div>
);
const CardTitle = ({ children, className = '' }) => (
  <h3 className={`text-lg font-semibold text-foreground ${className}`}>{children}</h3>
);
const CardContent = ({ children, className = '' }) => (
  <div className={`p-4 ${className}`}>{children}</div>
);
const Button = ({ children, className = '', ...props }) => (
  <button
    className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3 ${className}`}
    {...props}
  >
    {children}
  </button>
);

function useNetworkKey() {
  const { provider } = useWallet();
  const [key, setKey] = useState<'hedera' | 'polygon'>('hedera');
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!provider) return;
        const net = await provider.getNetwork();
        const cid = Number(net.chainId);
        const match = Object.entries(CHAIN_REGISTRY).find(([, v]) => Number(v.chainId) === cid);
        if (mounted && match) setKey(match[0] as 'hedera' | 'polygon');
      } catch {}
    })();
    return () => { mounted = false; };
  }, [provider]);
  return key;
}

export default function BalancePanel() {
  const { account, provider, isConnected } = useWallet();
  const netKey = useNetworkKey();
  const [loading, setLoading] = useState(false);
  const [walletHBAR, setWalletHBAR] = useState<string>('0');
  const [walletUSDT, setWalletUSDT] = useState<string>('0');
  const [escrowHBAR, setEscrowHBAR] = useState<{ total: string; available: string; locked: string }>({ total: '0', available: '0', locked: '0' });
  const [escrowUSDT, setEscrowUSDT] = useState<{ total: string; available: string; locked: string }>({ total: '0', available: '0', locked: '0' });

  const addrs = useMemo(() => {
    try {
      const base = CHAIN_REGISTRY[netKey];
      const hbarAddr = resolveTokenAddress(netKey, 'HBAR');
      const usdtAddr = resolveTokenAddress(netKey, 'USDT');
      const settle = resolveSettlementAddress(netKey);
      return { hbarAddr, usdtAddr, settle };
    } catch {
      return { hbarAddr: '', usdtAddr: '', settle: '' };
    }
  }, [netKey]);

  const load = async () => {
    if (!isConnected || !account || !provider || !addrs.hbarAddr || !addrs.usdtAddr || !addrs.settle) return;
    setLoading(true);
    try {
      // Prefer wallet provider for reads (avoids rate limits on public RPC)
      const hbar = new ethers.Contract(addrs.hbarAddr, ERC20_ABI, provider);
      const usdt = new ethers.Contract(addrs.usdtAddr, ERC20_ABI, provider);
      const decHBAR = Number(await hbar.decimals().catch(() => 18));
      const decUSDT = Number(await usdt.decimals().catch(() => 6));
      const [balHBAR, balUSDT] = await Promise.all([
        hbar.balanceOf(account).catch(() => 0n),
        usdt.balanceOf(account).catch(() => 0n),
      ]);
      setWalletHBAR(ethers.formatUnits(balHBAR, decHBAR));
      setWalletUSDT(ethers.formatUnits(balUSDT, decUSDT));

      const settlement = new ethers.Contract(addrs.settle, SETTLEMENT_ABI, provider);
      const [t1, a1, l1] = await settlement.checkEscrowBalance(account, addrs.hbarAddr).catch(() => [0n, 0n, 0n]);
      const [t2, a2, l2] = await settlement.checkEscrowBalance(account, addrs.usdtAddr).catch(() => [0n, 0n, 0n]);
      setEscrowHBAR({ total: ethers.formatUnits(t1, decHBAR), available: ethers.formatUnits(a1, decHBAR), locked: ethers.formatUnits(l1, decHBAR) });
      setEscrowUSDT({ total: ethers.formatUnits(t2, decUSDT), available: ethers.formatUnits(a2, decUSDT), locked: ethers.formatUnits(l2, decUSDT) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // optional: refresh every 20s
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, provider, addrs.hbarAddr, addrs.usdtAddr, addrs.settle]);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Balances</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {!isConnected ? (
          <div className="text-sm text-muted-foreground">Connect wallet to view balances.</div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <div className="font-medium">Network</div>
              <div className="text-muted-foreground capitalize">{netKey}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-border rounded p-3">
                <div className="text-xs text-muted-foreground mb-1">HBAR (ERC20)</div>
                <div className="text-foreground font-semibold">Wallet: {Number(walletHBAR).toFixed(4)}</div>
                <div className="text-xs mt-1">Escrow: {Number(escrowHBAR.total).toFixed(4)} • Avail {Number(escrowHBAR.available).toFixed(4)} • Locked {Number(escrowHBAR.locked).toFixed(4)}</div>
              </div>
              <div className="border border-border rounded p-3">
                <div className="text-xs text-muted-foreground mb-1">USDT</div>
                <div className="text-foreground font-semibold">Wallet: {Number(walletUSDT).toFixed(4)}</div>
                <div className="text-xs mt-1">Escrow: {Number(escrowUSDT.total).toFixed(4)} • Avail {Number(escrowUSDT.available).toFixed(4)} • Locked {Number(escrowUSDT.locked).toFixed(4)}</div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
