#!/usr/bin/env python3
"""公開前の確認。  python3 build.py && python3 tools/verify.py

  1. データの突き合わせ : menu.json と、PDFから書き起こした menu_daimon.source.json(件数・価格・説明文)
  2. サイトの内容       : メニューにない情報(創業年・実績など)が混ざっていないか、必要な情報が出ているか
  3. リンクと画像       : リンク切れ・altなし・ページ内リンクの切れがないか

  --basic をつけると 3 だけ行う(価格や営業時間を直したときに止まらないよう、公開時の自動確認ではこちら)。
"""
import json, os, re, sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")
BASIC = "--basic" in sys.argv
ok = True


def check(cond, msg):
    global ok
    print(("  OK  " if cond else "  NG  ") + msg)
    ok = ok and bool(cond)


def load(path):
    return json.load(open(os.path.join(ROOT, path), encoding="utf-8"))


class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        self.skip += tag in ("script", "style")

    def handle_endtag(self, tag):
        self.skip -= tag in ("script", "style")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.ids, self.imgs = [], set(), []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.add(a["id"])
        for k in ("href", "src"):
            if k in a:
                self.links.append(a[k])
        if "srcset" in a:
            self.links += [p.strip().split(" ")[0] for p in a["srcset"].split(",")]
        if tag == "img":
            self.imgs.append(a.get("alt"))


def read_pages():
    pages = {}
    for dp, _, fs in os.walk(SITE):
        for f in fs:
            if f.endswith(".html"):
                p = os.path.join(dp, f)
                pages[os.path.relpath(p, SITE)] = open(p, encoding="utf-8").read()
    return pages


def data_checks(menu, src, cfg):
    print("1. データの突き合わせ(menu.json と PDF書き起こし)")
    for k, n in {"lunch": 7, "ippin": 16, "men": 15, "gohan": 13, "tenshin": 4}.items():
        a, b = menu[k]["items"], src[k]["items"]
        check(len(a) == n == len(b), f"{k}: 件数 {len(a)} (期待 {n})")
        for x, y in zip(a, b):
            same = (x["name"] == y["name"] and x["price"] == y["price"] and x.get("price_large") == y.get("price_large")
                    and x.get("desc") == y.get("desc"))
            if not same:
                check(False, f"{k}/{x['name']}: 品名・価格・説明が元データと違う")
    check(len(menu["drink"]["alcohol"]) == 10, "アルコール 10品")
    check(menu["drink"]["alcohol"] == src["drink"]["alcohol"], "アルコールの品名・価格が一致")
    check(menu["drink"]["non_alcohol_beer"] == src["drink"]["non_alcohol_beer"], "ノンアルコールビール一致")
    check(menu["drink"]["soft"] == src["drink"]["soft"], "ソフトドリンク一致")
    check(len(menu["takeout"]["sets"]) == 4, "テイクアウト 4セット")
    pairs = lambda m: [(s["regular_price"], s["price"]) for s in m["takeout"]["sets"]]
    check(pairs(menu) == pairs(src), "テイクアウトの通常価格→特別価格が一致")
    check(menu["gohan"]["plain_rice"] == src["gohan"]["plain_rice"], "白いご飯(大・中・小)一致")
    s = src["shop"]
    check(cfg["phone"] == s["phone"] and cfg["hours"] == s["hours"] and cfg["instagram"] == s["instagram"], "電話・営業時間・Instagramが一致")
    check(cfg["closed"] == s["closed"], "定休日(毎週火曜日)が一致")


