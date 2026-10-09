#!/usr/bin/env python3
"""メニューPDFから写真を取り出し、料理名(id)のファイル名で images/ に保存する。

使い方:  python3 -I tools/extract_images.py メニュー.pdf images/
  - PDF内の画像(透過マスク付きは透過PNG→WebP)を取り出す
  - カメラアプリの透かし(右下「B612」)は、下端をトリミングして外す
  - 焼き込み文字のあるテイクアウト写真は、文字のない帯だけ切り出す
ファイル名(=料理id)で menu.json と結びつくので、あとから同じ名前で
高解像度の写真に差し替えれば、サイト側の直しは要りません。
"""
import io, os, sys
import pymupdf
from PIL import Image

# id: (ページ, ページ内の画像番号, 下端トリミング率, 保存先フォルダ)
# 番号はPDF上の位置と近くの料理名から対応づけ、目視で確認済み。
DISHES = {
    # ── 一品料理(p1)
    "nira-reba":        (1, 1, .14, "dishes"),
    "tontou-chilimayo": (1, 0, .14, "dishes"),
    "mabo-tofu":        (1, 4, .14, "dishes"),
    "aburi-chashu":     (1, 2, .14, "dishes"),
    "ebi-chili":        (1, 10, 0,  "dishes"),
    "subuta":           (1, 3, .14, "dishes"),
    "cabbage-miso":     (1, 11, .14, "dishes"),
    "ebi-ten":          (1, 6, .14, "dishes"),
    "musuro":           (1, 12, .14, "dishes"),
    "yaki-buta":        (1, 13, .14, "dishes"),
    "happosai":         (1, 9, .14, "dishes"),
    "kani-tama":        (1, 5, 0,   "dishes"),
    "yasai-itame":      (1, 7, .14, "dishes"),
    "tori-karaage":     (1, 8, .14, "dishes"),
    # ── ランチ(p3)
    "lunch-aburi":      (3, 1, 0,   "dishes"),
    "lunch-mabo":       (3, 4, .14, "dishes"),
    "lunch-ramen":      (3, 0, 0,   "dishes"),
    "lunch-chuka":      (3, 3, .14, "dishes"),
    "lunch-subuta":     (3, 5, .14, "dishes"),
    "lunch-gyoza":      (3, 2, .14, "dishes"),
    "lunch-karaage":    (3, 6, .14, "dishes"),
    # ── 麺類(p4)
    "aburi-chashumen":  (4, 9, .14, "dishes"),
    "moyashi-ankake":   (4, 10, .14, "dishes"),
    "curry-ramen":      (4, 4, .14, "dishes"),
    "baribari-mabo":    (4, 2, .14, "dishes"),
    "ankake-torotama":  (4, 12, .14, "dishes"),
    "age-soba":         (4, 7, .14, "dishes"),
    "miso-ramen":       (4, 5, .14, "dishes"),
    "jajamen":          (4, 11, .14, "dishes"),
    "tenshin-men":      (4, 8, .14, "dishes"),
    "shoyu-ramen":      (4, 1, .14, "dishes"),
    "goku-ramen":       (4, 0, .14, "dishes"),
    "itame-yakisoba":   (4, 6, .14, "dishes"),
    "mabo-men":         (4, 3, 0,   "dishes"),   # 透かしが右上にあるので上をトリミング(TOP_CUT)
    # ── ご飯物・点心(p6)
    "mabo-meshi":       (6, 4, .14, "dishes"),
    "aburi-chashu-don": (6, 6, .14, "dishes"),
    "nikumiso-chahan":  (6, 12, .14, "dishes"),
    "karaage-chukameshi": (6, 2, .14, "dishes"),
    "chukameshi":       (6, 8, .14, "dishes"),
    "tenshin-han":      (6, 5, .14, "dishes"),
    "garlic-chahan":    (6, 9, .14, "dishes"),
    "goku-chahan":      (6, 1, .14, "dishes"),
    "kimchi-chahan":    (6, 10, .14, "dishes"),
    "nikumiso-don":     (6, 3, .14, "dishes"),
    "yaki-gyoza":       (6, 11, 0,  "dishes"),   # 203px: 小さく使う
    "shiso-cheese-harumaki": (6, 7, .14, "dishes"),
    # ── ドリンク(p2、透過PNG)
    "drink-draft-beer": (2, 0, 0, "drinks"),
    "drink-asahi-bottle": (2, 12, 0, "drinks"),
    "drink-kirin-lager": (2, 11, 0, "drinks"),
    "drink-kirin-ichiban": (2, 2, 0, "drinks"),
    "drink-dry-zero":   (2, 13, 0, "drinks"),
    "drink-highball":   (2, 14, 0, "drinks"),
    "drink-kurokirishima": (2, 3, 0, "drinks"),
    "drink-iichiko":    (2, 7, 0, "drinks"),
    "drink-lemonsour":  (2, 10, 0, "drinks"),
    "drink-cola":       (2, 8, 0, "drinks"),
    "drink-oolong":     (2, 9, 0, "drinks"),
    "drink-orange":     (2, 16, 0, "drinks"),
    "drink-tomato":     (2, 5, 0, "drinks"),
    "drink-ginger-ale": (2, 1, 0, "drinks"),
}
# 透かしやはみ出しが上側にある写真は、上端をトリミングする
TOP_CUT = {"mabo-men": .20, "kimchi-chahan": .20}

# 使わない素材(参考): 春巻き(150px)・熱燗/冷酒(ストック写真風で小さい)・ハイボールの重複

# 店構え・テイクアウト(焼き込み文字のある写真は、文字のない帯だけ使う)
# id: (ページ, 番号, 上端比, 下端比, フォルダ)
BANDS = {
    "shop-exterior":   (5, 5, 0, 1.00, "shop"),
    "takeout-a":       (5, 0, .22, .76, "takeout"),
    "takeout-b":       (5, 1, .22, .76, "takeout"),
    "takeout-c":       (5, 3, .22, .76, "takeout"),
    "takeout-d":       (5, 2, .22, .76, "takeout"),
    "takeout-assort":  (5, 4, 0, .86, "takeout"),
}

def load(doc, page, idx):
    xref = doc[page - 1].get_image_info(xrefs=True)[idx]["xref"]
    d = doc.extract_image(xref)
    im = Image.open(io.BytesIO(d["image"])).convert("RGB")
    if d.get("smask"):
        m = Image.open(io.BytesIO(doc.extract_image(d["smask"])["image"])).convert("L")
        im.putalpha(m.resize(im.size) if m.size != im.size else m)
    return im

def save(im, path, alpha):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if alpha: im.save(path, "WEBP", quality=90, method=6)
    else:     im.convert("RGB").save(path, "WEBP", quality=84, method=6)

def main(pdf, out):
    doc = pymupdf.open(pdf)
    for name, (pg, i, cut, folder) in DISHES.items():
        im = load(doc, pg, i)
        top = round(im.height * TOP_CUT.get(name, 0))
        im = im.crop((0, top, im.width, round(im.height * (1 - cut))))
        save(im, f"{out}/{folder}/{name}.webp", im.mode == "RGBA")
    for name, (pg, i, t, b, folder) in BANDS.items():
        im = load(doc, pg, i)
        im = im.crop((0, round(im.height * t), im.width, round(im.height * b)))
        save(im, f"{out}/{folder}/{name}.webp", False)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
