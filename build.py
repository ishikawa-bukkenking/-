#!/usr/bin/env python3
"""中華料理 大門 ホームページのビルド。

data/menu.json と data/config.json から、静的なHTMLを site/ に作る。
  python3 build.py
画像は images/ のファイル名(料理id.webp)で結びつく。Pillow があれば、
スマホ用の小さい画像(srcset)も自動で作る(なくても動く)。
"""
import html, json, os, re, shutil, sys
from urllib.parse import quote

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "site")
IMG_SRC = os.path.join(ROOT, "images")
WIDTHS = [240, 360, 480, 640, 840]

try:
    from PIL import Image
except ImportError:  # Pillow がなくても、元の画像をそのまま使って動く
    Image = None

menu = json.load(open(os.path.join(ROOT, "data/menu.json"), encoding="utf-8"))
cfg = json.load(open(os.path.join(ROOT, "data/config.json"), encoding="utf-8"))
msg = cfg["messages"]
E = lambda s: html.escape(str(s), quote=True)
_money = re.compile(r"(＋\d[\d,]*円|\d[\d,]*円)")


def T(s):
    """本文用: エスケープして、金額(＋200円など)が途中で折り返さないようにする。"""
    return _money.sub(r'<span class="nw">\1</span>', E(s))


yen = lambda n: f"{int(n):,}円"
TEL = "tel:" + re.sub(r"[^0-9]", "", cfg["phone"])
TEL_INTL = "+81" + re.sub(r"[^0-9]", "", cfg["phone"])[1:]
INSTA_URL = f"https://www.instagram.com/{cfg['instagram']}/"
ADDR = cfg["address"]["full"]
MAP_Q = quote(cfg["name"] + " " + ADDR)
MAP_LINK = f"https://www.google.com/maps/search/?api=1&query={MAP_Q}"
MAP_EMBED = f"https://maps.google.com/maps?q={MAP_Q}&hl=ja&z=17&output=embed"
SITE = cfg.get("siteUrl", "").rstrip("/")
WEEK = "日月火水木金土"

# ------------------------------------------------------------------ 書体(使う文字だけの woff2 を作る)
FONT_FACES = [  # (family, weight, source ttf, 出力名)
    ("Yusei Magic", 400, "YuseiMagic-Regular.ttf", "yusei-magic"),
    ("Zen Maru Gothic", 500, "ZenMaruGothic-Medium.ttf", "zen-maru-500"),
    ("Zen Maru Gothic", 700, "ZenMaruGothic-Bold.ttf", "zen-maru-700"),
]
GOOGLE_FONTS_LINK = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
                     '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Yusei+Magic&family=Zen+Maru+Gothic:wght@500;700&display=swap">')
self_hosted = False  # 書体を自前で作れたら True


def build_fonts(sets):
    """fonttools があれば、使う文字だけの woff2 を site/assets/fonts に作る。なければ False。
    sets = {"home": トップで使う文字, "all": 全ページの文字}。トップは軽い専用ファイルを使う。"""
    try:
        from fontTools import subset
        from fontTools.ttLib import TTFont
        import brotli  # noqa: F401  (woff2 に必要)
    except ImportError:
        return False
    srcdir = os.path.join(ROOT, "fonts", "src")
    if not all(os.path.exists(os.path.join(srcdir, f[2])) for f in FONT_FACES):
        return False
    outdir = os.path.join(OUT, "assets", "fonts")
    os.makedirs(outdir, exist_ok=True)
    common = {chr(c) for c in range(0x20, 0x7F)} | set("、。，．・：；？！「」『』（）［］〜～ー―…♪☆♥❤＋－×→←↑↓※✔") | set("今日は定休営業です月火水木金土曜")  # 最後は main.js が出す文字
    for variant, chars in sets.items():
        text = "".join(sorted(set(chars) | common))
        for fam, wt, ttf, name in FONT_FACES:
            opts = subset.Options()
            opts.flavor = "woff2"
            opts.layout_features = ["kern", "palt", "liga"]
            opts.notdef_outline = True
            opts.hinting = False          # 画面用なのでヒントは不要(軽くなる)
            opts.desubroutinize = True
            opts.name_IDs = [1, 2]
            font = TTFont(os.path.join(srcdir, ttf))
            sub = subset.Subsetter(opts)
            sub.populate(text=text)
            sub.subset(font)
            font.flavor = "woff2"
            font.save(os.path.join(outdir, f"{name}-{variant}.woff2"))
    return True


