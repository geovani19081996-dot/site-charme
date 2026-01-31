# -*- coding: utf-8 -*-
import http.server
import socketserver
import os
import json
from datetime import datetime, timezone

ROOT_DIR = r"C:\Charme\live"
HOST = "127.0.0.1"
PORT = 8790 # <- LIVE SERVER DO SITE (8787 é do painel)
ALLOWED_ORIGINS = {
    "https://www.charmecosmeticos.com",
    "https://charmecosmeticos.com",
}

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def log_message(self, format, *args):
        # silence to avoid console spam
        pass

    def end_headers(self):
        # No cache at browser/proxies
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")

        # CORS (site no Pages consegue buscar o live-data)
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        else:
            self.send_header("Access-Control-Allow-Origin", "*")

        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def list_directory(self, path):
        # block directory listing
        self.send_error(404, "No directory listing")
        return None

def ensure_status_file():
    status_path = os.path.join(ROOT_DIR, "data", "private", "status.json")
    os.makedirs(os.path.dirname(status_path), exist_ok=True)
    if not os.path.exists(status_path):
        payload = {
            "ok": False,
            "message": "live server started, waiting first loop",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        with open(status_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

def main():
    os.makedirs(ROOT_DIR, exist_ok=True)
    ensure_status_file()

    with socketserver.TCPServer((HOST, PORT), Handler) as httpd:
        print(f"[LIVE] Serving {ROOT_DIR} on http://{HOST}:{PORT}")
        httpd.serve_forever()

if __name__ == "__main__":
    main()


