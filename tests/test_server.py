"""Railway用サーバー(server/): ログイン必須・操作の保存と再起動後の復元・LPは公開・noindex"""
import json
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
DEV = "tester@bukkenking.com"


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Srv:
    def __init__(self, tmp, dev_email=""):
        self.port = _free_port()
        env = dict(os.environ, PORT=str(self.port), DATA_FILE=str(tmp / "store.json"), SESSION_SECRET="test", GOOGLE_CLIENT_ID="cid")
        env.pop("DATABASE_URL", None)
        env.pop("DEV_LOGIN_EMAIL", None)
        if dev_email:
            env["DEV_LOGIN_EMAIL"] = dev_email
        self.p = subprocess.Popen(["node", str(ROOT / "server" / "index.js")], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{self.port}/healthz", timeout=1)
                return
            except Exception:  # noqa: BLE001
                time.sleep(0.2)
        raise RuntimeError("server did not start")

    def req(self, path, body=None):
        r = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=None if body is None else json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(r, timeout=30) as x:
                return x.status, x.headers, x.read().decode("utf8")
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read().decode("utf8")

    def rpc(self, name, *args):
        code, _, b = self.req(f"/rpc/{name}", {"args": list(args)})
        return code, json.loads(b)

    def stop(self):
        self.p.terminate()
        self.p.wait(10)


@pytest.mark.skipif(not (ROOT / "node_modules" / "pg").exists(), reason="npm install が必要")
def test_server_auth_persist_and_public_lp(tmp_path):
    s = Srv(tmp_path)   # ログインなし
    try:
        code, h, body = s.req("/")
        assert code == 200 and "ログイン" in body and "accounts.google.com/gsi/client" in body and "noindex" in h["X-Robots-Tag"]
        assert s.rpc("api_list")[0] == 401                                   # 操作はログイン必須
        code, _, body = s.req("/?id=nonexistent")
        assert code == 200 and "見つかりません" in body                         # LPは公開(中身が無ければ案内ページ)
        assert s.req("/robots.txt")[2].startswith("User-agent: *")
    finally:
        s.stop()
    s = Srv(tmp_path, DEV)
    try:
        code, r = s.rpc("api_whoami")
        assert code == 200 and r["ok"] and r["result"]["email"] == DEV
        assert not s.rpc("api_bogus")[1]["ok"] and not s.rpc("whoami")[1]["ok"]   # api_ 以外は呼べない
        c = s.rpc("api_create_company", "株式会社保存", "長野県", "上田市")[1]["result"]
        assert s.rpc("api_save", c["areaId"], {"inputs.client.address": "長野県上田市中央1-1-1"})[1]["result"]["saved"] == 1
        code, h, html = s.req("/")
        assert "google.script" in html and "/rpc/" in html                      # 入力画面にRPCの橋渡しが入る
    finally:
        s.stop()
    s = Srv(tmp_path, DEV)                                                       # 再起動しても残る
    try:
        l = s.rpc("api_list")[1]["result"]
        assert l["companies"][0]["name"] == "株式会社保存" and l["companies"][0]["areas"][0]["city"] == "上田市"
        assert s.rpc("api_get", c["areaId"])[1]["result"]["values"]["inputs.client.address"] == "長野県上田市中央1-1-1"
    finally:
        s.stop()
