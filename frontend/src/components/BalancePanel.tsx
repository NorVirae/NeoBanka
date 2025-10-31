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
  const [key, setKey] = useState<'hedera' | 'ethereum'>('hedera');
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!provider) return;
        const net = await provider.getNetwork();
        const cid = Number(net.chainId);
        const match = Object.entries(CHAIN_REGISTRY).find(([, v]) => Number(v.chainId) === cid);
        if (mounted && match) setKey(match[0] as 'hedera' | 'ethereum');
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
  const [walletByToken, setWalletByToken] = useState<Record<string, string>>({});
  const [escrowByToken, setEscrowByToken] = useState<Record<string, { total: string; available: string; locked: string }>>({});

  const addrs = useMemo(() => {
    try {
      const settle = resolveSettlementAddress(netKey);
      console.log(settle,'settlement ADDR', netKey);
      const tokens = ['HBAR', 'USDT'] as const;
      const tokenAddrs: Record<string, string> = {};
      tokens.forEach((sym) => {
        const addr = resolveTokenAddress(netKey, sym);
        if (addr) tokenAddrs[sym] = addr;
      });
      return { tokens: tokenAddrs, settle } as { tokens: Record<string, string>; settle: string };
    } catch {
      return { tokens: {}, settle: '' } as { tokens: Record<string, string>; settle: string };
    }
  }, [netKey]);

  const load = async () => {
    if (!isConnected || !account || !provider || !addrs.settle) return;
    setLoading(true);
    try {
      const settlement = new ethers.Contract(addrs.settle, SETTLEMENT_ABI, provider);
      const nextWallet: Record<string, string> = {};
      const nextEscrow: Record<string, { total: string; available: string; locked: string }> = {};

      const entries = Object.entries(addrs.tokens);
      for (const [symbol, tokenAddr] of entries) {
        const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
        const decimals = Number(await token.decimals().catch(() => (symbol === 'USDT' ? 6 : 18)));
        const bal = await token.balanceOf(account).catch(() => 0n);
        nextWallet[symbol] = ethers.formatUnits(bal, decimals);

        const [t, a, l] = await settlement.checkEscrowBalance(account, tokenAddr).catch(() => [0n, 0n, 0n]);
        nextEscrow[symbol] = {
          total: ethers.formatUnits(t, decimals),
          available: ethers.formatUnits(a, decimals),
          locked: ethers.formatUnits(l, decimals)
        };
      }

      setWalletByToken(nextWallet);
      setEscrowByToken(nextEscrow);
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
  }, [account, provider, addrs.tokens.HBAR, addrs.tokens.USDT, addrs.settle]);

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(addrs.tokens).map(([symbol]) => (
                <div key={symbol} className="border border-border rounded p-3">
                  <div className="text-xs text-muted-foreground mb-1">{symbol}{symbol === 'HBAR' ? ' (ERC20)' : ''}</div>
                  <div className="text-foreground font-semibold">Wallet: {Number(walletByToken[symbol] || '0').toFixed(4)}</div>
                  <div className="text-xs mt-1">
                    Escrow: {Number((escrowByToken[symbol]?.total) || '0').toFixed(4)} • Avail {Number((escrowByToken[symbol]?.available) || '0').toFixed(4)} • Locked {Number((escrowByToken[symbol]?.locked) || '0').toFixed(4)}
                  </div>
                </div>
              ))}
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
