# Project Progress: On-Chain Order-Book Market Maker Settlement System

## Phase 1: Project Setup and Core Infrastructure

- [ ] Initialize NestJS project.
- [ ] Set up basic project structure (modules, controllers, services).
- [ ] Implement cryptographic signature verification utility.

## Phase 2: Implement API Endpoints

- [ ] `POST /exchange`: Implement limit and market order placement.
- [ ] `POST /cancel`: Implement order cancellation.
- [ ] `POST /update-margin`: Implement margin adjustments.
- [ ] `POST /update-tpsl`: Implement take-profit/stop-loss updates.

## Phase 3: WebSocket Implementation

- [ ] `/ws/order-book`: Implement real-time order book state feed.
- [ ] `/ws/live-feed`: Implement live price feed.

## Phase 4: On-chain Integration (Mock)

- [ ] Mock on-chain settlement logic.
- [ ] Emit mock events for trades and state changes.

## Phase 5: Testing and Documentation

- [ ] Write unit and integration tests for all endpoints.
- [ ] Document API endpoints and WebSocket usage.
