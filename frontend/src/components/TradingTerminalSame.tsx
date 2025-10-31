import React from 'react';
import { TradingTerminal } from './TradingTerminal';
import { useTradeSame } from '../hooks/useTradeSame';

export function TradingTerminalSame({ onSymbolChange }: { onSymbolChange?: (s: string) => void }) {
  return (
    <TradingTerminal
      onSymbolChange={onSymbolChange}
      variant="same"
      useTradeImpl={useTradeSame as any}
    />
  );
}

export default TradingTerminalSame;


