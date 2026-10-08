# 中華料理 大門 ホームページ

岐阜市の町中華「中華料理 大門」のサイトです。メニューの価格やお知らせは、**`data/` の中の2つのファイルを直すだけ**で、全ページに反映されます。

- `data/menu.json` … 料理の名前・説明・値段、お知らせ
- `data/config.json` … 営業時間・住所・電話などお店の情報
- `images/` … 写真(ファイル名で差し替え)

---

## お店の方へ:よくある直し方

> GitHub の画面(ブラウザ)で直せます。直したら緑の **Commit changes** ボタンを押します。
> 数分でサイトに反映されます。**もし書き方をまちがえても、公開中のサイトはそのままで、こわれません**(まちがいがあると、反映が止まるだけです)。

### 1. 値段を変える
1. `data` → `menu.json` を開き、右上の **えんぴつ(Edit)** を押す
2. 直したい料理を探す(検索は `Ctrl + F`)。たとえばこんな行です:
   ```
   {"id": "nira-reba", "name": "ニラレバ炒め", "desc": "…", "price": 980, ...}
   ```
3. `"price": 980` の **数字だけ** を直す(`円` や `,` は入れません。例: `1050`)
4. ご飯物の大盛りは `"price_large"` です
5. ページ上のほうの `"updated": "2026-10-08"` も、直した日にします(メニューページの「更新日」に出ます)
6. **Commit changes** を押す

### 2. 臨時休業などのお知らせを出す
`menu.json` の一番上のほうにある `notice` を直します。

```
"notice": {
  "show": true,
  "text": "10月15日(水)は臨時休業いたします",
```
- `"show": true` にすると、**全ページの上**に目立つ枠でお知らせが出ます
- 終わったら `"show": false` に戻します(`text` はそのままでOK)
- 言葉は `" "` の中に書きます。文の中に `"` は入れないでください

> 急ぎの休みは、これまでどおり Instagram のストーリーでも案内してください。

### 3. 料理を足す・消す
- **消す**: その料理の `{ ... },` の1行をまるごと消します
- **足す**: 近い料理の1行をコピーして、下に貼り、中身を直します
  - `"id"` は、ほかと重ならない英語の名前にします(例: `"new-ramen"`)
  - 行のおしまいの **カンマ `,`** に気をつけます(一番最後の行にだけカンマをつけない)
- 品名の下に出る小さな注意書きは `"notes": ["…", "…"]`、女将さんのひとことは `"voice": "…"` です
- 札の「一番人気」などは `"badge": "一番人気"`(いらなければ行ごと消す)

### 4. 営業時間・住所・電話を変える
`data/config.json` を開いて、`hours`(営業時間)、`closed`(定休日)、`address`、`phone` などを直します。
駐車場・お支払い・席数も、ここ(`parking` `payment` `seats` `reservation`)です。

### 5. 写真を差し替える
- `images/dishes/` に、**料理の `id` と同じ名前**の写真(`nira-reba.webp` など)を上書きでアップロードします
- 写真がなかった料理に写真を足すときも、`id` と同じ名前で入れるだけで、カードに出ます
- 形式は **.webp**(.jpg / .png は、無料の変換サイトで webp にしてください)
- 大きさは、横 **800〜1200px** くらいがきれいです
- 店構えは `images/shop/shop-front.webp`、テイクアウトは `images/takeout/takeout-a.webp` … `takeout-d.webp`

### 6. 直したのに反映されないとき
- 数分待って、ページを再読み込みしてください
- GitHub の **Actions** タブに赤い × があれば、書き方のまちがいです。多くは **カンマ `,`** か **引用符 `"`** のぬけです。直前の状態に戻して、もう一度やってみてください

---

## 公開のしかた(最初の1回だけ・制作担当向け)

### GitHub Pages(無料)
1. このリポジトリを GitHub に置く(`main` ブランチ)
2. **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする
3. `main` に反映すると、自動で公開される(`.github/workflows/pages.yml`)
4. 公開アドレスは、独自ドメインがなければ `https://<アカウント名>.github.io/<リポジトリ名>/`
5. アドレスが決まったら **`data/config.json` の `siteUrl`** を直す(共有されたときの画像・検索用の情報に使われます)。独自ドメインの設定は Settings → Pages → Custom domain

### Netlify / Cloudflare Pages
- ビルドコマンド: `pip install -r requirements.txt && python3 build.py`
- 公開フォルダ: `site`
- 環境変数: `PYTHON_VERSION = 3.12`(`netlify.toml` に設定済み)

## 作りのメモ(制作担当向け)

```
data/menu.json        メニューとお知らせ(ページはここから作られる)
data/config.json      お店の情報・女将さんの言葉
data/menu_daimon.source.json   PDFから書き起こした元データ(突き合わせ用)
images/               写真(料理id.webp)。build.py がスマホ用サイズも作る
assets/               style.css / main.js / og.jpg(共有用画像)/ アイコン
fonts/src/            書体(Yusei Magic・Zen Maru Gothic、OFL)
build.py              HTMLを site/ に作る(標準ライブラリ+Pillow/fonttools)
tools/verify.py       内容・リンクの確認(python3 tools/verify.py)
tools/extract_images.py  メニューPDFから写真を取り出す
tools/make_og.py      共有用の画像を作り直す(Playwright)
```

- 作り直し: `pip install -r requirements.txt && python3 build.py` → `site/` ができます
- 確認: `python3 tools/verify.py`(元データとの突き合わせ・メニューにない情報が混ざっていないか・リンク切れ)
  - 価格を改定したあとは、元データとの突き合わせだけ「違う」と出ます(正しい動きです)。`--basic` ならリンク切れなどだけ確認します
- 書体は、**サイトで使う文字だけ**を取り出した軽いファイルをビルドごとに作ります(新しい文字を足しても自動で入ります)。`fonttools` が無いときは Google Fonts に切り替わります
- Googleマップは住所から自動で埋め込みます(`config.json` の `showMap` を `false` にすると枠ごと消えます)
- 予約フォーム・ネット注文はありません(電話が基本)