def font_css(base, variant):
    return "".join(
        f'@font-face{{font-family:"{fam}";font-weight:{wt};font-style:normal;font-display:swap;'
        f'src:url({base}assets/fonts/{name}-{variant}.woff2) format("woff2")}}'
        for fam, wt, _, name in FONT_FACES)


# ------------------------------------------------------------------ 画像
_variants = {}


def image_info(rel):
    """images/<rel>.webp があれば、srcset 用の変種を作って返す。なければ None。"""
    if rel in _variants:
        return _variants[rel]
    src = os.path.join(IMG_SRC, rel + ".webp")
    if not os.path.exists(src):
        _variants[rel] = None
        return None
    outdir = os.path.join(OUT, "img", os.path.dirname(rel))
    os.makedirs(outdir, exist_ok=True)
    name = os.path.basename(rel)
    res = []
    if Image is None:
        dst = os.path.join(outdir, name + ".webp")
        shutil.copy(src, dst)
        res = [(0, f"img/{rel}.webp")]
        _variants[rel] = {"files": res, "w": 0, "h": 0}
        return _variants[rel]
    im = Image.open(src)
    W, H = im.size
    widths = [w for w in WIDTHS if w < W] + [W]
    for w in widths:
        h = round(H * w / W)
        fn = f"{name}-{w}.webp"
        dst = os.path.join(outdir, fn)
        im.resize((w, h), Image.LANCZOS).save(dst, "WEBP", quality=76, method=6) if w != W else im.save(dst, "WEBP", quality=76, method=6)
    res = [(w, f"img/{os.path.dirname(rel)}/{name}-{w}.webp") for w in widths]
    _variants[rel] = {"files": res, "w": W, "h": H}
    return _variants[rel]


def img(rel, alt, base, sizes, cls="", eager=False):
    info = image_info(rel)
    if not info:
        return ""
    files = info["files"]
    attrs = [f'src="{base}{files[-1][1]}"']
    if files[0][0]:
        attrs.append('srcset="' + ", ".join(f"{base}{p} {w}w" for w, p in files) + '"')
        attrs.append(f'sizes="{sizes}"')
        attrs.append(f'width="{info["w"]}" height="{info["h"]}"')
    attrs.append(f'alt="{E(alt)}"')
    attrs.append('fetchpriority="high"' if eager else 'loading="lazy" decoding="async"')
    if cls:
        attrs.append(f'class="{cls}"')
    return "<img " + " ".join(attrs) + ">"


# ------------------------------------------------------------------ 部品
BADGE_CLASS = {"女将のイチ推し": "badge badge-yolk", "オリジナル": "badge badge-yolk"}


def badge(b):
    return f'<span class="{BADGE_CLASS.get(b, "badge")}">{E(b)}</span>' if b else ""


def price_html(it):
    if it.get("price_large"):
        return (f'<p class="price"><span class="tax">税込</span> <span class="pl">並</span> <b>{yen(it["price"])}</b>'
                f' <span class="pl">大盛</span> <b>{yen(it["price_large"])}</b></p>')
    return f'<p class="price"><span class="tax">税込</span> <b>{yen(it["price"])}</b></p>'


def p_if(cls, text):
    return f'<p class="{cls}">{T(text)}</p>' if text else ""


def dish(it, base, big=False):
    ph = img(f"dishes/{it['id']}", it["name"], base,
             "(min-width:860px) 520px, 92vw" if big else "(min-width:860px) 280px, 40vw")
    notes = "".join(f"<li>{T(n)}</li>" for n in it.get("notes", []))
    notes_html = f'<ul class="notes">{notes}</ul>' if notes else ""
    photo_html = f'<div class="dish-photo">{ph}</div>' if ph else ""
    cls = "dish" + (" has-photo" if ph else " no-photo") + (" big" if big else "")
    return (f'<article class="{cls}" id="i-{E(it["id"])}">{photo_html}'
            f'<div class="dish-body"><h3>{E(it["name"])} {badge(it.get("badge"))}</h3>'
            f'{p_if("desc", it.get("desc"))}{p_if("voice", it.get("voice"))}{notes_html}'
            f'{price_html(it)}</div></article>')


def rules_html(rules, cls="rules"):
    return f'<ul class="{cls}">' + "".join(f"<li>{T(r)}</li>" for r in rules) + "</ul>"


def hours_li():
    return "".join(
        f'<li><b>{E(h["label"])}</b><span>{h["open"]}〜{h["close"]}<small>{h["last_order"]}ラストオーダー</small></span></li>'
        for h in cfg["hours"])


