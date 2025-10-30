// src/lib/api.ts

// Normalize API URL to avoid 0.0.0.0 in browser context
const RAW_ORDERBOOK_API_URL = import.meta.env?.VITE_ORDERBOOK_API_URL || 'http://localhost:8001';
const ORDERBOOK_API_URL = RAW_ORDERBOOK_API_URL.replace('0.0.0.0', 'localhost');
const BOT_API_URL = import.meta.env?.VITE_AGENT_API_URL || 'http://localhost:8000';

export interface OrderData {
  account: string;
  baseAsset: string;
  quoteAsset: string;
  price: string;
  quantity: string;
  side: 'bid' | 'ask';
  type?: 'limit' | 'market';
  signature1: string;
  fromNetwork: string;
  toNetwork: string;
  // Backend also accepts snake_case variants; we forward them if present
  // Using optional to avoid strict typing conflicts in the app
  from_network?: string;
  to_network?: string;
  receiveWallet: string;
  privateKey?: string; // Optional for backend signing
  // Optional book override to separate cross-chain from same-chain order books
  symbol_override?: string;
}

export interface OrderResponse {
  status_code: number;
  message?: string;
  order: {
    orderId: string;
    trades?: Array<{
      id: string;
      price: string;
      quantity: string;
      timestamp: number;
    }>;
  };
}

export interface SettlementAddressResponse {
  status_code: number;
  settlement_address: string;
  message?: string;
}

function toFormData(payload: unknown): FormData {
  const form = new FormData();
  form.append('payload', JSON.stringify(payload));
  return form;
}

export const orderbookApi = {
  async registerOrder(orderData: OrderData): Promise<OrderResponse> {
    const res = await fetch(`${ORDERBOOK_API_URL}/api/register_order`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
      },
      body: toFormData(orderData),
      credentials: 'include',
    });
    return await res.json();
  },
  async registerOrderCross(orderData: OrderData): Promise<OrderResponse> {
    const res = await fetch(`${ORDERBOOK_API_URL}/api/register_order_cross`, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: toFormData(orderData),
      credentials: 'include',
    });
    return await res.json();
  },
  async settleTrades(payload: { order: any; trades: any[] }) {
    const res = await fetch(`${ORDERBOOK_API_URL}/api/settle_trades`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include',
    });
    return await res.json();
  },
  async getSettlementAddress(): Promise<{ status_code: number; data?: { settlement_address: string } }> {
    const res = await fetch(`${ORDERBOOK_API_URL}/api/get_settlement_address`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
    });
    return await res.json();
  },
  async getOrderbook(symbol: string, fromNetwork?: string, toNetwork?: string) {
    const res = await fetch(`${ORDERBOOK_API_URL}/api/orderbook`, {
      method: 'POST',
      // IMPORTANT: let the browser set multipart/form-data for FormData
      // Setting application/x-www-form-urlencoded breaks FastAPI Form(...) parsing
      body: toFormData({ symbol, from_network: fromNetwork, to_network: toNetwork })
    });
    return await res.json();
  },
  async getOrderbookCross(symbol: string, fromNetwork?: string, toNetwork?: string) {
    const res = await fetch(`${ORDERBOOK_API_URL}/api/orderbook_cross`, {
      method: 'POST',
      body: toFormData({ symbol, from_network: fromNetwork, to_network: toNetwork })
    });
    return await res.json();
  },
  async getOrder(orderId: number) {
    const res = await fetch(`${ORDERBOOK_API_URL}/api/order`, {
      method: 'POST',
      body: toFormData({ orderId }),
    });
    return await res.json();
  },
  async getBestOrder(baseAsset: string, quoteAsset: string, side: 'bid' | 'ask') {
    const res = await fetch(`${ORDERBOOK_API_URL}/api/get_best_order`, {
      method: 'POST',
      body: toFormData({ baseAsset, quoteAsset, side }),
    });
    return await res.json();
  },
  async cancelOrder(orderId: number, side: 'bid' | 'ask', baseAsset: string, quoteAsset: string) {
    const res = await fetch(`${ORDERBOOK_API_URL}/api/cancel_order`, {
      method: 'POST',
      body: toFormData({ orderId, side, baseAsset, quoteAsset }),
    });
    return await res.json();
  },
  async checkAvailableFunds(account: string, asset: string) {
    const res = await fetch(`${ORDERBOOK_API_URL}/api/check_available_funds`, {
      method: 'POST',
      body: toFormData({ account, asset }),
    });
    return await res.json();
  },
  async checkSettlementHealth() {
    const res = await fetch(`${ORDERBOOK_API_URL}/api/settlement_health`);
    return await res.json();
  },
  async getOrderHistory(symbol?: string, limit: number = 100) {
    const params = new URLSearchParams();
    if (symbol) params.set('symbol', symbol);
    params.set('limit', String(limit));
    const res = await fetch(`${ORDERBOOK_API_URL}/api/order_history?${params.toString()}`);
    return await res.json();
  },
  async getOrderHistoryCross(symbol?: string, limit: number = 100) {
    const params = new URLSearchParams();
    if (symbol) params.set('symbol', symbol);
    params.set('limit', String(limit));
    const res = await fetch(`${ORDERBOOK_API_URL}/api/order_history_cross?${params.toString()}`);
    return await res.json();
  },
};

export type BotCommandAction = 'start' | 'stop' | 'status' | 'register' | 'cancel' | 'modify';

export const botApi = {
  async command(action: BotCommandAction, params: Record<string, any> = {}) {
    const payload = { action, ...params };
    const res = await fetch(`${BOT_API_URL}/bot/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  },
  async status() {
    const res = await fetch(`${BOT_API_URL}/bot/status`);
    return await res.json();
  },
};

export { ORDERBOOK_API_URL, BOT_API_URL };


