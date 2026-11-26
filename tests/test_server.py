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


@pytest.mark.skipif(not (ROOT / "node_modules" / "pg").exists(), reason="npm install が必要")
def test_favicon(tmp_path):
    s = Srv(tmp_path, DEV)
    try:
        r = urllib.request.urlopen(f"http://127.0.0.1:{s.port}/favicon.ico", timeout=10)
        b = r.read()
        assert r.headers["Content-Type"] == "image/png" and b[:8] == b"\x89PNG\r\n\x1a\n"
        assert 'rel="icon"' in s.req("/")[2]                                   # 入力画面
        c = s.rpc("api_create_company", "株式会社アイコン", "長野県", "上田市")[1]["result"]
        assert 'rel="icon" type="image/png" href="data:image/png;base64,' in s.req(f"/?id={c['areaId']}")[2]   # LP
    finally:
        s.stop()


@pytest.mark.skipif(not (ROOT / "node_modules" / "pg").exists(), reason="npm install が必要")
def test_server_large_area_data(tmp_path):
    """Railway版は、GAS版の1セル5万文字の制限を受けない(入力データが大きくても保存でき、再起動後も残る)"""
    s = Srv(tmp_path, DEV)
    try:
        c = s.rpc("api_create_company", "株式会社大きい", "長野県", "上田市", "station")[1]["result"]
        big = {"lines": [(f"路線{i}あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめも")[:30] for i in range(150)], "rows": [(f"始点駅{i}さしすせそたちつてと〜終点駅{i}なにぬねのはひふへほまみむめもやゆよらりるれろわをんあいうえおかきくけこ")[:58] for i in range(150)], "cells": [[str(i)] for i in range(150)]}
        for k in ("land", "used_house", "used_mansion", "new_house"):
            r = s.rpc("api_saveTable", c["areaId"], f"inputs.{k}.station_image", big)[1]
            assert r["ok"], r
        assert s.rpc("api_save", c["areaId"], {"inputs.used_house.price_man": "3550"})[1]["result"]["saved"] == 1   # 大きくなっても、他の入力が保存できる
    finally:
        s.stop()
    s = Srv(tmp_path, DEV)
    try:
        t = s.rpc("api_get", c["areaId"])[1]["result"]
        assert len(t["tables"]["inputs.new_house.station_image"]["rows"]) == 150 and t["values"]["inputs.used_house.price_man"] == "3550"
    finally:
        s.stop()


def _chrome():
    import glob
    c = os.environ.get("CHROME") or next(iter(sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome"))), "")
    return c if c and Path(c).exists() else ""


@pytest.mark.skipif(not (ROOT / "node_modules" / "pg").exists() or not (ROOT / "node_modules" / "playwright-core").exists() or not _chrome(), reason="ブラウザまたは playwright-core が無い")
def test_station_table_autosave_in_browser(tmp_path):
    """路線・駅の表は、入力すると自動で保存され、他の種別の保存で入力中の内容が消えない"""
    s = Srv(tmp_path, DEV)
    try:
        r = subprocess.run(["node", str(ROOT / "tests" / "ui_station.mjs"), _chrome(), f"http://127.0.0.1:{s.port}"], capture_output=True, text=True, timeout=120)
        assert r.returncode == 0, r.stderr
        j = json.loads(r.stdout.strip().splitlines()[-1])
        assert j["autosaved"] == [93, "上田駅〜屋代駅"] and j["kept"] == [True, 7, "7"] and j["reload"] == ["93", "7"] and j["errs"] == []
        assert j["kwRows"] == 4 and j["kwOff"] and j["kwSaved"] == ["売却:true", "中古マンション:true", "不動産:false", "中古物件:true", "空き家:true"]   # 検索キーワード: 自由に書き換え・追加でき、チェックを外した行は薄くなる
    finally:
        s.stop()