def takeout_block(base, full=True):
    t = menu["takeout"]
    cards = ""
    for s in t["sets"]:
        ph = img(f"takeout/{s['id']}", s["name"] + " " + s["desc"], base, "(min-width:860px) 260px, 90vw")
        cards += (f'<article class="set">{f"<div class=set-photo>{ph}</div>" if ph else ""}'
                  f'<div class="set-body"><h3>{E(s["name"])}</h3><p class="desc">{E(s["desc"])}</p>'
                  f'<p class="price"><span class="tax">税込</span> <s>{yen(s["regular_price"])}</s> '
                  f'<span class="arrow" aria-label="から">→</span> <b class="special">{yen(s["price"])}</b></p></div></article>')
    rules = [r for r in t["rules"]]
    return (f'<div class="sets">{cards}</div>'
            f'<p class="packnote">4セットはパック代も込みの価格です</p>'
            f'{rules_html(rules[1:], "rules rules-take") if full else ""}')


def notice_html():
    n = menu.get("notice", {})
    if n.get("show") and n.get("text"):
        return f'<div class="notice" role="status"><div class="wrap"><p><b>お知らせ</b> {E(n["text"])}</p></div></div>'
    return ""


# ------------------------------------------------------------------ ページ枠
NAV = [("", "トップ", "home"), ("menu/", "メニュー", "menu"),
       ("lunch-takeout/", "ランチ・テイクアウト", "lunch"), ("about/", "お店について", "about")]


def page(slug, key, title, desc, body, extra_head="", depth=0, og_image="assets/og.jpg", jsonld="", base=None, fv="all"):
    if base is None:
        base = "../" * depth
    nav = "".join(
        f'<a href="{base}{p}"{" aria-current=page" if k == key else ""}>{t}</a>' for p, t, k in NAV)
    url = f"{SITE}/{slug}" if SITE else ""
    og_abs = f"{SITE}/{og_image}" if SITE else ""
    meta = ""
    if url:
        meta += f'<link rel="canonical" href="{url}">\n<meta property="og:url" content="{url}">\n'
    if og_abs:
        meta += (f'<meta property="og:image" content="{og_abs}">\n<meta property="og:image:width" content="1200">\n'
                 f'<meta property="og:image:height" content="630">\n<meta name="twitter:image" content="{og_abs}">\n')
    FONT_HEAD = (f'<link rel="preload" href="{base}assets/fonts/zen-maru-500-{fv}.woff2" as="font" type="font/woff2" crossorigin>\n'
                 f'<link rel="preload" href="{base}assets/fonts/yusei-magic-{fv}.woff2" as="font" type="font/woff2" crossorigin>\n') if self_hosted else GOOGLE_FONTS_LINK + "\n"
    FONT_CSS_BLOCK = font_css(base, fv) if self_hosted else ""
    return f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{E(title)}</title>
<meta name="description" content="{E(desc)}">
<meta name="theme-color" content="#C14E18">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{E(cfg['name'])}">
<meta property="og:locale" content="ja_JP">
<meta property="og:title" content="{E(title)}">
<meta property="og:description" content="{E(desc)}">
<meta name="twitter:card" content="summary_large_image">
{meta}<link rel="icon" href="{base}assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="{base}assets/apple-touch-icon.png">
{FONT_HEAD}<style>{FONT_CSS_BLOCK}{CSS_MIN}</style>
<script>document.documentElement.className+=' js'</script>
{extra_head}{jsonld}</head>
<body>
<a class="skip" href="#main">本文へ</a>
<header class="noren">
  <div class="wrap">
    <a class="brand" href="{base}"><b>{E(cfg['name'])}</b><small>{E(cfg['address']['locality'])}・家族の町中華</small></a>
    <nav aria-label="メインメニュー">{nav}</nav>
  </div>
</header>
{notice_html()}
<main id="main">
{body}
</main>
<footer class="foot">
  <div class="wrap">
    <p class="foot-name">{E(cfg['name'])}</p>
    <p>{E(ADDR)}<br>電話 <a href="{TEL}">{E(cfg['phone'])}</a> ／ {E(cfg['closed'])}定休</p>
    <p class="foot-small">表示の価格はすべて税込です(メニューデータ更新日 {E(jdate(menu['updated']))})。<br>
    お店の最新情報や臨時休業は、<a href="{INSTA_URL}" target="_blank" rel="noopener">Instagram {E(cfg['instagram'])}</a> のストーリーでお知らせします。</p>
  </div>
