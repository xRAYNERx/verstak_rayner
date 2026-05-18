import asyncio
import json
import subprocess
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import sys
from pathlib import Path

# Принудительно устанавливаем UTF-8 для вывода в консоль Python
if sys.platform == 'win32':
    import _locale
    _locale._getdefaultlocale = (lambda *args: ['en_US', 'utf8'])

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_PATH = r"C:\Users\Pavel\AppData\Roaming\npm\gemini.ps1"
BASE_DIR = Path(r"C:\Users\Pavel\geminigrok")
SKILLS_DIR = Path(r"C:\Users\Pavel\.claude\skills")

class GeminiBridge:
    async def ask(self, message: str, send_callback):
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        
        powershell_script = f"$OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 > $null; & '{GEMINI_PATH}' '{message}'"
        
        process = await asyncio.create_subprocess_exec(
            "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", powershell_script,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
            cwd="C:/Users/Pavel"
        )

        while True:
            line = await process.stdout.readline()
            if not line:
                break
            try:
                text = line.decode('utf-8')
            except UnicodeDecodeError:
                text = line.decode('cp866', errors='replace')
            
            if any(x in text for x in ["Warning:", "Ripgrep", "Active code page: 65001"]):
                continue
                
            await send_callback(json.dumps({"type": "text", "content": text}))
        
        await process.wait()
        await send_callback(json.dumps({"type": "status", "content": "done"}))

bridge = GeminiBridge()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            request = json.loads(data)
            if request["type"] == "message":
                await bridge.ask(request["content"], websocket.send_text)
    except WebSocketDisconnect:
        pass

@app.get("/api/skills")
async def get_skills():
    skills = []
    if SKILLS_DIR.exists():
        for f in SKILLS_DIR.glob("*.md"):
            name = f.stem
            if name.startswith("_"): continue
            skills.append({"name": name, "color": "#58a6ff"})
    return skills

@app.get("/")
async def get():
    path = BASE_DIR / "studio.html"
    with open(path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5556)
