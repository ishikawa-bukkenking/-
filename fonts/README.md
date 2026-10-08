# 書体

- **Yusei Magic**(見出し)/ **Zen Maru Gothic**(本文)— どちらも Google Fonts の書体で、SIL Open Font License 1.1 のもと、
  サイトでの利用・同梱・再配布ができます(<https://openfontlicense.org/>)。
- `src/` の TTF は元データです。`build.py` が、サイトで実際に使う文字だけを取り出して軽い woff2 を作ります
  (メニューに新しい文字を足しても、ビルドのたびに自動で入ります)。