</footer>
<div class="callbar"><a href="{TEL}" aria-label="電話する {E(cfg['phone'])}"><span aria-hidden="true">📞</span> 電話する <small>{E(cfg['phone'])}</small></a></div>
<script src="{base}assets/main.js" defer></script>
</body>
</html>
"""


def jdate(s):
    y, m, d = s.split("-")
    return f"{int(y)}年{int(m)}月{int(d)}日"


def restaurant_jsonld():
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    closed = {(w - 1) % 7 for w in cfg["closedWeekdays"]}  # 日=0 → Sunday index 6
    open_days = [d for i, d in enumerate(days) if i not in closed]
    spec = [{"@type": "OpeningHoursSpecification", "dayOfWeek": open_days,
             "opens": h["open"], "closes": h["close"]} for h in cfg["hours"]]
    data = {
        "@context": "https://schema.org", "@type": "Restaurant",
        "name": cfg["name"], "servesCuisine": "中華料理",
        "telephone": TEL_INTL,
        "address": {"@type": "PostalAddress", "addressCountry": "JP",
                    "addressRegion": cfg["address"]["region"], "addressLocality": cfg["address"]["locality"],
                    "streetAddress": cfg["address"]["street"]},
        "openingHoursSpecification": spec,
        "acceptsReservations": True,
        "paymentAccepted": "Cash",
        "sameAs": [INSTA_URL],
    }
    if cfg["address"].get("postalCode"):
        data["address"]["postalCode"] = cfg["address"]["postalCode"]
    if SITE:
        data["url"] = SITE + "/"
        data["image"] = [f"{SITE}/assets/og.jpg"]
        data["hasMenu"] = SITE + "/menu/"
    return ('<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False) + "</script>\n")


# ------------------------------------------------------------------ 共通セクション
def access_section(base, heading="アクセス・営業時間"):
    a = cfg
    rows = [("住所", E(ADDR)), ("電話", f'<a href="{TEL}">{E(a["phone"])}</a>'),
            ("営業時間", "<br>".join(f'{E(h["label"])} {h["open"]}〜{h["close"]}({h["last_order"]}ラストオーダー)' for h in a["hours"])),
            ("定休日", E(a["closed"])), ("駐車場", E(a["parking"])),
            ("お支払い", E(a["payment"])), ("席数", E(a["seats"])), ("ご予約", E(a["reservation"]))]
    dl = "".join(f"<div><dt>{k}</dt><dd>{v}</dd></div>" for k, v in rows)
    mapx = ""
    if a.get("showMap") and ADDR:
        mapx = (f'<div class="map"><iframe title="{E(a["name"])}の地図" src="{MAP_EMBED}" loading="lazy" '
                f'referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>')
    return f"""<section class="sec access" id="access">
  <div class="wrap">
    <h2 class="h2">{heading}</h2>
    <div class="access-grid">
      <dl class="info">{dl}</dl>
      <div>{mapx}
        <div class="cta">
          <a class="btn tel" href="{TEL}"><span aria-hidden="true">📞</span> 電話する</a>
          <a class="btn sub" href="{MAP_LINK}" target="_blank" rel="noopener">Googleマップで開く</a>
          <a class="btn sub" href="{INSTA_URL}" target="_blank" rel="noopener">Instagram</a>
        </div>
      </div>
    </div>
  </div>
