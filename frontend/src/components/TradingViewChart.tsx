import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// TradingView widget configuration
interface TradingViewChartProps {
  symbol: string;
  onSymbolChange?: (symbol: string) => void;
  className?: string;
}

// Map our internal symbols to TradingView symbols
const symbolMapping: Record<string, string> = {
  'HBAR_USDT': 'GATEIO:HBARUSDT',
  'xZAR_USDT': 'XZARUSDC_4FECE9.USD',
  'cNGN_USDT': 'CNGNUSDC_0206B6',
};

// Available trading pairs for navigation
const availablePairs = [
  'HBAR_USDT',
  'xZAR_USDT', 
  'cNGN_USDT'
];

export function TradingViewChart({ symbol, onSymbolChange, className = '' }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  const currentIndex = availablePairs.indexOf(symbol);
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < availablePairs.length - 1;

  const handlePrevChart = () => {
    if (canGoPrev && onSymbolChange) {
      onSymbolChange(availablePairs[currentIndex - 1]);
    }
  };

  const handleNextChart = () => {
    if (canGoNext && onSymbolChange) {
      onSymbolChange(availablePairs[currentIndex + 1]);
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous widget
    if (widgetRef.current) {
      containerRef.current.innerHTML = '';
    }

    // Load TradingView script if not already loaded
    if (!window.TradingView) {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = createWidget;
      document.head.appendChild(script);
    } else {
      createWidget();
    }

    function createWidget() {
      if (!containerRef.current || !window.TradingView) return;

      const tradingViewSymbol = symbolMapping[symbol] || 'GATEIO:HBARUSDT';

      widgetRef.current = new window.TradingView.widget({
        autosize: true,
        symbol: tradingViewSymbol,
        interval: '60',
        timezone: 'Etc/UTC',
        theme: 'dark',
        style: '1',
        locale: 'en',
        toolbar_bg: '#0a0e27',
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        container_id: containerRef.current.id,
        studies: [
          'Volume@tv-basicstudies',
        ],
        loading_screen: {
          backgroundColor: '#0a0e27',
          foregroundColor: '#60a5fa'
        },
        overrides: {
          'paneProperties.background': '#0a0e27',
          'paneProperties.backgroundType': 'solid',
          'mainSeriesProperties.candleStyle.upColor': '#22c55e',
          'mainSeriesProperties.candleStyle.downColor': '#ef4444',
          'mainSeriesProperties.candleStyle.drawWick': true,
          'mainSeriesProperties.candleStyle.drawBorder': true,
          'mainSeriesProperties.candleStyle.borderColor': '#60a5fa',
          'mainSeriesProperties.candleStyle.borderUpColor': '#22c55e',
          'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
          'volumePaneSize': 'medium'
        }
      });
    }

    return () => {
      if (widgetRef.current && containerRef.current) {
        containerRef.current.innerHTML = '';
        widgetRef.current = null;
      }
    };
  }, [symbol]);

  return (
    <div className={`relative ${className}`}>
      {/* Navigation arrows */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <button
          onClick={handlePrevChart}
          disabled={!canGoPrev}
          className="p-2 bg-neobanka-black-500/80 border border-neobanka-teal-500/50 rounded-lg hover:bg-neobanka-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Previous chart"
        >
          <ChevronLeft className="h-4 w-4 text-neobanka-teal-400" />
        </button>
        <button
          onClick={handleNextChart}
          disabled={!canGoNext}
          className="p-2 bg-neobanka-black-500/80 border border-neobanka-teal-500/50 rounded-lg hover:bg-neobanka-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Next chart"
        >
          <ChevronRight className="h-4 w-4 text-neobanka-teal-400" />
        </button>
      </div>


      {/* TradingView widget container */}
      <div 
        ref={containerRef}
        id={`tradingview_${Math.random().toString(36).substr(2, 9)}`}
        className="w-full h-full min-h-[400px] bg-neobanka-black-500 rounded-lg"
      />
    </div>
  );
}

// Add TypeScript declaration for TradingView widget
declare global {
  interface Window {
    TradingView: any;
  }
}