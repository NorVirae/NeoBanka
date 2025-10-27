# Product Requirements Document (PRD): On-Chain Order-Book Market Maker Settlement System

## 1. Overview

**Objective**:
Create a decentralized, on-chain order-book-based market maker (MM) platform that allows market makers to submit, amend, and cancel orders via cryptographically signed messages. The system settles trades on-chain, ensuring transparency, trust, and auditability.

**Key Features Modeled from Filament**:

* Signature-based order authentication
* Support for multiple order types (limit, market/trigger, cancels, collateral updates, T/P and S/L)
* RESTful API endpoints + WebSocket for live order-book and market data feeds([docs.filament.finance](https://docs.filament.finance/market-makers/filament-api))

---

## 2. User Stories & Use Cases

1. **As a Market Maker**, I want to submit limit and market orders to the order book via signed API calls, so trades can be matched and settled transparently.
2. **As a Market Maker**, I want to update collateral, set take-profit or stop-loss orders, and cancel orders—all via signed transactions.
3. **As a System**, I need to verify the authenticity of every request by validating cryptographic signatures.
4. **As a Trader or UI**, I need real-time order-book updates and live price feeds via WebSocket for responsive UI or algorithmic strategies.
5. **As a Settler**, I need trades processed on-chain, updating on-chain state (balances, positions), with event logs for transparency and audit.

---

## 3. Functional Requirements

### A. Authentication via Signatures

* Generate a unique `orderId` (e.g., using nanoid or UUID) for each request.
* Market makers sign the `orderId` using their private key. The server verifies the signature using the maker's public key/address.([docs.filament.finance](https://docs.filament.finance/market-makers/filament-api))
* All API calls must include `orderId`, `signature`, and `account` (public address).

### B. API Endpoints (similar to Filament's)

#### 1. Order Placement: `POST /exchange`

Accepts payloads such as:

* **Limit Order**:

  ```json
  {
    "type": "order",
    "orders": [
      {
        "account": "<address>",
        "indexToken": "<asset>",
        "isBuy": true/false,
        "size": <amount>,
        "leverage": <leverage>,
        "reduceOnly": true/false,
        "orderId": "<id>",
        "signature": "<sig>",
        "orderType": {
          "type": "limit",
          "limit": {
            "tif": "Gtc",
            "limitPrice": "<price>"
          }
        }
      }
    ]
  }
  ```

* **Market (Trigger) Order**:

  ```json
  {
    "type": "order",
    "orders": [
      {
        "account": "<address>",
        "orderType": {
          "type": "trigger",
          "trigger": {
            "isMarket": true,
            "slippage": <percent>
          }
        }
      }
    ]
  }
  ```

([docs.filament.finance](https://docs.filament.finance/market-makers/filament-api))

#### 2. Cancel Orders: `POST /cancel`

```json
{
  "type": "cancel",
  "cancels": [
    {
      "account": "<address>",
      "orderId": "<id>",
      "signature": "<sig>"
    }
  ]
}
```

#### 3. Margin Adjustments: `POST /update-margin`

* **Add collateral**:

  ```json
  {
    "type": "updateIsolatedMargin",
    "account": "<address>",
    "asset": "<asset>",
    "collateral": <amount>,
    "isIncrement": true,
    "orderId": "<id>",
    "signature": "<sig>"
  }
  ```

* **Remove collateral** (set `"isIncrement": false`)([docs.filament.finance](https://docs.filament.finance/market-makers/filament-api))

#### 4. Take-Profit / Stop-Loss: `POST /update-tpsl`

```json
{
  "type": "updateIsolatedMargin",
  "account": "<address>",
  "takeProfit": "<price>",
  "stopLoss": "<price>",
  "orderId": "<id>",
  "signature": "<sig>",
  "tpsl": "tp" | "sl"
  // optionally include size, takeProfitOrderId, signatures for TP/SL
}
```

([docs.filament.finance](https://docs.filament.finance/market-makers/filament-api))

### C. WebSocket Feeds (similar to Filament)

* **Order Book State Feed**:
  * Connect via WebSocket endpoint (e.g., `/ws/order-book`)
  * Subscribe with asset token (or indexToken) to receive real-time order book snapshots or deltas.([docs.filament.finance](https://docs.filament.finance/market-makers/filament-api?utm_source=chatgpt.com))

* **Live Price Feed**:
  * Another channel (`/ws/live-feed`) broadcasts data like:

    ```json
    {
      "symbol": "BTC",
      "currentPrice": <price>,
      "oraclePrice": <oracle>,
      "epochTimestamp": <timestamp>
    }
    ```

  * Useful for UI or trigger-based strategies.([docs.filament.finance](https://docs.filament.finance/market-makers/filament-api?utm_source=chatgpt.com))

### D. On-chain Settlement Logic

* Upon matching orders, settlements occur via smart contracts.
  * Transfer assets/collateral between maker and taker.
  * Emit events for orders, fills, cancels, collateral changes, and PnL updates.
* Maintain on-chain order book or use on-chain/off-chain hybrid architecture (e.g., order execution off-chain, settlement on-chain).

---

## 4. Non-Functional Requirements

### Security

* Strong signature validation.
* Replay protection (e.g., unique order IDs, timestamp or nonce).
* Reentrancy and access control protection in smart contracts.

### Performance

* Efficient data flow (especially via WebSocket).
* Support near realtime for high-frequency environments.

### On-chain costs

* Optimize gas usage in settlement contracts (e.g., batching, minimal state writes).

### Scalability & Fault Tolerance

* Handle high volume (e.g., >40 orders/sec as Filament does)([Hedera Blog](https://blog.hedera.io/filament-hedera-networks-native-derivatives-dex-secures-1-1-million-in-seed-funding/?utm_source=chatgpt.com)).
* Failover for WebSocket or API service fallback.

---

## 5. Data Models & Entities

| Entity         | Fields                                                                                           |
|----------------|------------------------------------------------------------------------------------------------- |
| Order          | orderId, account, indexToken, isBuy, size, leverage, reduceOnly, orderType, signature, timestamp |
| Position       | account, asset, quantity, entryPrice, collateral, PnL, side, leverage                           |
| Margin Update  | account, asset, collateral, isIncrement, orderId, signature                                      |
| TPSL Setting   | account, asset, takeProfit, stopLoss, orderId, signature                                        |
| Settlement     | orderId, filledPrice, filledSize, counterparty, timestamp                                       |
| WebSocket Feed | For each asset: order book snapshot, live price, oracle price, timestamp                        |

---

## 6. Workflow Diagram (High-Level Sequence)

### Order Submission

* Market maker generates unique `orderId` → signs with private key → sends POST `/exchange` with payload.
* Backend validates signature, inserts order into order book (off-chain or on-chain), and broadcasts via WebSocket.

### Matching & Settlement

* Matching engine matches orders.
* Triggers on-chain settlement via smart contract.
* Emits events; order status updated (filled, partially filled, open).

### Collateral or TPSL Updates

* Maker sends signed API request → backend validates → updates position or creates TP/SL orders.

### Data Feeds

* Order book snapshots and live prices streamed to subscribed clients via WebSocket in real-time.

---

## 7. Acceptance Criteria (Examples)

- [ ] Successfully submit a limit order, and it appears in order book feed.
- [ ] Market maker can cancel their open order; it disappears from feed.
- [ ] Market or trigger orders execute correctly with slippage logic.
- [ ] Collateral can be added/removed; balances reflect on-chain state.
- [ ] Take-Profit / Stop-Loss orders are set and cancel/execute appropriately.
- [ ] Event logging in smart contracts matches API actions.
- [ ] WebSocket feeds deliver timely snapshots and price updates under load.

---

## Summary

Your PRD establishes a robust foundation for building an on-chain, signature-verified, order-book exchange with live streaming and smart contract settlement—closely mirroring Filament's design patterns([docs.filament.finance](https://docs.filament.finance/market-makers/filament-api?utm_source=chatgpt.com), [Hedera Blog](https://blog.hedera.io/filament-hedera-networks-native-derivatives-dex-secures-1-1-million-in-seed-funding/?utm_source=chatgpt.com)). Let me know if you'd like to expand on any section—technical specs, smart-contract interfaces, performance benchmarks—or tailor it to your specific blockchain stack or language of choice!