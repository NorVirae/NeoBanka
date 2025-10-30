import { useEffect, useState } from "react";
import { WalletConnect } from "../components/walletConnect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AssetList } from "@/components/ui/asset-select";
import { NetworkList } from "@/components/ui/network-select";
import { useWallet } from "@/hooks/useWallet";
import { useTrade } from "@/hooks/useTrade";

const CrossChain = () => {
  const { account } = useWallet();
  const { submitOrder, loading, error, orderStatus } = useTrade();

  const [fromNetwork, setFromNetwork] = useState<string>("hedera");
  const [toNetwork, setToNetwork] = useState<string>("polygon");
  const [baseAsset, setBaseAsset] = useState<string>("HBAR");
  const [quoteAsset, setQuoteAsset] = useState<string>("USDT");
  const [side, setSide] = useState<"bid" | "ask">("bid");
  const [price, setPrice] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [receiveWallet, setReceiveWallet] = useState<string>("");

  useEffect(() => {
    if (fromNetwork === toNetwork) {
      setToNetwork(fromNetwork === "hedera" ? "polygon" : "hedera");
    }
  }, [fromNetwork, toNetwork]);

  const onSubmit = async () => {
    if (!account) return;
    await submitOrder({
      baseAsset,
      quoteAsset,
      price: price || "0",
      quantity: quantity || "0",
      side,
      fromNetwork,
      toNetwork,
      receiveWallet: receiveWallet || account,
      type: "limit",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-foreground rounded-sm flex items-center justify-center">
              <span className="text-background font-bold text-sm">N</span>
            </div>
            <h1 className="text-xl font-semibold">NeoBanka</h1>
            <span className="text-sm text-muted-foreground ml-2">Cross-Chain</span>
          </div>
          <WalletConnect />
        </div>
      </header>

      <main className="container mx-auto py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Cross-Chain Order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NetworkList label="From Network" network={fromNetwork} setNetwork={setFromNetwork} />
                <NetworkList label="To Network" network={toNetwork} setNetwork={setToNetwork} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AssetList label="Base Asset" asset={baseAsset} setAsset={setBaseAsset} assetList={["HBAR"]} />
                <AssetList label="Quote Asset" asset={quoteAsset} setAsset={setQuoteAsset} assetList={["USDT"]} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="side" className="text-sm">Side</Label>
                  <select
                    id="side"
                    value={side}
                    onChange={(e) => setSide(e.target.value as "bid" | "ask")}
                    className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm"
                  >
                    <option value="bid">Buy (Bid)</option>
                    <option value="ask">Sell (Ask)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="price" className="text-sm">Price</Label>
                    <Input id="price" placeholder="e.g. 0.050" value={price} onChange={(e) => setPrice(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="quantity" className="text-sm">Quantity</Label>
                    <Input id="quantity" placeholder="e.g. 100" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="receiveWallet" className="text-sm">Destination Receive Wallet (on To Network)</Label>
                <Input id="receiveWallet" placeholder="0x... (optional)" value={receiveWallet} onChange={(e) => setReceiveWallet(e.target.value)} />
              </div>

              <div className="flex items-center gap-3">
                <Button disabled={loading || !account} onClick={onSubmit}>
                  {loading ? `${orderStatus || 'Processing'}...` : 'Submit Cross-Chain Order'}
                </Button>
                {error && (
                  <span className="text-sm text-red-500">{String(error)}</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How it works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Cross-chain orders use the same order book. Matching pairs orders where networks are compatible
                (the seller&apos;s From Network equals the buyer&apos;s To Network, and vice versa).
              </p>
              <p>
                Settlement is executed by the matching engine on both chains using escrow balances. No bridge is used.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default CrossChain;



