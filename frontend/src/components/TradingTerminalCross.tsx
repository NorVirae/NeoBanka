import React from 'react';
import { TradingTerminal } from './TradingTerminal';
import { useTradeCross } from '../hooks/useTradeCross';

export function TradingTerminalCross({ onSymbolChange }: { onSymbolChange?: (s: string) => void }) {
  return (
    <TradingTerminal
      onSymbolChange={onSymbolChange}
      variant="cross"
      defaultFromNetwork="hedera"
      defaultToNetwork="polygon"
      useTradeImpl={useTradeCross as any}
    />
  );
}

export default TradingTerminalCross;


