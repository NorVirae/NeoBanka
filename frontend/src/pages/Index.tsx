// src/pages/Index.tsx - VERSION FINALE
import { TradingTerminalSame } from "../components/TradingTerminalSame";
import { TradingTerminalCross } from "../components/TradingTerminalCross";
import { useState } from "react";
import { WalletConnect } from "../components/walletConnect";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Index = () => {
  const [symbol, setSymbol] = useState("HBAR_USDT");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-neobanka-teal-500 to-neobanka-teal-600 rounded-lg flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-lg">N</span>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-neobanka-teal-400 to-neobanka-teal-500 bg-clip-text text-transparent">NeoBanka</h1>
                <p className="text-xs text-muted-foreground font-medium">Decentralized Banking</p>
              </div>
            </div>
            <div className="hidden md:block h-6 w-px bg-border"></div>
          </div>
          <WalletConnect />
        </div>
      </header>

      <main className="container mx-auto py-6">
        <Tabs defaultValue="trading" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 bg-neobanka-black-400 border border-neobanka-teal-500 p-1">
            <TabsTrigger value="trading" className="data-[state=active]:bg-neobanka-teal-500 data-[state=active]:text-white data-[state=active]:shadow-sm font-medium text-white">Trading Terminal</TabsTrigger>
            <TabsTrigger value="crosschain" className="data-[state=active]:bg-neobanka-teal-500 data-[state=active]:text-white data-[state=active]:shadow-sm font-medium text-white">Cross-Chain Terminal</TabsTrigger>
          </TabsList>

          <TabsContent value="trading" className="space-y-4">
            <TradingTerminalSame onSymbolChange={setSymbol} />
          </TabsContent>
          <TabsContent value="crosschain" className="space-y-4">
            <TradingTerminalCross onSymbolChange={setSymbol} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
