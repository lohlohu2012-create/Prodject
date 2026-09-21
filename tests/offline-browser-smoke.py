#!/usr/bin/env python3
import base64
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

FIXTURE = ROOT / "tests" / "fixtures" / "Chertеж11-geometry.dxf"
dxf_bytes = FIXTURE.read_bytes()

with tempfile.TemporaryDirectory(prefix="sheetnest-no-remnants-", ignore_cleanup_errors=True) as tmp:
    tmp = Path(tmp)
    dxf_path = tmp / "Чертеж11.dxf"
    dxf_path.write_bytes(dxf_bytes)

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
            str((ROOT / "public" / "index.html").resolve()),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    ws = None
    try:
        list_url = f"http://127.0.0.1:{port}/json/list"
        deadline = time.time() + 15
        target = None
        while time.time() < deadline:
            try:
                targets = json.load(urllib.request.urlopen(list_url, timeout=1))
                target = next((item for item in targets if item.get("type") == "page" and "webSocketDebuggerUrl" in item), None)
                if target:
                    break
            except Exception:
                pass
            time.sleep(0.2)
        if not target:
            raise RuntimeError("Chromium page target did not start")

        ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=8)
        counter = [0]

        def cdp(method, params=None, wait=True):
            counter[0] += 1
            ident = counter[0]
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

        cdp("Runtime.enable")
        cdp("Page.enable")
        eval_js("""
          window.__offlineErrors = [];
          window.addEventListener('error', e => window.__offlineErrors.push(String(e.message || e.error || e)));
          window.addEventListener('unhandledrejection', e => window.__offlineErrors.push(String(e.reason || e)));
          localStorage.removeItem('sheetnest.business-remnants.v2');
          document.getElementById('useRemnants').checked = false;
          document.getElementById('saveRemnants').checked = false;
        """)

        deadline = time.time() + 10
        while time.time() < deadline and eval_js("document.readyState") != "complete":
            time.sleep(0.1)

        assert eval_js("location.protocol") == "file:"
        assert eval_js("document.getElementById('useRemnants').checked") is False
        assert eval_js("typeof SvgNest.inspectSvg === 'function'") is True

        cdp("DOM.getDocument")
        node = cdp("DOM.querySelector", {"nodeId": 1, "selector": "#fileInput"})
        cdp("DOM.setFileInputFiles", {"nodeId": node["nodeId"], "files": [str(dxf_path)]})

        deadline = time.time() + 8
        geometry = ""
        while time.time() < deadline:
            geometry = eval_js("document.getElementById('geometryInfo').textContent")
            if "Чертеж11.dxf" in geometry:
                break
            time.sleep(0.1)
        else:
            raise RuntimeError(f"DXF was not imported: {geometry!r}")

        eval_js("""
          document.getElementById('sheetW').value = '1500';
          document.getElementById('sheetH').value = '3000';
          document.getElementById('margin').value = '10';
          document.getElementById('gap').value = '2';
          document.getElementById('rotations').value = '2';
          qualityConfig = () => ({seconds: 9, populationSize: 8, mutationRate: 1});
        """)

        cdp("Network.enable")
        cdp("Network.emulateNetworkConditions", {"offline": True, "latency": 0, "downloadThroughput": -1, "uploadThroughput": -1})

        eval_js("document.getElementById('nestButton').click()")

        samples = []
        black_events = []
        deadline = time.time() + 25
        final_status = ""
        while time.time() < deadline:
            final_status = eval_js("document.getElementById('status').textContent")
            info = eval_js("document.getElementById('runInfo').textContent")
            sample = eval_js("""
              (() => {
                const wrap = document.getElementById('canvasWrap');
                const svg = wrap.querySelector('.sheet-svg');
                const bin = svg?.querySelector('#sheet-bin,.bin');
                const r = wrap.getBoundingClientRect();
                return {
                  frame: typeof state !== 'undefined' ? state.searchFrames : 0,
                  cards: wrap.querySelectorAll('.result-card').length,
                  binFill: bin ? getComputedStyle(bin).fill : null,
                  binOpacity: bin ? getComputedStyle(bin).fillOpacity : null,
                  svgHtml: svg ? svg.outerHTML.slice(0, 600) : null,
                  clip: {x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.max(1, r.width), height: Math.max(1, r.height)}
                };
              })()
            """)
            if sample and sample.get("cards"):
                shot = cdp("Page.captureScreenshot", {
                    "format": "png",
                    "fromSurface": True,
                    "clip": {**sample["clip"], "scale": 1}
                }).get("data")
                dark_pct = None
                mean_lum = None
                if shot:
                    from PIL import Image
                    from io import BytesIO
                    img = Image.open(BytesIO(base64.b64decode(shot))).convert("L")
                    px = list(img.getdata())
                    if px:
                        mean_lum = sum(px) / len(px)
                        dark_pct = sum(v < 25 for v in px) / len(px)
                sample["darkPct"] = dark_pct
                sample["meanLum"] = mean_lum
                samples.append(sample)
                black = (
                    sample.get("binFill") == "rgb(0, 0, 0)"
                    or sample.get("binFill") == "rgba(0, 0, 0, 1)"
                    or (sample.get("meanLum") is not None and sample["meanLum"] < 35 and sample.get("darkPct", 0) > 0.75)
                )
                if black:
                    black_events.append({"info": info, "sample": sample})
            if final_status == "Раскрой рассчитан":
                break
            if final_status == "Ошибка":
                raise RuntimeError(json.dumps({
                    "status": final_status,
                    "runInfo": info,
                    "geometry": geometry,
                    "errors": eval_js("window.__offlineErrors || []")
                }, ensure_ascii=False))
            time.sleep(0.12)

        if final_status != "Раскрой рассчитан":
            raise RuntimeError(f"Nesting timed out: status={final_status!r}, info={info!r}")

        frames = eval_js("typeof state !== 'undefined' ? state.searchFrames : 0")
        parts = eval_js("document.getElementById('statParts').textContent")
        sheets = eval_js("document.getElementById('statSheets').textContent")

        result = {
            "status": final_status,
            "geometry": geometry,
            "useRemnants": eval_js("document.getElementById('useRemnants').checked"),
            "storedRemnants": eval_js("JSON.parse(localStorage.getItem('sheetnest.business-remnants.v2') || '[]').length"),
            "frames": frames,
            "parts": parts,
            "sheets": sheets,
            "samples": len(samples),
            "blackEvents": len(black_events),
            "blackEventDetails": black_events[:3],
            "lastSample": samples[-1] if samples else None,
            "consoleErrors": eval_js("window.__offlineErrors || []")
        }

        print(json.dumps(result, ensure_ascii=False, indent=2))

        if result["useRemnants"] is not False:
            raise RuntimeError("Remnant checkbox was not disabled")
        if int(frames) < 2:
            raise RuntimeError(f"Not enough live candidate frames observed: {frames}")
        if int(parts) < 1 or int(sheets) < 1:
            raise RuntimeError(f"Unexpected result stats: sheets={sheets}, parts={parts}")
        if black_events:
            raise RuntimeError("BLACK_SCREEN_DETECTED: " + json.dumps(result, ensure_ascii=False))
        if result["consoleErrors"]:
            raise RuntimeError("Browser errors detected: " + json.dumps(result["consoleErrors"], ensure_ascii=False))

        print("offline-browser-smoke (Чертеж11.dxf, remnants disabled): OK")
    finally:
        if ws:
            ws.close()
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
