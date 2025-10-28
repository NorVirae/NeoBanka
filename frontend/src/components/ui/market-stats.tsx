import { Card } from "./card";
import { Badge } from "./badge";
import { TrendingUp, TrendingDown, DollarSign, BarChart3 } from "lucide-react";

interface MarketData {
  price: string;
  change24h: string;
  volume24h: string;
  marketCap: string;
  isPositive: boolean;
}

const marketData: MarketData = {
  price: "$0.2451",
  change24h: "+5.7%",
  volume24h: "$12.4M",
  marketCap: "$891.2M",
  isPositive: true
};

const tradingMetrics = [
  { label: "Active Positions", value: "47", icon: BarChart3 },
  { label: "Win Rate", value: "73.2%", icon: TrendingUp },
  { label: "Daily PnL", value: "+$2,847", icon: DollarSign },
  { label: "Sharpe Ratio", value: "1.84", icon: TrendingUp }
];

export function MarketStats() {
  return (
    <div className="space-y-4">
      {/* HBAR Price Card */
      <Card className="bg-card border border-border">
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-red-400 font-terminal">[MARKET_DATA]</h3>
            <Badge variant={marketData.isPositive ? "success" : "destructive"} className="text-xs font-mono">
              {marketData.isPositive ? "BULL" : "BEAR"}
            </Badge>
          </div>
          
          <div className="space-y-2 font-mono text-xs">
            <div className="flex justify-between items-center p-2 bg-muted/20 border border-border/50">
              <span className="text-muted-foreground">hbar_price:</span>
              <div className="flex items-center space-x-2">
                <span className="text-foreground font-bold text-sm">{marketData.price}</span>
                <span className={`${marketData.isPositive ? 'text-success' : 'text-destructive'}`}>
                  {marketData.change24h}
                </span>
              </div>
            </div>
            
            <div className="space-y-1">
              <div className="flex justify-between items-center p-2 bg-muted/20 border border-border/50">
                <span className="text-muted-foreground">volume_24h:</span>
                <span className="text-foreground">{marketData.volume24h}</span>
              </div>
              <div className="flex justify-between items-center p-2 bg-muted/20 border border-border/50">
                <span className="text-muted-foreground">market_cap:</span>
                <span className="text-foreground">{marketData.marketCap}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Trading Metrics */}
      <Card className="bg-card border border-border">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-bold text-red-400 font-terminal">[TRADING_METRICS]</h3>
          <p className="text-xs text-muted-foreground font-mono">live performance data</p>
        </div>
        <div className="p-3 space-y-1 font-mono text-xs">
          {tradingMetrics.map((metric, index) => (
            <div key={index} className="flex justify-between items-center p-2 bg-muted/20 border border-border/50">
              <span className="text-muted-foreground">{metric.label.toLowerCase().replace(' ', '_')}:</span>
              <span className="text-foreground">{metric.value}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}