</section>"""


def find(cat, iid):
    return next(i for i in menu[cat]["items"] if i["id"] == iid)


# ------------------------------------------------------------------ トップ
def build_home():
    base = ""
    hero = img("dishes/lunch-aburi", "醤油ラーメンと炙りチャーシューミニ丼のあぶりセット", base,
               "(min-width:860px) 560px, 92vw", cls="photo", eager=True)
    hero_info = image_info("dishes/lunch-aburi")
    preload = ""
    if hero_info and hero_info["files"][0][0]:
        ss = ", ".join(f"{p} {w}w" for w, p in hero_info["files"])
        preload = (f'<link rel="preload" as="image" imagesrcset="{ss}" imagesizes="(min-width:860px) 560px, 92vw" fetchpriority="high">\n')
    aburi = find("lunch", "lunch-aburi")
    pop = ""
    for cat, iid, tag in [("ippin", "nira-reba", "一番人気"), ("men", "aburi-chashumen", "一番人気"), ("lunch", "lunch-aburi", "一番人気")]:
        it = find(cat, iid)
        ph = img(f"dishes/{iid}", it["name"], base, "(min-width:860px) 340px, 92vw")
        sub = " <small>平日お昼のセット</small>" if cat == "lunch" else ""
        voice = ""
        pop += (f'<article class="pop reveal"><div class="pop-photo">{ph}<span class="tag">{tag}</span></div>'
                f'<h3>{E(it["name"])}</h3><p class="desc">{E(it["desc"])}</p>{voice}'
                f'<p class="price"><span class="tax">税込</span> <b>{yen(it["price"])}</b>{sub}</p></article>')
    extra = ""
    for cat, iid, tag in [("men", "ankake-torotama", "女将のイチ推し"), ("tenshin", "shiso-cheese-harumaki", "大門オリジナル")]:
        it = find(cat, iid)
        ph = img(f"dishes/{iid}", it["name"], base, "(min-width:860px) 220px, 40vw")
        desc = "" if it["desc"].rstrip("！!").startswith(tag) else p_if("desc", it["desc"])
        extra += (f'<article class="mini reveal"><div class="mini-photo">{ph}</div><div><span class="badge badge-yolk">{tag}</span>'
                  f'<h3>{E(it["name"])}</h3>{desc}'
                  f'<p class="price"><span class="tax">税込</span> <b>{yen(it["price"])}</b></p></div></article>')
    lunch_prices = [i["price"] for i in menu["lunch"]["items"]]
    lthumbs = "".join(img(f"dishes/{i['id']}", i["name"], base, "120px") for i in menu["lunch"]["items"][:4])
    take = img("takeout/takeout-assort", "お持ち帰り用のいろいろなメニュー", base, "(min-width:860px) 320px, 70vw")
    body = f"""
<section class="hero">
  <div class="wrap">
    <div class="copy">
      <h1>{E(cfg['name'])}</h1>
      <p class="catch">創業<em>50年以上</em>。<br>変わらない、<br>家族の町中華。</p>
      <p class="sub">{E(msg['anniversary'])}<br>{E(msg['family'])}</p>
      <div class="cta">
        <a class="btn tel" href="{TEL}"><span aria-hidden="true">📞</span> 電話する {E(cfg['phone'])}</a>
        <a class="btn sub" href="menu/">メニューを見る</a>
      </div>
    </div>
    <figure class="shot">
      {hero}
      <div class="steam" aria-hidden="true"><i></i><i></i><i></i></div>
      <span class="tag">一番人気です♪</span>
      <figcaption class="cap"><b>{E(aburi['name'])} {yen(aburi['price'])}</b><br>{E(aburi['desc'])}<br><small>平日お昼のセット・税込</small></figcaption>
    </figure>
  </div>
</section>

<section class="today" aria-labelledby="today-h">
  <div class="wrap"><div class="card">
    <div><h2 id="today-h">今日の営業案内</h2><p class="status" id="status" data-closed="{','.join(map(str, cfg['closedWeekdays']))}">営業時間のご案内</p></div>
    <div>
      <ul class="hours">{hours_li()}</ul>
      <p class="closed">定休日:{E(cfg['closed'])}</p>
      <p class="insta">{E(msg['instagram_note'].replace('♪',''))}♪ <a href="{INSTA_URL}" target="_blank" rel="noopener">Instagramを見る</a></p>
    </div>
  </div></div>
</section>

<section class="sec popular">
  <div class="wrap">
    <h2 class="h2">一番人気</h2>
    <div class="pop-grid">{pop}</div>
    <div class="mini-grid">{extra}</div>
    <p class="more"><a class="btn sub" href="menu/">メニューをぜんぶ見る</a></p>
  </div>
</section>

<section class="sec kodawari">
  <div class="wrap">
    <h2 class="h2">大門のこだわり</h2>
    <ul class="kgrid">
      <li class="reveal"><b>身体に優しい味付け</b><span>小さなお子様からお年を召した方でも、安心して食べて頂けるように。</span></li>
      <li class="reveal"><b>添加物は少なめ</b><span>できる限り添加物は少なめにしてます。</span></li>
      <li class="reveal"><b>醤油ラーメンのスープ</b><span>鶏ガラと鰹、煮干し、昆布ベース。小さなお子様も安心してどうぞ！</span></li>
      <li class="reveal"><b>辛さは対応します</b><span>激辛、チョイ辛、子供用まで、麻婆豆腐の辛さはお好みで。</span></li>
    </ul>
    <p class="free">{E(msg['free_water'])}</p>
  </div>
</section>

