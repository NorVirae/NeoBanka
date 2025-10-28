import { Card } from "./card";
import { Badge } from "./badge";
import { Activity, Brain, TrendingUp, Shield, Zap, Eye, Target, Users } from "lucide-react";
import { useState, useEffect } from "react";

interface Agent {
  id: string;
  name: string;
  displayName: string;
  status: "online" | "offline" | "processing" | "analyzing" | "executing";
  lastActivity: string;
  icon: React.ComponentType<any>;
  description: string;
  currentTask: string;
  performance: string;
  personality: string;
}

const initialAgents: Agent[] = [
  {
    id: "analyst",
    name: "analyst_agent",
    displayName: "Buffett",
    status: "analyzing",
    lastActivity: "2s ago",
    icon: Eye,
    description: "Market analysis & long-term value assessment",
    currentTask: "Analyzing fundamentals across 12 markets...",
    performance: "94.2% accuracy",
    personality: "Patient value investor who sees what others miss"
  },
  {
    id: "pricing", 
    name: "pricing_agent",
    displayName: "Belfort",
    status: "processing",
    lastActivity: "1s ago",
    icon: Target,
    description: "Aggressive price optimization & profit maximization",
    currentTask: "Calculating maximum profit entry at $0.2448",
    performance: "18.7% avg profit",
    personality: "Wolf of Wall Street - ruthless profit hunter"
  },
  {
    id: "executive",
    name: "executive_agent",
    displayName: "Lynch",
    status: "executing",
    lastActivity: "0s ago",
    icon: Zap,
    description: "Lightning-fast trade execution & market timing",
    currentTask: "Executing BUY order: 150 HBAR @ $0.2451",
    performance: "47ms avg latency",
    personality: "Legendary stock picker with perfect timing"
  },
  {
    id: "inventory",
    name: "inventory_agent",
    displayName: "Dalio",
    status: "online",
    lastActivity: "3s ago",
    icon: Shield,
    description: "Risk management & systematic portfolio balance",
    currentTask: "Portfolio balanced: 67% long, 33% reserves",
    performance: "1.84 Sharpe ratio",
    personality: "Principles-based risk master who protects capital"
  }
];

const getStatusColor = (status: string) => {
  switch (status) {
    case "online": return "text-red-400";
    case "processing": return "text-red-500";
    case "analyzing": return "text-red-300";
    case "executing": return "text-red-600";
    case "offline": return "text-muted-foreground";
    default: return "text-muted-foreground";
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "online": return "destructive";
    case "processing": return "destructive";
    case "analyzing": return "destructive";
    case "executing": return "destructive";
    case "offline": return "secondary";
    default: return "secondary";
  }
};

const getStatusAnimation = (status: string) => {
  switch (status) {
    case "executing": return "animate-pulse";
    case "processing": return "animate-pulse";
    case "analyzing": return "animate-pulse";
    default: return "";
  }
};

export function AgentStatusPanel() {
  const [agents, setAgents] = useState(initialAgents);

  useEffect(() => {
    const interval = setInterval(() => {
      setAgents(prev => prev.map(agent => ({
        ...agent,
        lastActivity: Math.random() > 0.7 ? "now" : `${Math.floor(Math.random() * 30)}s ago`,
        status: Math.random() > 0.9 ? 
          (["processing", "analyzing", "executing", "online"] as const)[Math.floor(Math.random() * 4)] : 
          agent.status
      })));
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="bg-card border border-border">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-green-400 font-terminal">[AI_TRADING_LEGENDS]</h3>
            <p className="text-xs text-muted-foreground font-mono">wall street's finest, digitized</p>
          </div>
          <div className="flex items-center space-x-1">
            <Users className="h-3 w-3 text-green-400" />
            <span className="text-xs font-mono text-green-400">4/4 ACTIVE</span>
          </div>
        </div>
      </div>
      
      {/* Agent Grid */}
      <div className="p-3">
        <div className="grid grid-cols-2 gap-3">
          {agents.map((agent) => {
            const IconComponent = agent.icon;
            return (
              <div key={agent.id} className="bg-muted/20 border border-border rounded p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <div className={`${getStatusAnimation(agent.status)}`}>
                      <span className={`${getStatusColor(agent.status)} text-lg`}>●</span>
                    </div>
                    <div>
                      <div className="flex items-center space-x-1">
                        <span className="text-red-300 text-sm font-bold">{agent.displayName}</span>
                        <span className="text-muted-foreground text-xs">({agent.name})</span>
                      </div>
                      <Badge variant={getStatusBadge(agent.status) as any} className="text-xs px-1 py-0 mt-1">
                        {agent.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <span className="text-muted-foreground">last:</span>
                    <div className="text-red-400 font-mono">{agent.lastActivity}</div>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{agent.description}</p>
                  <p className="text-xs text-red-400 font-mono">{agent.performance}</p>
                  
                  <div className="pt-2 space-y-1">
                    <div className="flex items-start space-x-2 text-xs">
                      <span className="text-red-500">→</span>
                      <span className="text-foreground font-mono">{agent.currentTask}</span>
                    </div>
                    <div className="flex items-start space-x-2 text-xs">
                      <span className="text-red-300">♦</span>
                      <span className="text-muted-foreground italic">{agent.personality}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Team Performance */}
      <div className="p-3 border-t border-border">
        <div className="text-xs font-mono space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">legends_sync:</span>
            <span className="text-green-400">OPTIMAL</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">decisions_made:</span>
            <span className="text-foreground">1,247 today</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">success_rate:</span>
            <span className="text-green-400">89.3%</span>
          </div>
        </div>
      </div>
    </Card>
  );
}