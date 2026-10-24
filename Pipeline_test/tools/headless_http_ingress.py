"""Fixed-destination test ingress; no provider credentials, no open proxy."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import request, error


class Handler(BaseHTTPRequestHandler):
    def forward(self):
        if self.path == "/received" and self.command == "GET":
            target = "http://fake-upstream:18091/received"
        elif self.path.startswith("/api/v1/"):
            target = "http://backend:4000" + self.path
        else:
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))) or None
        headers = {k: v for k, v in self.headers.items()
                   if k.lower() not in {"host", "connection", "content-length"}}
        req = request.Request(target, data=body, headers=headers, method=self.command)
        try:
            response = request.urlopen(req, timeout=70)
        except error.HTTPError as exc:
            response = exc
        except error.URLError:
            self.send_error(502)
            return
        with response:
            data = response.read()
            self.send_response(response.status)
            self.send_header("Content-Type", response.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(data)))
            origin = self.headers.get("Origin", "*")
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.end_headers()
            self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        origin = self.headers.get("Origin", "*")
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", self.headers.get("Access-Control-Request-Headers", "Content-Type, Authorization, X-Requested-With"))
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    do_GET = do_POST = do_PATCH = do_PUT = do_DELETE = forward

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 4000), Handler).serve_forever()
