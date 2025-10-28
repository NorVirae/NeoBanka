import { useEffect, useState } from "react";
import { Card } from "./card";
import { ScrollArea } from "./scroll-area";
import { Badge } from "./badge";
import { Terminal, ChevronRight } from "lucide-react";

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warning" | "error";
  agent: string;
  message: string;
}

const generateLogEntry = (): LogEntry => {
  const messages = [
    "Buffett spotted undervalued HBAR fundamentals",
    "Belfort calculated maximum profit: $0.2451 with 2.3% upside",
    "Lynch executed BUY: 150 HBAR in 47ms - FILLED",
    "Dalio rebalanced portfolio: risk exposure optimal at 67%",
    "Buffett: 'This reminds me of Coca Cola in 1988'",
    "Belfort: 'Price target updated to $0.2580 - LET'S GO!'",
    "Lynch: 'Order book looks delicious, time to feast'",
    "Dalio: 'All systems green, risk properly managed'",
    "Buffett discovered intrinsic value opportunity: +12%",
    "Belfort fine-tuned aggressive profit algorithms",
    "Lynch cancelled 3 orders, market timing not perfect",
    "Dalio: 'Team, remember - risk first, profits second'",
    "Buffett: 'Be fearful when others are greedy...'",
    "Belfort processed 847 profit calculations in 1 second",
    "Lynch: 'BOOM! Another legendary trade executed'",
    "Dalio increased stop-loss to protect recent gains"
  ];

  const agents = ["Buffett", "Belfort", "Lynch", "Dalio"];
  const levels: ("info" | "success" | "warning" | "error")[] = ["info", "success", "warning"];

  return {
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toLocaleTimeString(),
    level: levels[Math.floor(Math.random() * levels.length)],
    agent: agents[Math.floor(Math.random() * agents.length)],
    message: messages[Math.floor(Math.random() * messages.length)]
  };
};

const getLevelColor = (level: string) => {
  switch (level) {
    case "success": return "text-red-400";
    case "warning": return "text-red-500";
    case "error": return "text-red-600";
    default: return "text-red-300";
  }
};

const getLevelBadge = (level: string) => {
  switch (level) {
    case "success": return "success";
    case "warning": return "warning";
    case "error": return "destructive";
    default: return "secondary";
  }
};

export function TerminalLog() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    // Add initial logs
    const initialLogs = Array.from({ length: 10 }, generateLogEntry);
    setLogs(initialLogs.reverse());

    // Add new logs every 8 seconds (slower)
    const interval = setInterval(() => {
      setLogs(prev => [generateLogEntry(), ...prev.slice(0, 49)]);
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="bg-card border border-border h-full">
      <div className="p-3 border-b border-border">
        <div className="flex items-center space-x-2">
          <Terminal className="h-4 w-4 text-green-400" />
          <h3 className="text-sm font-bold text-green-400 font-terminal">[AGENT_CHATTER]</h3>
          <Badge variant="success" className="text-xs font-mono animate-pulse">
            LIVE
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground font-mono">tail -f /var/log/agent_conversations.log</p>
      </div>
      
      <ScrollArea className="h-80">
        <div className="p-3 space-y-1 font-mono text-xs">
          {logs.map((log) => (
            <div key={log.id} className="hover:bg-muted/20 transition-colors">
              <div className="flex items-start space-x-2">
                <span className="text-muted-foreground">{log.timestamp}</span>
                <span className={`${getLevelColor(log.level)}`}>
                  [{log.level.toUpperCase()}]
                </span>
                <span className="text-red-400 font-bold">{log.agent}:</span>
                <span className={`${getLevelColor(log.level)} flex-1`}>
                  "{log.message}"
                </span>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}