<section class="sec lunch-cta">
  <div class="wrap"><div class="band">
    <div class="band-text">
      <h2 class="h2 left">平日お昼のお得なセット</h2>
      <p class="big"><span class="tax">税込</span> <b>{yen(min(lunch_prices))}〜{yen(max(lunch_prices))}</b></p>
      <p>平日の夜と土日祝日は<b class="plus100">＋100円</b>で注文できます♪</p>
      <p><a class="btn tel" href="lunch-takeout/">ランチ7種を見る</a></p>
    </div>
    <div class="thumbs" aria-hidden="true">{lthumbs}</div>
  </div></div>
</section>

<section class="sec takeout-cta">
  <div class="wrap"><div class="band alt">
    <div class="band-photo">{take}</div>
    <div class="band-text">
      <h2 class="h2 left">テイクアウトもできます</h2>
      <p>ラーメン以外は全てお持ち帰りOK。4セットがお得です。<br>お電話いただければ、ご希望の時間にお渡しできます！</p>
      <p><a class="btn sub" href="lunch-takeout/#takeout">テイクアウトの案内</a></p>
    </div>
  </div></div>
</section>

<section class="sec okami">
  <div class="wrap">
    <blockquote class="quote reveal">
      <p>{E(msg['family'])}<br>{E(msg['anniversary'])}</p>
      <p class="small">{E(msg['energy'].replace('！！！','！'))}</p>
      <cite>— 中華料理 大門</cite>
    </blockquote>
    <p class="more"><a class="textlink" href="about/">お店について</a></p>
  </div>
</section>

{access_section(base)}
"""
    return page("", "home",
                f"{cfg['name']}｜{cfg['address']['locality']}・鏡島の家族の町中華",
                f"{cfg['address']['locality']}の町中華「{cfg['name']}」。創業50年以上、家族だけでやっている小さな町中華屋です。ニラレバ炒め、炙りチャーシューメン、あぶりセットが人気。テイクアウトもできます。電話 {cfg['phone']}・火曜定休。",
                body, extra_head=preload, depth=0, jsonld=restaurant_jsonld(), fv="home")


# ------------------------------------------------------------------ メニュー
CATS = [("lunch", "ランチ"), ("ippin", "一品料理"), ("men", "麺類"), ("gohan", "ご飯物"),
        ("tenshin", "点心"), ("drink", "ドリンク"), ("takeout", "テイクアウト")]


def drink_section(base):
    d = menu["drink"]

    def rows(items):
        return "".join(
            f'<tr><th scope="row">{E(i["name"])}{"".join(f"<small>{E(n)}</small>" for n in i.get("notes", []))}</th><td>{yen(i["price"])}</td></tr>'
            for i in items)
    soft = d["soft"]
    chips = "".join(f"<li>{E(x)}</li>" for x in soft["items"])
    deco = (img("drinks/drink-draft-beer", "生ビール", base, "120px") +
            img("drinks/drink-highball", "ハイボール", base, "100px"))
    return f"""<div class="drinks">
  <div class="deco" aria-hidden="true">{deco}</div>
  {rules_html(d["notes"], "rules rules-soft")}
  <h3 class="sub-h">アルコール</h3>
  <table class="dtable"><caption class="sr">アルコールの価格(税込)</caption><tbody>{rows(d["alcohol"])}</tbody></table>
  <h3 class="sub-h">ノンアルコールビール</h3>
  <table class="dtable"><caption class="sr">ノンアルコールビールの価格(税込)</caption><tbody>{rows(d["non_alcohol_beer"])}</tbody></table>
  <h3 class="sub-h">ソフトドリンク <span class="all">全て <b>{yen(soft["price"])}</b>(税込)</span></h3>
  <ul class="chips">{chips}</ul>
