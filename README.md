# エリア調査シート 自動生成ツール

会社名と商圏(都道府県・市区町村)を設定ファイルに書いてコマンドを1回実行すると、商談用の
1ページ完結LP(静的HTML)・PDF・`data.json`・取得レポートを生成します。

## クイックスタート

```bash
pip install -r requirements.txt
python -m areasheet generate configs/example-ueda.yaml      # LP + PDF + チェックまで一括
```

出力は `out/<ランダムID>/` に作られます(同じ 会社×県×市 なら同じIDを再利用。`--new-id` で払い出し直し)。

| ファイル | 内容 |
|---|---|
| `index.html` + `assets/` | LP本体。画像・CSS・JS・フォント(Noto Sans JP)をすべて同梱。外部サービス不要。`noindex` 設定済み |
| `area-survey.pdf` | A4横・セクションごと改ページ(Chromiumがあれば自動生成。無ければブラウザの印刷から保存) |
| `data.json` | 取得した全データ(出典・日付つき)と取得レポートの機械可読版 |
| `report.md` | **取得レポート**(自動で埋められなかった項目と理由の一覧) |

オプション: `--refresh`(取得済みデータを使わず再取得) / `--offline` / `--no-pdf` / `--strict`(未入力があれば終了コード2) / `--out DIR`。
生成処理は `areasheet.cli.generate(config_path, ...)` として切り出してあり、将来のフォーム/GASからは
この関数かCLIを呼び出せます。LPのホスティング先は未定でも、`out/<ID>/` を丸ごと置くだけで動きます。

## 設定ファイル

`configs/example-ueda.yaml` が全項目の見本です(サンプル上田市版の数値)。

```yaml
company: 株式会社○○            # 必須
prefecture: 長野県               # 必須(「長野」でも可)
city: 上田市                     # 必須(2021年1月時点の市区町村名)
created: 2026-01-19              # 省略で当日
cta_url: https://...             # 設定した場合のみ、表紙と末尾に「お問い合わせ」ボタン
nearby_franchise: [...]          # 任意: 周辺加盟店の上書き
compare_cities: [...]            # 任意: 土地の比較5市の上書き(inputs.land.compare_cities でも可)
competitors: [{name, area, url, listing_count}]   # 近隣不動産会社3社
options:
  trend_same_threshold_pt: 1.0   # 県との差がこの範囲内なら「同程度」
  point_round_unit: 10           # POINTの切り上げ単位(414→420)
  franchise: {max: 3, tiers: [same_city, adjacent, same_prefecture], stop_at_first_tier: true}
inputs:                          # 自動取得できない値(出典名`source`と取得日`date`も必須)
  area / income / price_trend / land / used_house / used_mansion / new_house / keywords
  listings_csv: path/to/listings.csv   # 物件データCSVがあれば相場・中央値・分布表を自動集計
```

- `inputs.*` の値は自動取得・CSV集計より優先されます(上書き)。
- 年収階級は `households` か `share` のどちらでも可。構成比と本文は自動計算。
- 価格推移グラフは `price_trend.series`(labels と 中古マンション/中古戸建て/土地 の数値列)で描画、または `price_trend.image`(画像)。
- 面積×価格の分布表は物件データCSV、または `inputs.<種別>.heatmap_image`(画像)。
- キーワードは `term`(土地/中古マンション/不動産/中古物件)ごとに月間ボリュームとクリック単価を入力。検索ボリューム降順に並びます。

### 物件データCSV(任意)
列: `type`(土地/中古戸建て/中古マンション/新築戸建て), `price_man`, `land_area_m2`, `building_area_m2`,
`exclusive_area_m2`, `age_years`, `zone`(「低層」を含む=低層住居専用、「住居」を含む=その他の住居専用), `city`(任意)。
物件数・売却価格相場(中央値)・面積/築年数の中央値・坪単価・分布表を集計します。

