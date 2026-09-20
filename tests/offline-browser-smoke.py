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

with tempfile.TemporaryDirectory(prefix="sheetnest-offline-", ignore_cleanup_errors=True) as tmp:
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
            str((ROOT / "public" / "index.html").resolve()),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

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

        ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=5)
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
        cdp("Network.enable")
        eval_js("window.__offlineErrors=[]; window.addEventListener('error', e => window.__offlineErrors.push(String(e.message || e.error || e)));")

        deadline = time.time() + 10
        while time.time() < deadline:
            if eval_js("document.readyState") == "complete":
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("HTML did not finish loading from file://")

        assert eval_js("location.protocol") == "file:"
        assert eval_js("document.querySelectorAll('#shapeLibrary .shape-card').length") == 6
        assert eval_js("betterNestingCandidate({results:[1,2],placed:2,total:2,efficiency:0.2},{results:[1],placed:1,total:2,efficiency:0.9})") is True
        assert eval_js("betterNestingCandidate({results:[1],placed:1,total:2,efficiency:0.9},{results:[1,2],placed:2,total:2,efficiency:0.2})") is False
        assert eval_js("typeof SvgNest.inspectSvg === 'function'") is True
        assert eval_js("""(() => {
          const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 100"><path d="M0 0H80V80H0Z"/><path d="M140 0H220V80H140Z"/></svg>';
          const info=SvgNest.inspectSvg(svg);
          return info.parts===2 && info.contours===2;
        })()""") is True
        assert eval_js("betterNestingCandidate({results:[1],placed:1,total:2,efficiency:0.9},{results:[1],placed:0,total:2,efficiency:0.2})") is True
        eval_js("""
          const cards=Array.from(document.querySelectorAll('#shapeLibrary .shape-card'));
          const rect=cards.find(card=>card.textContent.includes('Прямоугольник'));
          const circle=cards.find(card=>card.textContent.includes('Круг'));
          rect.querySelector('.shape-card-qty').value='2';
          rect.querySelector('.shape-add').click();
          circle.querySelector('.shape-card-qty').value='1';
          circle.querySelector('.shape-add').click();
        """)
        assert eval_js("typeof state !== 'undefined' && state.libraryParts.length") == 2
        assert eval_js("typeof state !== 'undefined' && state.libraryParts.find(item => item.id === 'rect').quantity") == 2
        assert eval_js("typeof state !== 'undefined' && state.libraryParts.find(item => item.id === 'circle').quantity") == 1
        assert eval_js("requestedPartCount()") == 3
        assert eval_js("(() => { const svg=buildNestingSvg(600,400); return (svg.match(/data-sheetnest-stage-instance=/g)||[]).length; })()") == 3
        assert eval_js("(() => { const svg=buildNestingSvg(600,400); return (svg.match(/data-sheetnest-source-instance-id=/g)||[]).length >= 3; })()") is True
        assert eval_js("(() => { const parsed=SvgNest.parsesvg(buildNestingSvg(600,400,1)); return Boolean(parsed && parsed.querySelector('#sheet-bin')); })()") is True
        eval_js("document.getElementById('clearShapes').click()")
        assert eval_js("document.title") == "SheetNest — Metal Nesting"
        cdp("Network.emulateNetworkConditions", {"offline": True, "latency": 0, "downloadThroughput": -1, "uploadThroughput": -1})

        cdp("DOM.getDocument")
        node = cdp("DOM.querySelector", {"nodeId": 1, "selector": "#fileInput"})
        node_id = node["nodeId"]
        cdp("DOM.setFileInputFiles", {"nodeId": node_id, "files": [str(dxf_path)]})
        eval_js("document.querySelector('#fileInput').dispatchEvent(new Event('change', {bubbles:true}))")

        deadline = time.time() + 5
        while time.time() < deadline:
            text = eval_js("document.getElementById('geometryInfo').textContent")
            if "sample.dxf" in text:
                break
            time.sleep(0.1)
        else:
            raise RuntimeError(f"DXF was not imported: {text!r}")

        eval_js("""
          document.getElementById("sheetW").value="300";
          document.getElementById("sheetH").value="300";
          document.getElementById('margin').value='0';
          document.getElementById('gap').value='1';
          const rectCard=Array.from(document.querySelectorAll("#shapeLibrary .shape-card")).find(card=>card.textContent.includes("Прямоугольник"));
          rectCard.querySelector(".shape-card-qty").value="2";
          rectCard.querySelector(".shape-add").click();
          document.getElementById('rotations').value='1';
          qualityConfig = () => ({seconds: 5, populationSize: 4, mutationRate: 1});
        """)

        debug_counts = eval_js("({requested:requestedPartCount(), custom:state.customParts.map(p => ({name:p.name, quantity:p.quantity, nestingUnits:p.nestingUnits, contours:p.contours, holes:p.holes})), library:state.libraryParts.map(p => ({id:p.id, quantity:p.quantity}))})")
        print("debug counts:", json.dumps(debug_counts, ensure_ascii=False))
        if debug_counts["requested"] != 3:
            raise RuntimeError("Unexpected requested count before nesting: " + json.dumps(debug_counts, ensure_ascii=False))
        eval_js("document.getElementById('nestButton').click()")

        deadline = time.time() + 15
        while time.time() < deadline:
            status = eval_js("document.getElementById('status').textContent")
            run_info = eval_js("document.getElementById('runInfo').textContent")
            if status == "Раскрой рассчитан":
                break
            if status == "Ошибка" or "не удалось" in (run_info or "").lower():
                diagnostics = {
                    "status": status,
                    "runInfo": run_info,
                    "geometry": eval_js("document.getElementById('geometryInfo').textContent"),
                    "customParts": eval_js("typeof state !== 'undefined' ? state.customParts.length : -1"),
                    "resultCount": eval_js("typeof state !== 'undefined' ? state.resultSvgs.length : -1"),
                    "engineWorking": eval_js("typeof SvgNest !== 'undefined' ? SvgNest.working : null"),
                    "consoleErrors": eval_js("window.__offlineErrors || []"),
                    "sourceSvg": eval_js("typeof state !== 'undefined' && state.sourceSvg ? state.sourceSvg : ''")
                }
                raise RuntimeError("Nesting failed: " + json.dumps(diagnostics, ensure_ascii=False))
            time.sleep(0.2)
        else:
            raise RuntimeError(f"Nesting timed out: status={status!r}, info={run_info!r}")

        sheets = eval_js("document.getElementById('statSheets').textContent")
        frames = eval_js("typeof state !== \"undefined\" ? state.searchFrames : 0")
        parts = eval_js("document.getElementById('statParts').textContent")
        if int(sheets) < 1 or int(parts) < 1:
            raise RuntimeError(f"Unexpected nesting stats: sheets={sheets}, parts={parts}")
        if int(parts) != 3:
            raise RuntimeError(f"Mixed parts were not all placed: parts={parts}")
        unit_ids = eval_js("Array.from(document.querySelectorAll('#canvasWrap g[data-sheetnest-unit-id]')).map(node => node.getAttribute('data-sheetnest-unit-id'))")
        if len(unit_ids) != len(set(unit_ids)) or len(unit_ids) != 3:
            raise RuntimeError(f"Placed unit ids are not one-to-one: {unit_ids!r}")
        diagnostic_count = eval_js("document.querySelectorAll('#diagnosticsList .diagnostic-row').length")
        diagnostic_bad = eval_js("document.querySelectorAll('#diagnosticsList .diagnostic-row.bad').length")
        diagnostic_panel_hidden = eval_js("document.getElementById('diagnosticsPanel').hidden")
        diagnostic_ok_status = eval_js("Array.from(document.querySelectorAll('#diagnosticsList .diagnostic-row')).every(row => row.classList.contains('ok'))")
        if diagnostic_count != 3 or diagnostic_bad != 0 or diagnostic_panel_hidden or not diagnostic_ok_status:
            raise RuntimeError(f"Instance diagnostics mismatch: rows={diagnostic_count}, bad={diagnostic_bad}, hidden={diagnostic_panel_hidden}, all_ok={diagnostic_ok_status}")
        if int(frames) < 1:
            raise RuntimeError(f"Live nesting preview did not receive candidate frames: frames={frames}")

        assert eval_js("document.getElementById('zoomFit').textContent") == "100%"
        eval_js("document.getElementById('zoomIn').click()")
        deadline = time.time() + 2
        while time.time() < deadline and eval_js("document.getElementById('zoomFit').textContent") != "125%":
            time.sleep(0.05)
        assert eval_js("document.getElementById('zoomFit').textContent") == "125%"
        width_125 = eval_js("document.querySelector('#canvasWrap .result-card').getBoundingClientRect().width")
        eval_js("document.querySelector('#canvasWrap').dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true,clientX:400,clientY:300}))")
        deadline = time.time() + 2
        while time.time() < deadline and eval_js("document.getElementById('zoomFit').textContent") == "125%":
            time.sleep(0.05)
        assert eval_js("document.getElementById('zoomFit').textContent") != "125%"
        eval_js("document.getElementById('zoomFit').click()")
        assert eval_js("document.getElementById('zoomFit').textContent") == "100%"
        width_100 = eval_js("document.querySelector('#canvasWrap .result-card').getBoundingClientRect().width")
        if width_125 <= width_100:
            raise RuntimeError(f"Zoom did not enlarge workspace: 125% width={width_125}, 100% width={width_100}")

        print("offline-browser-smoke: OK")
        print("protocol:", eval_js("location.protocol"))
        print("title:", eval_js("document.title"))
        print("dxf:", eval_js("document.getElementById('geometryInfo').textContent"))
        print("status:", eval_js("document.getElementById('status').textContent"))
        print("sheets:", sheets, "parts:", parts, "frames:", frames)
        ws.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