</div>"""


def section_head(cid, title, subtitle="", rules=None, rule_cls="rules"):
    r = rules_html(rules, rule_cls) if rules else ""
    return (f'<div class="sec-head"><h2 class="h2 left" id="{cid}">{title}</h2>'
            f'{f"<p class=sub-note>{subtitle}</p>" if subtitle else ""}{r}</div>')


def build_menu():
    base = "../"
    secs = ""
    # ランチ
    lm = menu["lunch"]
    secs += (f'<section class="msec" aria-labelledby="lunch">'
             f'{section_head("lunch", "ランチ", E(lm["title"]) + "(税込)", lm["rules"], "rules rules-plus")}'
             f'<div class="dishes">{"".join(dish(i, base) for i in lm["items"])}</div>'
             f'<p class="more"><a class="textlink" href="{base}lunch-takeout/">ランチの案内ページへ</a></p></section>')
    # 一品・麺・ご飯・点心
    for cat, title in [("ippin", "一品料理"), ("men", "麺類"), ("gohan", "ご飯物"), ("tenshin", "点心")]:
        m = menu[cat]
        rules = m.get("rules")
        extra = ""
        if cat == "gohan":
            p = m["plain_rice"]
            extra = (f'<article class="dish no-photo rice"><div class="dish-body"><h3>{E(p["name"])}</h3>'
                     f'<p class="price"><span class="tax">税込</span> <span class="pl">大</span> <b>{yen(p["large"])}</b> '
                     f'<span class="pl">中</span> <b>{yen(p["medium"])}</b> <span class="pl">小</span> <b>{yen(p["small"])}</b></p></div></article>')
        secs += (f'<section class="msec" aria-labelledby="{cat}">'
                 f'{section_head(cat, title, "税込価格", rules, "rules rules-plus")}'
                 f'<div class="dishes">{"".join(dish(i, base) for i in m["items"])}{extra}</div></section>')
    secs += (f'<section class="msec" aria-labelledby="drink">{section_head("drink", "ドリンク", "税込価格")}'
             f'{drink_section(base)}</section>')
    secs += (f'<section class="msec" aria-labelledby="takeout">'
             f'{section_head("takeout", "テイクアウト", "限定のお得な4セット(税込・パック代込み)")}'
             f'{takeout_block(base, full=False)}'
             f'<p class="more"><a class="btn sub" href="{base}lunch-takeout/#takeout">テイクアウトの案内を見る</a></p></section>')
    nav = "".join(f'<a href="#{c}" data-cat="{c}">{t}</a>' for c, t in CATS)
    body = f"""
<section class="page-head">
  <div class="wrap">
    <h1 class="h1">メニュー</h1>
    <p class="lead">価格はすべて<b>税込</b>です。<span class="upd">メニューデータ更新日 {E(jdate(menu['updated']))}</span></p>
  </div>
</section>
<div class="catnav" id="catnav"><div class="wrap"><nav aria-label="メニューのカテゴリ">{nav}</nav></div></div>
<div class="wrap menu-wrap">
{secs}
</div>
{access_section(base, "お店の情報")}
"""
    return page("menu/", "menu", f"メニュー・価格(税込)｜{cfg['name']}",
                f"{cfg['name']}のメニューと税込価格。平日ランチ、一品料理、麺類、ご飯物、点心、ドリンク、テイクアウト。ニラレバ炒め、炙りチャーシューメン、あぶりセットが人気です。",
                body, depth=1)


# ------------------------------------------------------------------ ランチ・テイクアウト
def build_lunch():
    base = "../"
    lm = menu["lunch"]
    t = menu["takeout"]
    cards = "".join(dish(i, base, big=True) for i in lm["items"])
    collage = img("takeout/takeout-assort", "お持ち帰り用のいろいろなメニュー", base, "(min-width:860px) 300px, 70vw")
    body = f"""
<section class="page-head">
  <div class="wrap">
    <h1 class="h1">ランチ・テイクアウト</h1>
    <p class="lead">平日お昼のセットと、お持ち帰りのご案内です。価格はすべて<b>税込</b>。<span class="upd">更新日 {E(jdate(menu['updated']))}</span></p>
  </div>
</section>

<section class="msec wrap" aria-labelledby="lunch">
  <div class="plus-banner" role="note"><span>平日の夜と土日祝日は</span><b>＋100円</b><span>で注文できます♪</span></div>
  <h2 class="h2 left" id="lunch">{E(lm['title'])}</h2>
  {rules_html([r for r in lm['rules'] if '＋100円で注文' not in r], 'rules rules-plus')}
  <p class="soup">{T(msg['ramen_soup'])}</p>
  <div class="dishes two">{cards}</div>
</section>

<section class="msec wrap" id="takeout" aria-labelledby="take-h">
  <h2 class="h2 left" id="take-h">{E(t['title'])}限定のお得な4セット</h2>
  <p class="sub-note">パック代も込みの価格です</p>
  {takeout_block(base, full=False)}
  <div class="take-rules">
    <div class="take-photo">{collage}</div>
    <div>
      {rules_html(t['rules'][1:], 'rules rules-take')}
      <div class="cta"><a class="btn tel" href="{TEL}"><span aria-hidden="true">📞</span> お電話で注文 {E(cfg['phone'])}</a></div>
      <p class="small">{E(cfg['closed'])}は定休日です。</p>
    </div>
  </div>
