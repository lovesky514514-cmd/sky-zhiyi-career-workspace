from pathlib import Path

from flask import send_from_directory
from backend.server import app

ROOT = Path(__file__).resolve().parent


@app.route("/")
def local_index():
    return send_from_directory(ROOT, "index.html")


@app.route("/<path:req_path>")
def local_static(req_path):
    target = ROOT / req_path
    if target.exists() and target.is_file():
        return send_from_directory(ROOT, req_path)
    return send_from_directory(ROOT, "index.html")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=True)
