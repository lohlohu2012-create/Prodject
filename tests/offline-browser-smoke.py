#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import websocket

ROOT = Path(__file__).resolve().parents[1]
BROWSER = os.environ.get("BROWSER") or shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome")
if not BROWSER:
    raise SystemExit("Chromium/Chrome was not found")

DXF = """0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
0
90
4
70
1
10
0
20
0
10
50
20
0
10
50
20
50
10
0
20
50
0
ENDSEC
0
EOF
"""

with tempfile.TemporaryDirectory(prefix="sheetnest-offline-") as tmp:
    tmp = Path(tmp)
    dxf_path = tmp / "sample.dxf"
    dxf_path.write_text(DXF, encoding="utf-8")
    profile = tmp / "chrome-profile"
    port = 9222
    proc = subprocess.Popen(
        [
            BROWSER,
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--remote-allow-origins=*",
            f"--remote-debugging-port={port}",
            f"--user-data-dir={profile}",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        version_url = f"http://127.0.0.1:{port}/json/version"
        deadline = time.time() + 15
        version = None
        while time.time() < deadline:
            try:
                version = json.load(urllib.request.urlopen(version_url, timeout=1))
                break
            except Exception:
                time.sleep(0.2)
        if not version:
            raise RuntimeError("Chromium remote debugging did not start")

        ws = websocket.create_connection(version["webSocketDebuggerUrl"], timeout=5)
        counter = 0

        def cdp(method, params=None, wait=True):
            nonlocal counter
            counter += 1
            ident = counter
            ws.send(json.dumps({"id": ident, "method": method, "params": params or {}}))
            if not wait:
                return None
            while True:
                message = json.loads(ws.recv())
                if message.get("id") == ident:
                    if "error" in message:
                        raise RuntimeError(f"{method}: {message['error']}")
                    return message.get("result", {})

        def eval_js(expression):
            result = cdp("Runtime.evaluate", {
                "expression": expression,
                "returnByValue": True,
                "awaitPromise": True,
            })
            if "exceptionDetails" in result:
                raise RuntimeError(str(result["exceptionDetails"]))
            return result["result"].get("value")

        cdp("Page.enable")
        cdp("Runtime.enable")
        cdp("Page.navigate", {"url": (ROOT / "public" / "index.html").as_uri()})

        deadline = time.time() + 10
        while time.time() < deadline:
            if eval_js("document.readyState") == "complete":
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("HTML did not finish loading from file://")

        assert eval_js("location.protocol") == "file:"
        assert eval_js("document.title") == "SheetNest — Metal Nesting"

        cdp("DOM.getDocument")
        node = cdp("DOM.querySelector", {"nodeId": 1, "selector": "#fileInput"})
        node_id = node["nodeId"]
        cdp("DOM.setFileInputFiles", {"nodeId": node_id, "files": [str(dxf_path)]})
        eval_js("document.querySelector('#fileInput').dispatchEvent(new Event('change', {bubbles:true}))")

        deadline = time.time() + 5
        while time.time() < deadline:
            text = eval_js("document.getElementById('geometryInfo').textContent")
            if "Загружено" in text:
                break
            time.sleep(0.1)
        else:
            raise RuntimeError(f"DXF was not imported: {text!r}")

        eval_js("""
          document.getElementById('sheetW').value='200';
          document.getElementById('sheetH').value='200';
          document.getElementById('margin').value='0';
          document.getElementById('gap').value='1';
          document.getElementById('quantity').value='1';
          document.getElementById('rotations').value='1';
          qualityConfig = () => ({seconds: 0.5, populationSize: 4, mutationRate: 1});
        """)

        eval_js("document.getElementById('nestButton').click()")

        deadline = time.time() + 15
        while time.time() < deadline:
            status = eval_js("document.getElementById('status').textContent")
            run_info = eval_js("document.getElementById('runInfo').textContent")
            if status == "Раскрой рассчитан":
                break
            if status == "Ошибка" or "не удалось" in (run_info or "").lower():
                raise RuntimeError(f"Nesting failed: status={status!r}, info={run_info!r}")
            time.sleep(0.2)
        else:
            raise RuntimeError(f"Nesting timed out: status={status!r}, info={run_info!r}")

        sheets = eval_js("document.getElementById('statSheets').textContent")
        parts = eval_js("document.getElementById('statParts').textContent")
        if int(sheets) < 1 or int(parts) < 1:
            raise RuntimeError(f"Unexpected nesting stats: sheets={sheets}, parts={parts}")

        print("offline-browser-smoke: OK")
        print("protocol:", eval_js("location.protocol"))
        print("title:", eval_js("document.title"))
        print("dxf:", eval_js("document.getElementById('geometryInfo').textContent"))
        print("status:", eval_js("document.getElementById('status').textContent"))
        print("sheets:", sheets, "parts:", parts)
        ws.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
