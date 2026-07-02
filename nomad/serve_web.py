#!/usr/bin/env python3
"""Tailnet server for the RGS web app — static Vite build + /api reverse proxy.

Serves web/dist at the root (SPA fallback: unknown extensionless paths get
index.html so client-side routes deep-link), and forwards /api/* to the backend
Worker with the Cloudflare Access service-token headers injected server-side —
the same pattern as the Vite dev proxy (web/vite.config.js), so the browser never
sees a credential. Phase 2 of the tailnet migration swaps these two headers for
the single X-RGS-Key wall secret.

Stdlib only (mirrors the wiki serve.py pattern). TLS + tailnet exposure are
upstream via `tailscale serve --https=8443`; this listens plain HTTP on loopback.

Usage: serve_web.py <port> <dist_dir>
Env:   RGS_BACKEND (default https://api.robogeosociety.xyz)
       CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET (vended; required for /api)
"""

import os
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BACKEND = os.environ.get("RGS_BACKEND", "https://api.robogeosociety.xyz").rstrip("/")
# Hop-by-hop / conflicting headers we never forward in either direction.
_SKIP = {
    "host", "connection", "keep-alive", "transfer-encoding", "content-length",
    "proxy-authenticate", "proxy-authorization", "te", "trailers", "upgrade",
    "accept-encoding",  # keep upstream responses identity-encoded (no gzip re-plumb)
}


class Handler(SimpleHTTPRequestHandler):
    # Set at startup; serve by absolute path and never chdir — rebuilds replace
    # the dist/ inode and would orphan a chdir'd process (wiki serve.py lesson).
    dist: str = "."

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=self.dist, **kwargs)

    # ---- /api reverse proxy --------------------------------------------------
    def _proxy(self):
        # Auth to the walled Worker: the pre-shared key (X-RGS-Key). During the
        # Phase-2 transition the vended Access headers are sent too when present —
        # inert once the Access apps are deleted.
        key = os.environ.get("RGS_KEY")
        cid = os.environ.get("CF_ACCESS_CLIENT_ID")
        sec = os.environ.get("CF_ACCESS_CLIENT_SECRET")
        if not key and not (cid and sec):
            self.send_error(502, "proxy credentials not configured")
            return
        upstream = BACKEND + self.path[len("/api"):]  # strip the /api prefix (backend routes are bare)
        body = None
        length = int(self.headers.get("Content-Length") or 0)
        if length:
            body = self.rfile.read(length)
        req = urllib.request.Request(upstream, data=body, method=self.command)
        for k, v in self.headers.items():
            if k.lower() not in _SKIP:
                req.add_header(k, v)
        if key:
            req.add_header("X-RGS-Key", key)
        if cid and sec:
            req.add_header("CF-Access-Client-Id", cid)
            req.add_header("CF-Access-Client-Secret", sec)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
                self.send_response(r.status)
                for k, v in r.headers.items():
                    if k.lower() not in _SKIP:
                        self.send_header(k, v)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:  # pass upstream errors through verbatim
            data = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:  # network failure to upstream
            self.send_error(502, f"upstream error: {e.__class__.__name__}")

    # ---- routing ---------------------------------------------------------------
    def _route(self, default):
        if self.path == "/api" or self.path.startswith("/api/"):
            return self._proxy()
        # SPA fallback: extensionless paths that aren't real files get index.html.
        clean = self.path.split("?", 1)[0]
        target = Path(self.dist) / clean.lstrip("/")
        if clean != "/" and not target.exists() and "." not in clean.rsplit("/", 1)[-1]:
            self.path = "/index.html"
        return default()

    def do_GET(self):  # noqa: N802 (http.server naming)
        self._route(super().do_GET)

    def do_HEAD(self):  # noqa: N802
        self._route(super().do_HEAD)

    def do_POST(self):  # noqa: N802
        if self.path == "/api" or self.path.startswith("/api/"):
            return self._proxy()
        self.send_error(405)

    do_PUT = do_DELETE = do_PATCH = do_POST

    def log_message(self, fmt, *args):  # quiet: one line per request, no noise
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))


def main():
    port, dist = int(sys.argv[1]), str(Path(sys.argv[2]).resolve())
    if not (Path(dist) / "index.html").exists():
        print(f"warning: {dist}/index.html missing (build not run yet?)", file=sys.stderr)
    Handler.dist = dist
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
