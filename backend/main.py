import os
import json
import asyncio
import subprocess
import base64
import uuid
import re
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

app = FastAPI()
active_connections = []

# Assuming this is run directly on the host, expand the home directory
HOME_DIR = os.path.expanduser("~")
CONVERSATION_ID = os.environ.get("CONVERSATION_ID", "your-conversation-id-here")
TRANSCRIPT_PATH = f"{HOME_DIR}/.gemini/antigravity-cli/brain/{CONVERSATION_ID}/.system_generated/logs/transcript_full.jsonl"
TMUX_SESSION = os.environ.get("TMUX_SESSION", "0") # The name or ID of the tmux session

# Define WebSocket route first
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    
    # Send history on connect
    if os.path.exists(TRANSCRIPT_PATH):
        history = []
        with open(TRANSCRIPT_PATH, "r") as f:
            for line in f:
                try:
                    data = json.loads(line.strip())
                    data["message_type"] = "step"
                    history.append(data)
                except:
                    pass
        await websocket.send_json({"type": "history", "messages": history})

    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "command":
                command_text = data.get("text", "")
                
                if "image_data" in data:
                    try:
                        header, encoded = data["image_data"].split(",", 1)
                        image_bytes = base64.b64decode(encoded)
                        if len(image_bytes) > 10 * 1024 * 1024:
                            raise ValueError("Image payload exceeds 10MB limit")
                        
                        ext = ".png"
                        if "jpeg" in header or "jpg" in header:
                            ext = ".jpg"
                        elif "webp" in header:
                            ext = ".webp"
                            
                        filename = f"rc_upload_{uuid.uuid4().hex[:8]}{ext}"
                        filepath = f"/tmp/{filename}"
                        
                        with open(filepath, "wb") as f:
                            f.write(image_bytes)
                            
                        command_text = f"[Attached Image: {filepath}]\n{command_text}".strip()
                    except Exception as e:
                        print(f"Failed to process image upload: {e}")
                
                await inject_command(command_text)
            elif data.get("type") == "halt":
                try:
                    p = await asyncio.create_subprocess_exec("tmux", "send-keys", "-t", TMUX_SESSION, "C-c")
                    await p.communicate()
                    print("Sent Ctrl+C to tmux session to halt agent.")
                except Exception as e:
                    print(f"Error halting agent: {e}")
            elif data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except Exception as e:
        if websocket in active_connections:
            active_connections.remove(websocket)

async def tail_transcript():
    """Continuously tail the JSONL file and broadcast new lines."""
    if not os.path.exists(TRANSCRIPT_PATH):
        print(f"Waiting for transcript file at {TRANSCRIPT_PATH}")
        while not os.path.exists(TRANSCRIPT_PATH):
            await asyncio.sleep(1)

    with open(TRANSCRIPT_PATH, "r") as f:
        # Jump to the end for new lines
        f.seek(0, os.SEEK_END)
        while True:
            current_pos = f.tell()
            line = f.readline()
            if not line:
                # Check if file was truncated
                try:
                    if os.path.getsize(TRANSCRIPT_PATH) < current_pos:
                        f.seek(0)
                        continue
                except:
                    pass
                await asyncio.sleep(0.5)
                continue
            if not line.endswith('\n'):
                f.seek(current_pos)
                await asyncio.sleep(0.5)
                continue
                
            try:
                data = json.loads(line.strip())
                data["message_type"] = "step"
                stale_connections = []
                for connection in list(active_connections):
                    try:
                        await connection.send_json(data)
                    except Exception:
                        stale_connections.append(connection)
                        
                for stale in stale_connections:
                    if stale in active_connections:
                        active_connections.remove(stale)
            except Exception as e:
                print(f"Error parsing/broadcasting transcript line: {e}")

background_tasks = set()

@app.on_event("startup")
async def startup_event():
    t1 = asyncio.create_task(tail_transcript())
    background_tasks.add(t1)
    t1.add_done_callback(background_tasks.discard)
    
    t2 = asyncio.create_task(poll_tmux_status())
    background_tasks.add(t2)
    t2.add_done_callback(background_tasks.discard)

async def poll_tmux_status():
    last_status = None
    while True:
        await asyncio.sleep(0.5)
        if not active_connections:
            last_status = None
            continue
            
        try:
            process = await asyncio.create_subprocess_exec(
                "tmux", "capture-pane", "-t", TMUX_SESSION, "-p",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            stdout, _ = await process.communicate()
            if stdout:
                lines = stdout.decode("utf-8").split("\n")
                current_status = None
                
                for line in reversed(lines[-20:]):
                    line = line.strip()
                    if not line or line.startswith('>') or line.startswith('▸'):
                        continue
                    # Only match spinner-style status lines (short, capitalized, single phrase ending in ...)
                    if line.endswith('...') and len(line) < 80:
                        # Filter out user-typed content
                        if any(c in line for c in ['?', '!', ',', '"', "'", '(', ')']):
                            continue
                        # Strictly require a Braille spinner character [⠀-⣿] before the status text
                        match = re.search(r'^.*[⠀-⣿]\s+([A-Z][a-zA-Z\s]+)\.\.\.\s*$', line)
                        if match:
                            current_status = match.group(1).strip() + "..."
                            break
                
                if current_status is None:
                    current_status = 'IDLE'
                
                if current_status != last_status:
                    last_status = current_status
                    msg = {
                        "type": "agent_status",
                        "status": current_status
                    }
                    stale_connections = []
                    for connection in list(active_connections):
                        try:
                            await connection.send_json(msg)
                        except Exception:
                            stale_connections.append(connection)
                            
                    for stale in stale_connections:
                        if stale in active_connections:
                            active_connections.remove(stale)
        except Exception as e:
            print(f"Error polling tmux status: {e}")

async def inject_command(text: str):
    """Natively inject text into the host's tmux session."""
    try:
        buffer_name = f"buf_{uuid.uuid4().hex[:8]}"
        
        process = await asyncio.create_subprocess_exec(
            "tmux", "load-buffer", "-b", buffer_name, "-",
            stdin=asyncio.subprocess.PIPE
        )
        await process.communicate(input=text.encode('utf-8'))
        
        p2 = await asyncio.create_subprocess_exec(
            "tmux", "paste-buffer", "-b", buffer_name, "-p", "-d", "-t", TMUX_SESSION
        )
        await p2.communicate()
        
        p3 = await asyncio.create_subprocess_exec(
            "tmux", "send-keys", "-t", TMUX_SESSION, "C-m"
        )
        await p3.communicate()
        
        print(f"Injected payload of length {len(text)}")
    except Exception as e:
        print(f"Error injecting command into tmux: {e}")

# Mount frontend directory for static files at root
# This must come AFTER all API/WS routes so it doesn't intercept them
frontend_path = os.path.join(os.path.dirname(__file__), "../frontend")
app.mount("/", StaticFiles(directory=frontend_path, html=True), name="static")
