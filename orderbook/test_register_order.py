import requests
import json

url = 'http://0.0.0.0:8000/api/register_order'

orderBook = dict(
    baseAsset="0x138d34d08bc9Ee1f4680f45eCFb8fc8e4b0ca018",
    quoteAsset="0x8b2f38De30098bA09d69bd080A3814F4aE536A22",
    lastTradePrice=95362.08,
    priceChangeIndicator="up",
    asks=[
        {
            "price": 2552.40,
            "amount": 0.00186,
            "total": 4.74746
        },
        {
            "price": 2550.00,
            "amount": 0.00063,
            "total": 1.60650
        },
        {
            "price": 2546.86,
            "amount": 0.01534,
            "total": 39.06883
        },
        {
            "price": 2545.25,
            "amount": 0.00078,
            "total": 1.98530
        },
        {
            "price": 2545.93,
            "amount": 0.01569,
            "total": 39.94564
        },
        {
            "price": 2541.10,
            "amount": 0.00186,
            "total": 4.72645
        },
        {
            "price": 2536.25,
            "amount": 0.00078,
            "total": 1.97828
        },
        {
            "price": 2536.09,
            "amount": 0.96831,
            "total": 2455.71365
        },
        {
            "price": 2536.08,
            "amount": 0.58338,
            "total": 1479.50240
        }
    ],
    bids=[
        {
            "price": 2526.33,
            "amount": 0.00131,
            "total": 3.30949
        },
        {
            "price": 2526.32,
            "amount": 1.88091,
            "total": 4751.65491
        },
        {
            "price": 2526.31,
            "amount": 0.00095,
            "total": 2.39999
        },
        {
            "price": 2526.29,
            "amount": 0.00104,
            "total": 2.62734
        },
        {
            "price": 2526.27,
            "amount": 0.00002,
            "total": 0.05053
        },
        {
            "price": 2526.26,
            "amount": 0.00002,
            "total": 0.05053
        },
        {
            "price": 2525.44,
            "amount": 0.00002,
            "total": 0.05051
        },
        {
            "price": 2524.92,
            "amount": 0.00369,
            "total": 9.31695
        },
        {
            "price": 2524.73,
            "amount": 0.01538,
            "total": 38.83035
        }
    ]
)

for ask in orderBook["asks"]:
    payloadString = json.dumps({
        "account": "0x1234567890123456789012345678901234567890",
        "price": ask["price"],
        "quantity": ask["amount"],
        "side": "ask",
        "baseAsset": orderBook["baseAsset"],
        "quoteAsset": orderBook["quoteAsset"]
    })

    payload = {"payload": payloadString}
    resp = requests.post(url=url, data=payload)

    print(resp.json())

for bid in orderBook["bids"]:
    payloadString = json.dumps({
        "account": "0x1234567890123456789012345678901234567890",
        "price": bid["price"],
        "quantity": bid["amount"],
        "side": "bid",
        "baseAsset": orderBook["baseAsset"],
        "quoteAsset": orderBook["quoteAsset"]
    })

    payload = {"payload": payloadString}
    resp = requests.post(url=url, data=payload)

    print(resp.json())
