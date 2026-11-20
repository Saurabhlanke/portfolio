"""Local preview: serves public/ and forwards /api/* to the FPL API (like the Cloudflare function).
Run:  python3 dev.py   then open http://localhost:8788"""
import http.server, os, re, urllib.request
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public')
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def do_GET(self):
        if not self.path.startswith('/api/'): return super().do_GET()
        path, _, qs = self.path[5:].partition('?')
        if not re.fullmatch(r'[a-z0-9\-/]+', path): return self.send_error(404)
        url = 'https://fantasy.premierleague.com/api/' + path.rstrip('/') + '/' + ('?' + qs if qs else '')
        try:
            body = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read()
        except Exception:
            self.send_response(502); self.send_header('Content-Type', 'application/json'); self.end_headers()
            self.wfile.write(b'{"error":"FPL request failed"}'); return
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', 8788), H).serve_forever()
