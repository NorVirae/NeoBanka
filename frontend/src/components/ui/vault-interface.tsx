import { useState } from "react";
import { Card } from "./card";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Badge } from "./badge";
import { Separator } from "./separator";
import { Wallet, ArrowUpCircle, ArrowDownCircle, Info, Loader2 } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { useVault } from "@/hooks/useVault";
import { useToast } from "@/hooks/use-toast";

export function VaultInterface() {
  const { isConnected, isOnHederaTestnet } = useWallet();
  const { stats, loading, deposit, withdraw, approveWHBAR } = useVault();
  const { toast } = useToast();
  
  const [amount, setAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleTransaction = async () => {
    if (!isConnected || !isOnHederaTestnet) {
      toast({
        title: "Connection required",
        description: "Please connect your wallet to Hedera Testnet",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      if (isDepositing) {
        // Deposit flow
        if (!amount || parseFloat(amount) <= 0) {
          toast({
            title: "Invalid amount",
            description: "Please enter a valid deposit amount",
            variant: "destructive",
          });
          return;
        }

        if (stats && parseFloat(amount) < parseFloat(stats.minDeposit)) {
          toast({
            title: "Amount too small",
            description: `Minimum deposit is ${stats.minDeposit} WHBAR`,
            variant: "destructive",
          });
          return;
        }

        const result = await deposit(amount);
        
        if (result.success) {
          toast({
            title: "[DEPOSIT_SUCCESS]",
            description: `./executed --amount=${amount} --shares=${result.shares}`,
          });
          setAmount("");
        } else {
          toast({
            title: "[DEPOSIT_ERROR]",
            description: result.error || "Transaction failed",
            variant: "destructive",
          });
        }
      } else {
        // Withdraw flow
        if (!stats || parseFloat(stats.userShares) === 0) {
          toast({
            title: "[WITHDRAW_ERROR]",
            description: "No shares available for withdrawal",
            variant: "destructive",
          });
          return;
        }

        const result = await withdraw();
        
        if (result.success) {
          toast({
            title: "[WITHDRAW_SUCCESS]",
            description: `./executed --assets=${result.assets} --shares=ALL`,
          });
        } else {
          toast({
            title: "[WITHDRAW_ERROR]",
            description: result.error || "Transaction failed",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      toast({
        title: "[SYSTEM_ERROR]",
        description: "Unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Use real stats or fallback values
  const displayStats = {
    totalValueLocked: stats ? parseFloat(stats.totalAssets).toFixed(2) : "0.00",
    yourShares: stats ? parseFloat(stats.userShares).toFixed(4) : "0.0000",
    shareValue: stats ? parseFloat(stats.sharePrice).toFixed(4) : "1.0000",
    apy: "18.7%", // This would come from historical data
    whbarBalance: stats ? parseFloat(stats.whbarBalance).toFixed(4) : "0.0000",
    minDeposit: stats ? parseFloat(stats.minDeposit).toFixed(2) : "1.00",
    needsApproval: stats && amount ? parseFloat(amount) > parseFloat(stats.whbarAllowance) : false
  };

  return (
    <Card className="bg-card border border-border">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Vault Interface</h3>
            <p className="text-xs text-muted-foreground">Autonomous liquidity pool</p>
          </div>
          <Badge
            variant={isConnected && stats && !stats.isPaused ? "default" : "secondary"}
            className="text-xs"
          >
            {isConnected ? (stats?.isPaused ? "Paused" : "Active") : "Offline"}
          </Badge>
        </div>
      </div>

      {/* Connection Status */}
      {!isConnected && (
        <div className="p-3 bg-muted border-b border-border">
          <p className="text-xs text-muted-foreground">
            Wallet not connected. Please connect your wallet to continue.
          </p>
        </div>
      )}

      {/* Vault Stats */}
      <div className="p-3 space-y-3 text-sm">
        <div className="space-y-2">
          <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
            <span className="text-muted-foreground">Total Value Locked</span>
            <span className="font-semibold">
              {loading ? "Loading..." : `${displayStats.totalValueLocked} WHBAR`}
            </span>
          </div>
          <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
            <span className="text-muted-foreground">Current APY</span>
            <span className="font-semibold text-success">+{displayStats.apy}</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
            <span className="text-muted-foreground">Your Shares</span>
            <span className="font-semibold">
              {loading ? "Loading..." : displayStats.yourShares}
            </span>
          </div>
          <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
            <span className="text-muted-foreground">Share Value</span>
            <span className="font-semibold">
              {loading ? "Loading..." : `${displayStats.shareValue} WHBAR`}
            </span>
          </div>
          <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
            <span className="text-muted-foreground">WHBAR Balance</span>
            <span className="font-semibold">
              {loading ? "Loading..." : `${displayStats.whbarBalance} WHBAR`}
            </span>
          </div>
        </div>

        <Separator />

        {/* Transaction Interface */}
        <div className="space-y-4">
          <div className="flex space-x-2">
            <Button
              variant={isDepositing ? "default" : "outline"}
              size="sm"
              onClick={() => setIsDepositing(true)}
              className="flex-1"
            >
              <ArrowUpCircle className="h-4 w-4 mr-2" />
              Deposit
            </Button>
            <Button
              variant={!isDepositing ? "default" : "outline"}
              size="sm"
              onClick={() => setIsDepositing(false)}
              className="flex-1"
            >
              <ArrowDownCircle className="h-4 w-4 mr-2" />
              Withdraw
            </Button>
          </div>

          {isDepositing ? (
            <div className="space-y-2">
              <Label htmlFor="amount">Deposit Amount</Label>
              <div className="relative">
                <Input
                  id="amount"
                  type="number"
                  placeholder={`Min: ${displayStats.minDeposit} WHBAR`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="terminal-border font-mono pr-16"
                  disabled={!isConnected || isProcessing}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  WHBAR
                </span>
              </div>
              {displayStats.needsApproval && amount && (
                <p className="text-xs text-warning">
                  Approval required for {amount} WHBAR
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Withdrawal Amount</Label>
              <div className="relative">
                <Input
                  type="text"
                  value={`${displayStats.yourShares} SHARES (ALL)`}
                  readOnly
                  className="terminal-border font-mono pr-16 bg-muted/50"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  ALL SHARES
                </span>
              </div>
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={handleTransaction}
            disabled={
              isProcessing ||
              loading ||
              !isConnected ||
              !isOnHederaTestnet ||
              (isDepositing && !amount) ||
              (!isDepositing && parseFloat(displayStats.yourShares) === 0)
            }
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Wallet className="h-4 w-4 mr-2" />
                {isDepositing
                  ? `Deposit ${amount || "0"} WHBAR`
                  : `Withdraw All Shares`
                }
              </>
            )}
          </Button>
        </div>

        <Separator />

        {/* Fee Structure */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Fee Structure</h4>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Management Fee:</span>
              <span className="font-mono">2%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Withdrawal Fee:</span>
              <span className="font-mono">0.1%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gas Optimization:</span>
              <span className="font-mono">AUTO</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">API Access:</span>
              <span className="font-mono">PREMIUM</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}