# 物件王 助成金説明スライド

| ファイル | 内容 |
|---|---|
| `slides.html` | **成果物**。1ファイル完結(CSS・JS・ロゴ埋め込み)。ダブルクリックでブラウザで開く |
| `slides.pdf` | 上記を印刷した PDF(A4横・1スライド=1ページ・16ページ) |
| `slides-text.md` | 全ページの文言(Gamma等で作り直す用) |
| `transcript-original.md` | 元のGamma資料の書き起こし(照合用) |
| `src/slides.src.html` | `slides.html` の元(ロゴだけ `__LOGO__` の印) |
| `build.py` | `python3 build.py` で `slides.html` を作り直す |
| `assets/logo-color.png` | ロゴ(カラー版) |
| `rough/` | 最初のデザイン案 |

## 操作
`←` `→` `Space` `PageUp/Down` `Home` `End` で移動 / `F` 全画面 / `L` 一覧(縦スクロール)/ `T` 目次 / スワイプ可。
`slides.html#10` のように `#ページ番号` で直接開けます。スマホ幅では自動で縦積み表示になります。

## 文言を直すとき
`slides.html`(または `src/slides.src.html`)を開き、`<!-- ===== N. 見出し ===== -->` のコメントを目印に直接書き換えます。
色・フォント・文字サイズは先頭の `:root{ … }` と、その下のCSSです。ページ番号は自動で振られます。

## PDFを作り直すとき
ブラウザで `slides.html` を開き、印刷 → 送信先「PDFに保存」→ 用紙 A4・横・余白「なし」・「背景のグラフィック」オン。
