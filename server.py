"""H:\\mpa-visualizer\\server.py — multi-tab MPA visualizer router.

Thin HTTP server that:
- serves the top-level shell (tab nav + active-tab loader),
- forwards `/stream?tab=<name>` SSE requests to the matching driver,
- tears down a single active worker on `/restart` or new connection.

Single-client by design (matches the legacy monolith). The server keeps at
most one running worker. Switching tabs or reconnecting kills the previous
run; this avoids cross-tab compute interference and keeps state cheap.

Drivers live in `drivers/`. Each driver implements the `DriverFactory`
protocol from `drivers/base.py` and registers itself in `_DRIVER_MODULES`
below. A driver that fails to import (e.g. its substrate repo is missing)
is caught and logged; other tabs continue to work.

Origin: ported verbatim from H:/mpc-visualizer/server.py with the maze
demo's `brain` driver removed (mpc-brain's maze stays in mpc-brain), the
`brain-spectrum` slot reserved for the v8 mpa-brain driver (added in a
follow-up session per
H:/mpc-visualizer/docs/mpa_visualizer_migration_handoff.md phase 3), and
env-var prefixes renamed MPC_VIS_* -> MPA_VIS_*.
"""
from __future__ import annotations

import importlib
import json
import os
import queue
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional
from urllib.parse import parse_qs, urlparse

from drivers.base import DriverFactory


_HERE = os.path.dirname(os.path.abspath(__file__))


# ── Driver registry ────────────────────────────────────────────────────────
#
# Each entry maps a tab name to a (module, factory_class_name) pair. We
# import lazily so a broken substrate dependency only disables its own tab.
#
# brain-spectrum is queued for the next session per
# mpa_visualizer_migration_handoff.md phase 3; uncomment the line once
# `drivers/brain_spectrum.py` lands.

_DRIVER_MODULES: dict[str, tuple[str, str]] = {
    "glass": ("drivers.glass_aging", "GlassAgingFactory"),
    "quantum": ("drivers.quantum_syndrome", "QuantumSyndromeFactory"),
    "cross": ("drivers.cross_substrate", "CrossSubstrateFactory"),
    # "brain-spectrum": ("drivers.brain_spectrum", "BrainSpectrumFactory"),
}


def _load_factories() -> dict[str, DriverFactory]:
    out: dict[str, DriverFactory] = {}
    for name, (modpath, clsname) in _DRIVER_MODULES.items():
        try:
            mod = importlib.import_module(modpath)
            cls = getattr(mod, clsname)
            out[name] = cls()
        except Exception as exc:  # pragma: no cover — diagnostic
            sys.stderr.write(
                f"[driver-load] {name}: {type(exc).__name__}: {exc}\n"
            )
    return out


_FACTORIES: dict[str, DriverFactory] = _load_factories()


# ── HTTP server ────────────────────────────────────────────────────────────


class VizServer(ThreadingHTTPServer):
    """Holds the current worker. Single client at a time; reconnects or
    /restart tear down the previous worker."""

    worker = None  # type: ignore[assignment]
    worker_thread: Optional[threading.Thread] = None
    _runner_lock = threading.Lock()

    def stop_runner(self) -> None:
        with self._runner_lock:
            w = self.worker
            t = self.worker_thread
            self.worker = None
            self.worker_thread = None
        if w is not None:
            try:
                w.stop()
            except Exception:
                pass
        if t is not None and t.is_alive():
            t.join(timeout=2.0)


