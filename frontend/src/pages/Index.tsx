// src/pages/Index.tsx - VERSION FINALE
import { TradingTerminal } from "../components/TradingTerminal";
import { useEffect, useState } from "react";
import { WalletConnect } from "../components/walletConnect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Index = () => {
  const [symbol, setSymbol] = useState("HBAR_USDT");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-foreground rounded-sm flex items-center justify-center">
              <span className="text-background font-bold text-sm">N</span>
            </div>
            <h1 className="text-xl font-semibold">NeoBanka</h1>
          </div>
          <WalletConnect />
        </div>
      </header>

      <main className="container mx-auto py-6">
        <Tabs defaultValue="trading" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="trading">Trading Terminal</TabsTrigger>
          </TabsList>

          <TabsContent value="trading" className="space-y-4">
            <TradingTerminal onSymbolChange={setSymbol} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
