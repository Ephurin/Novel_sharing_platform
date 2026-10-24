"""Test-only fixed TCP destinations for localhost access to an internal Compose stack.

No request-selected destination, credential interception, URL routing or forwarding
to providers. AI/backend remain solely on the internal worker network.
"""
import select
import socket
import socketserver
import threading

DESTINATIONS = {15432: ('postgres', 5432), 17017: ('mongodb', 27017), 14000: ('backend', 4000)}


class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        target = DESTINATIONS[self.server.server_address[1]]
        try:
            with socket.create_connection(target, timeout=10) as remote:
                streams = [self.request, remote]
                while True:
                    ready, _, _ = select.select(streams, [], [], 90)
                    if not ready:
                        return
                    for incoming in ready:
                        data = incoming.recv(65536)
                        if not data:
                            return
                        (remote if incoming is self.request else self.request).sendall(data)
        except (OSError, TimeoutError):
            return


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    threads = []
    for port in DESTINATIONS:
        server = Server(('0.0.0.0', port), Handler)
        thread = threading.Thread(target=server.serve_forever)
        thread.start(); threads.append(thread)
    for thread in threads:
        thread.join()