class Handler(BaseHTTPRequestHandler):
    server: VizServer  # type: ignore

    def log_message(self, fmt, *args):
        if "200 -" in (fmt % args):
            return
        sys.stderr.write(f"[{self.log_date_time_string()}] {fmt % args}\n")

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            return self._serve_static_file("shell.html", "text/html")
        if path == "/tabs.json":
            return self._serve_tabs_json()
        if path.startswith("/static/"):
            rel = path[len("/static/"):]
            if ".." in rel:
                return self.send_error(404)
            return self._serve_static_path(rel)
        if path.startswith("/tab/"):
            # /tab/<name> serves the tab page (HTML).
            rest = path[len("/tab/"):]
            if "/" in rest:
                return self.send_error(404)
            name = rest
            if name not in _FACTORIES:
                return self.send_error(404, f"unknown tab: {name}")
            # Tabs each have a complete HTML page at static/<name>/index.html.
            target = os.path.join(_HERE, "static", name, "index.html")
            if not os.path.isfile(target):
                return self.send_error(
                    404, f"tab page missing: static/{name}/index.html",
                )
            return self._serve_static_path(f"{name}/index.html")
        if path == "/stream":
            return self._handle_sse()
        if path == "/restart":
            self.server.stop_runner()
            self.send_response(204)
            self.end_headers()
            return
        self.send_error(404)

    # ── Static helpers ─────────────────────────────────────────────────

    _CONTENT_TYPES = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
    }

    def _serve_static_file(self, name: str, content_type: str):
        full = os.path.join(_HERE, "static", name)
        if not os.path.isfile(full):
            return self.send_error(404)
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", content_type + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _serve_static_path(self, rel: str):
        full = os.path.join(_HERE, "static", rel)
        if not os.path.isfile(full):
            return self.send_error(404)
        ext = os.path.splitext(full)[1].lower()
        ct = self._CONTENT_TYPES.get(ext, "application/octet-stream")
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ct + ("; charset=utf-8"
                          if ct.startswith(("text/", "application/")) else ""))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # ── /tabs.json — drives the shell's tab nav ────────────────────────

    def _serve_tabs_json(self):
        tabs = []
        for name, factory in _FACTORIES.items():
            spec = factory.spec
            tabs.append({
                "name": spec.name,
                "display_name": spec.display_name,
                "blurb": spec.blurb,
                "url": f"/tab/{spec.name}",
            })
        body = json.dumps({"tabs": tabs}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ── /stream — SSE forwarding to the active driver ──────────────────

    def _handle_sse(self):
        qs = parse_qs(urlparse(self.path).query)
        # Default tab: pick whatever's first in _FACTORIES (used to be 'brain';
        # mpa-visualizer drops the maze tab and lets _FACTORIES iteration
        # decide).
        default_tab = next(iter(_FACTORIES), "")
        tab = (qs.get("tab", [default_tab])[0]).strip()
        factory = _FACTORIES.get(tab)
        if factory is None:
            self.send_error(404, f"unknown tab: {tab}")
            return

        self.server.stop_runner()

        q: queue.Queue = queue.Queue(maxsize=10000)
        try:
            worker = factory.make_worker(q, qs)
        except Exception as exc:
            self.send_error(500, f"driver init failed: {exc}")
            return

        self.server.worker = worker
        t = threading.Thread(target=worker.run, daemon=True)
        self.server.worker_thread = t
        t.start()

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        try:
            while not worker._stop.is_set():
                try:
                    event = q.get(timeout=2.0)
                except queue.Empty:
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
                    continue
                self.wfile.write(
                    ("data: " + json.dumps(event) + "\n\n").encode("utf-8")
                )
                self.wfile.flush()
                if event.get("type") == "shutdown":
                    break
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            try:
                worker.stop()
            except Exception:
                pass


# ── Main ───────────────────────────────────────────────────────────────────


def main():
    host = os.environ.get("MPA_VIS_HOST", os.environ.get("MPC_VIS_HOST", "127.0.0.1"))
    port = int(os.environ.get("MPA_VIS_PORT", os.environ.get("MPC_VIS_PORT", "18765")))
    try:
        server = VizServer((host, port), Handler)
    except PermissionError as exc:
        sys.stderr.write(
            f"Could not bind {host}:{port}: {exc}\n"
            "On Windows the port may be in Hyper-V's excluded range. Try "
            "MPA_VIS_PORT=18900 or 30000+.\n"
        )
        sys.exit(1)
    print(f"MPA visualizer (multi-tab) running at http://{host}:{port}")
    print(f"Loaded drivers: {sorted(_FACTORIES)}")
    print("Open the URL in a browser. Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping...")
        server.stop_runner()
        server.server_close()


if __name__ == "__main__":
    main()
