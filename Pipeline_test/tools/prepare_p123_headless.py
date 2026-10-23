"""Create a fresh headless environment; never reuse existing volumes or credentials."""
import argparse
import json
from pathlib import Path
import secrets
import socket

ROOT = Path(__file__).resolve().parents[2]


def prepare(manifest):
    manifest = Path(manifest)
    if manifest.exists():
        raise FileExistsError("Do not overwrite a prior environment manifest")
    project = "p123-core-" + secrets.token_hex(5)
    values = {"WAVE1D_PROJECT": project, "POSTGRES_DB": project.replace("-", "_"),
        "POSTGRES_USER": "p123", "POSTGRES_PASSWORD": secrets.token_hex(24),
        "JWT_ACCESS_SECRET": secrets.token_hex(32), "JWT_REFRESH_SECRET": secrets.token_hex(32),
        "PLATFORM_SERVICE_TOKEN": secrets.token_hex(32), "AI_WORKER_TOKEN": secrets.token_hex(24),
        "BACKEND_WORKER_TOKEN": secrets.token_hex(24), "OFFLINE_UPSTREAM_KEY": secrets.token_hex(24),
        "WAVE1D_AUTHOR_EMAIL": project + "@example.invalid",
        "WAVE1D_AUTHOR_USERNAME": project.replace("-", "_"),
        "WAVE1D_AUTHOR_PASSWORD": "Core!" + secrets.token_hex(20)}
    sockets = []
    try:
        for name in ("WEB", "BACKEND", "AI", "GATE", "FAKE"):
            sock = socket.socket()
            sock.bind(("127.0.0.1", 0))
            sockets.append(sock)
            values["WAVE1D_" + name + "_PORT"] = str(sock.getsockname()[1])
    finally:
        for sock in sockets:
            sock.close()
    env_file = ROOT / "Pipeline_test/tools" / (".env." + project)
    with env_file.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write("# Test-only credentials. Gitignored; never commit.\n")
        stream.write("\n".join(k + "=" + v for k, v in values.items()) + "\n")
    manifest.parent.mkdir(parents=True, exist_ok=True)
    with manifest.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump({"project": project, "env_file": str(env_file.relative_to(ROOT)),
                   "new_resources_only": True, "runtime_started": False}, stream, indent=2)
        stream.write("\n")
    return project


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    print(prepare(parser.parse_args().manifest))