</section>
{access_section(base, "お店の情報")}
"""
    return page("lunch-takeout/", "lunch", f"平日ランチ・テイクアウト｜{cfg['name']}",
                f"{cfg['name']}の平日お昼のセットメニュー(880円〜1,000円・税込)と、テイクアウト限定のお得な4セット。ラーメン以外は全てお持ち帰りできます。電話で時間指定OK。",
                body, depth=1)


# ------------------------------------------------------------------ お店について
def build_about():
    base = "../"
    front = img("shop/shop-front", "中華料理 大門の店構え。赤いのれんと看板", base, "(min-width:860px) 520px, 92vw", cls="front")
    body = f"""
<section class="page-head">
  <div class="wrap">
    <h1 class="h1">お店について</h1>
    <p class="lead">{E(msg['since'])}</p>
  </div>
</section>

<section class="sec about">
  <div class="wrap about-grid">
    <figure class="front-fig">{front}<figcaption>赤いのれんと大門の看板が目印です</figcaption></figure>
    <div class="story">
      <blockquote class="quote">
        <p>{E(msg['family'])}<br>{E(msg['anniversary'])}</p>
        <p class="small">本当にありがたく感謝しています。</p>
      </blockquote>
      <p>{E(msg['gentle'])}</p>
      <p>{E(msg['energy'])}</p>
      <p class="hand">{E(msg['wish'])}</p>
      <p>{E(msg['thanks'])}</p>
    </div>
  </div>
</section>

<section class="sec insta-sec">
  <div class="wrap"><div class="band">
    <div class="band-text">
      <h2 class="h2 left">最新情報はインスタで</h2>
      <p>{E(msg['instagram_note'])}</p>
      <p><a class="btn sub" href="{INSTA_URL}" target="_blank" rel="noopener">Instagram {E(cfg['instagram'])}</a></p>
    </div>
  </div></div>
</section>
{access_section(base)}
"""
    return page("about/", "about", f"お店について｜{cfg['name']}",
                f"{cfg['name']}は、家族だけでやっている小さな町中華屋です。おかげさまで55年目を迎えようとしてます。身体に優しい味付け、添加物は少なめ。{cfg['address']['locality']}・鏡島。",
                body, depth=1, jsonld=restaurant_jsonld())


# ------------------------------------------------------------------ 出力
def minify_css(css):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r"\s*([{};:,>])\s*", r"\1", css)
    return re.sub(r"\s+", " ", css).strip()


def main():
    global self_hosted, CSS_MIN
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    shutil.copytree(os.path.join(ROOT, "assets"), os.path.join(OUT, "assets"))
    CSS_MIN = minify_css(open(os.path.join(ROOT, "assets/style.css"), encoding="utf-8").read())
    os.remove(os.path.join(OUT, "assets", "style.css"))
    # 1回目: 使う文字を集める(書体を使わない形で組む)
    self_hosted = False
    home_html = build_home()
    collected = home_html + "".join([build_menu(), build_lunch(), build_about()])
    self_hosted = build_fonts({"home": set(home_html), "all": set(collected)})
    # 2回目: 書体つきで書き出す
    pages = {"index.html": build_home(), "menu/index.html": build_menu(),
             "lunch-takeout/index.html": build_lunch(), "about/index.html": build_about()}
    for k, v in pages.items():
        write(k, v)
    write("404.html", page("404.html", "", f"ページが見つかりません｜{cfg['name']}", "お探しのページが見つかりませんでした。",
                           '<section class="page-head"><div class="wrap"><h1 class="h1">ページが見つかりません</h1>'
                           '<p class="lead"><a class="textlink" href="' + (SITE + "/" if SITE else "/") + '">トップへもどる</a></p></div></section>',
                           base=(SITE + "/" if SITE else "/")))
    pages_list = ["", "menu/", "lunch-takeout/", "about/"]
    if SITE:
        write("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
              "".join(f"<url><loc>{SITE}/{p}</loc><lastmod>{menu['updated']}</lastmod></url>\n" for p in pages_list) + "</urlset>\n")
        write("robots.txt", f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")
    else:
        write("robots.txt", "User-agent: *\nAllow: /\n")
    n = sum(len(f) for _, _, f in os.walk(OUT))
    print(f"ok: {n} files -> {OUT}  (書体: {'自前の軽量版' if self_hosted else 'Google Fonts'})")


def write(path, text):
    p = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8").write(text)


if __name__ == "__main__":
    main()