def content_checks(menu, cfg, pages):
    print("2. サイトの内容")
    alltext = ""
    for v in pages.values():
        t = Text()
        t.feed(v)
        alltext += " ".join(t.parts) + "\n"
    # 金額は menu.json / config.json にあるものだけ
    allowed = set()

    def walk(o, key=""):
        if isinstance(o, dict):
            for k, v in o.items():
                walk(v, k)
        elif isinstance(o, list):
            for v in o:
                walk(v, key)
        elif isinstance(o, (int, float)) and key in ("price", "price_large", "regular_price", "large", "medium", "small"):
            allowed.add(int(o))
        elif isinstance(o, str):
            allowed.update(int(m.replace(",", "")) for m in re.findall(r"(\d[\d,]*)円", o))
    walk(menu)
    walk(cfg)
    found = {int(m.replace(",", "")) for m in re.findall(r"(\d[\d,]*)円", alltext)}
    check(found <= allowed, f"サイト内の金額はすべて menu.json 由来 {sorted(found - allowed) or ''}")
    for pat, label in [(r"昭和|平成|令和", "元号"),
                       (r"(19|20)\d\d年(?!\d*月)", "西暦の年(更新日の「◯年◯月◯日」は除く)"),
                       (r"創業.{0,6}年(?!以上)", "創業年の記載"),
                       (r"受賞|ミシュラン|食べログ|アレルギー|テレビ|取材", "メニューにない実績・情報"),
                       (r"Wi-?Fi|禁煙|個室|カード|PayPay|ランチタイム割引", "メニューにない設備・支払い")]:
        check(not re.search(pat, alltext), f"含まれていない: {label}")
    check("創業50年以上" in alltext and "55年目" in alltext, "「創業50年以上」「55年目」はメニューの言葉どおり")
    musts = [cfg["address"]["full"], cfg["phone"], cfg["closed"], cfg["payment"], cfg["seats"], "駐車場"]
    musts += [f'{h["open"]}〜{h["close"]}' for h in cfg["hours"]] + [f'{h["last_order"]}ラストオーダー' for h in cfg["hours"]]
    for m in musts:
        check(m in alltext, f"表示あり: {m}")
    check("ご飯が進みますよ" in alltext and "お酢をかけてどうぞ" in alltext and "あったらラッキーです" in alltext, "女将さんの言い回しが残っている")
    check(all("税込" in pages[p] for p in ["menu/index.html", "lunch-takeout/index.html"]), "メニュー・ランチのページに「税込」の表示")
    check("更新日" in pages["menu/index.html"], "メニューページに更新日")
    ld = json.loads(re.findall(r'<script type="application/ld\+json">(.*?)</script>', pages["index.html"], re.S)[0])
    tel = "+81" + re.sub(r"\D", "", cfg["phone"])[1:]
    check(ld["@type"] == "Restaurant" and ld["telephone"] == tel and ld["address"]["streetAddress"], "構造化データ Restaurant(店名・電話・住所)")
    days = ld["openingHoursSpecification"][0]["dayOfWeek"]
    check("Tuesday" not in days and len(days) == 6, "構造化データ: 定休日(火曜)は営業日に入っていない")
    check(all(f'tel:{re.sub(chr(92)+"D", "", cfg["phone"])}' in v for v in pages.values()), "全ページに電話リンク(tel:)")


def link_checks(cfg, pages):
    print("3. リンク・画像")
    ids, bad = {}, []
    parsed = {}
    for k, v in pages.items():
        p = Links()
        p.feed(v)
        parsed[k] = p
        ids[k] = p.ids
    for k, p in parsed.items():
        if any(not a for a in p.imgs):
            bad.append(f"{k}: alt のない画像")
        for l in p.links:
            if l.startswith(("http", "tel:", "mailto:", "data:")) or (k == "404.html" and l.startswith("/")):
                continue
            path, _, frag = l.partition("#")
            base = os.path.dirname(os.path.join(SITE, k))
            tgt = os.path.normpath(os.path.join(base, path)) if path else os.path.join(SITE, k)
            if os.path.isdir(tgt):
                tgt = os.path.join(tgt, "index.html")
            if not os.path.exists(tgt):
                bad.append(f"{k}: {l} が見つからない")
            elif frag and tgt.endswith(".html"):
                rel = os.path.relpath(tgt, SITE)
                if frag not in ids.get(rel, set()):
                    bad.append(f"{k}: #{frag} が {rel} にない")
    check(not bad, "リンク切れ・altなしなし " + "; ".join(bad[:5]))
    check(all('class="callbar"' in v for v in pages.values()), "全ページに固定の電話ボタン")
    check(all(f"instagram.com/{cfg['instagram']}/" in v for k, v in pages.items() if k != "404.html"), "Instagramリンク")


if __name__ == "__main__":
    menu, src, cfg = load("data/menu.json"), load("data/menu_daimon.source.json"), load("data/config.json")
    pages = read_pages()
    if not BASIC:
        data_checks(menu, src, cfg)
        content_checks(menu, cfg, pages)
    link_checks(cfg, pages)
    print("\n結果:", "すべてOK" if ok else "直すところがあります")
    sys.exit(0 if ok else 1)