## 何が自動で、何が入力か(正直なところ)

| 項目 | 方法 |
|---|---|
| 地図・隣接市・市町村数 | 自動(国土数値情報 行政区域 2021-01-01。GitHub `smartnews-smri/japan-topography` 経由で取得し `data/cache/` に保存) |
| 世帯数 | 環境変数 `ESTAT_APP_ID` があれば e-Stat(令和2年国勢調査)から取得。**実機未検証**(開発環境から e-Stat に届かなかったため)。失敗時は `inputs.area.households` へ |
| 周辺加盟店 | 自動(`data/franchises.csv` から 同一市→隣接市→同一県 の順に最大3社。最初に該当があった段階で止まる) |
| 年収・価格推移 | 入力(LIFULL HOME'Sは自動取得を行わない方針)。出典名は実際のものを記載 |
| 土地・中古・新築の相場/物件数/分布 | 物件データCSV、または入力。REINS・SUUMOの自動取得はしない |
| 検索ボリューム/CPC | 入力(Google広告APIは未接続) |
| 近隣不動産会社3社 | 入力(検索結果の自動取得は規約上行わない)。検索語は `data.json` の `competitors.queries` |
| 物件総数・仲介単価・POINT・各文章・P10の転記 | 自動計算(二重入力なし) |

未入力の箇所はLP上に黄色の入力案内枠が出て、`report.md` に理由つきで載ります。推測値・過去値では埋めません。

## 加盟店一覧の更新

正本は **`data/franchises.csv`**(列: name, prefecture, city, address, url, active)。直接編集するか、
マイマップ等からエクスポートしたKML/CSVを取り込みます(マップを公開する必要はありません)。

```bash
python -m areasheet import-franchises export.kml            # 追記・更新(同名+同市は上書き)
python -m areasheet import-franchises export.csv --replace  # 一覧を丸ごと置き換え
```
KMLは住所(`address`/拡張データ「住所」)から都道府県・市区町村を判定します。判定できなかった行は報告して除外します。
掲載を止める加盟店は `active` を `0` にします。※同梱の一覧はサンプルの2社のみです。

## 固定画像の差し替え
- `assets/brand/` … ロゴ(`logo-teal.png`/`logo-white.png`)、王様(`king.png`)、考える人物(`thinker.png`)
- `assets/fixed/franchise-listings.png` … 「弊社加盟店様の物件情報量」の画像(同名で上書きすれば反映)

## 検証

```bash
python -m pytest -q tests          # 内部整合性・文章・残骸・加盟店選定・CSV集計
CHROME=... node tools/screenshots.mjs file://$PWD/out/<ID>/index.html /tmp/shot 375 768 1280 1920   # npm i 後
```
生成のたびに自動で次を検査し、結果は実行出力に出ます: 物件総数=種別合計 / 仲介単価=(相場×3%+6万円)の物件数加重平均(税抜) /
3年上昇率=内訳合計 / 年収階級の構成比=100%±0.5 / 全国との差=全国−市 / まとめの数値=各セクション /
サンプル由来文字列(上田・リフォームワン等)の残骸 / 会社名・市区町村・作成日が入力値になっていること。

## 判断した仕様(設定で変更可)
- 坪単価が用途地域別相場より低い場合、「全物件(用途地域問わず)の中央値のため」と注記を出します。
- 比較5市の既定候補は、隣接市(境界の長い順)。人口データが未接続のため、値は `inputs.land.compare_cities` に入力します。
  (上田市は須坂市と実際に隣接しています)
- 仲介単価の表示は四捨五入した整数(46.75→約47万円)。POINTは物件総数を10件単位で切り上げ(要確認)。

## ライセンス・出典
フォント Noto Sans JP(SIL OFL 1.1、`areasheet/static/fonts/LICENSE-NotoSansJP-OFL.txt`)。
行政区域: 国土数値情報(国土交通省)、加工: smartnews-smri/japan-topography。
