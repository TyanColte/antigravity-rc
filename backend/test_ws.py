import asyncio
import websockets
import json

async def test():
    async with websockets.connect("ws://localhost:23457/ws") as ws:
        print("Connected!")
        data = await ws.recv()
        print("Received history length:", len(json.loads(data).get("messages", [])))
        
        while True:
            msg = await ws.recv()
            print("Received realtime message:", msg[:100])

asyncio.run(test())
