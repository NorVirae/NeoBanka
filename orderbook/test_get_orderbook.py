import requests
import json

url = 'http://0.0.0.0:8000/api/orderbook'

payloadString = json.dumps({
    "symbol": "WETH_USDC"
})

payload = {"payload": payloadString}
resp = requests.post(url=url, data=payload)

print(resp.json())