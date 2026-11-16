# 助成金シミュレーター(物件王・社内専用)

人材開発支援助成金「人材育成支援コース(人材育成訓練)」と「事業展開等リスキリング支援コース」の、助成金額の目安を計算する、1つのHTMLのツールです。
入力した数字は、ブラウザの中だけで計算します。外部へ送らず、保存もしません(クッキー・ローカルストレージ・解析ツールなし)。

仕様は `docs/spec.md`。

## ファイル

| ファイル | 役割 |
|---|---|
| `params.json` | 制度の数字のすべて。各項目に、出典(資料名・条文やページ・URL)と確認日がある。**数字は、ここだけに書く** |
| `calc.js` | 計算(画面なし)。ブラウザでも Node.js でも動く |
| `template.html` | 画面と書類(印刷用)の元。`{{PARAMS}}` `{{CALC}}` `{{LOGO}}` の場所に、ビルドで埋め込む |
| `build.py` | 上の3つと `assets/logo.png` を、1つのHTML(`dist/index.html`)にまとめる |
| `tests/run.js` | 計算のテスト(仕様書の正解データ10例、境界、日付、判定) |
| `tests/crosscheck.py` | 別の書き方(整数演算)で、ランダム20条件を、`calc.js` と突き合わせる |

## 使い方

```bash
python3 subsidy-simulator/build.py          # dist/index.html をつくる
node subsidy-simulator/tests/run.js         # 計算のテスト
python3 -I subsidy-simulator/tests/crosscheck.py
```

`dist/index.html` は、ファイルを開くだけで動きます。

## 年1回の見直し(毎年度、年度が変わる前に)

画面の右上に「令和◯年度の数字」と出ます。年度が変わる前に、次の手順で見直します。

1. 厚生労働省の「人材開発支援助成金」のページ
   (https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/kyufukin/d01-1.html)
   で、新年度の、パンフレット(詳細版)と支給要領を探す。
   - 人材育成支援コース: パンフレット(詳細版)、支給要領 (1)
   - 事業展開等リスキリング支援コース: パンフレット(詳細版)、支給要領 (6)
   - リスキリングコースは、令和8年度末までの時限措置。新年度に続くか、必ず確かめる。
2. `params.json` の項目を1つずつ見る。確認する項目:
   経費助成率・賃金助成額・加算の率と単価・経費助成の限度額(3区分)・eラーニングの限度額・
   賃金助成の上限時間・1人1年度の回数・1事業所1年度の上限・受講率の下限・
   計画届と支給申請と加算申請の期限・中小企業の定義・設備投資加算(リスキリング)・
   端数処理(未確認のまま。確認できたら `common.rounding` を直す)。
3. 変わった値は `value` を直し、`source`(資料名・条文やページ・URL)と `verified`(確認日)も直す。
   `_meta` の `fiscalYear`・`verifiedOn`・`fiscalYearEnd`・`appliesToPlansSubmittedOnOrAfter` も直す。
4. `tests/run.js` の期待値のうち、数字が変わったものは、新しい資料から手で計算し直す。
   計算の仕組みが変わった場合は、`calc.js` と `template.html` の文言(チェックリスト)も直す。
5. `node subsidy-simulator/tests/run.js` と `crosscheck.py` が、全部通ることを確かめる。
6. `python3 subsidy-simulator/build.py` で作り直し、配り直す(公開の方法は、ステップ4で決める)。

数字を、`calc.js` や `template.html` に、直接書かないでください。

## 注意

- 端数処理の規定は、資料で確認できていません。いまは円未満切り捨て(仮)です。
- 社会保険労務士の注意文は、2026-11-16に、現在の文言で確定しました(既存のスライドに原文がなかったため)。変える場合は、`template.html` の2か所(画面と書類)を直します。
- 更新の担当者は、決めていません。暫定で、Apps Script の所有者が担当します。
- 令和9年度の制度は、資料で確認できていません。
- 年度は、支給申請日を基準に、4月1日から翌年3月31日までです。
