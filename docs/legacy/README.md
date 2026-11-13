# 現行仕様台帳（Rails 版）

現行サービス「西成泥酔旅行」（[nao-enpg/Nishinari_Izakaya_Crawl](https://github.com/nao-enpg/Nishinari_Izakaya_Crawl)、コミット `source/COMMIT`）の振る舞いを、コードから書き起こしたもの。
新しい実装の spec（`/speckit-specify`）は、この台帳の該当する節を根拠にする。現行と違う振る舞いにする場合は、`../deviations.md` に記録して承認を得る。

| ファイル | 内容 |
| --- | --- |
| [routes.md](routes.md) | URL・メソッド・必要なログイン状態・パラメータ・応答の一覧 |
| [screens.md](screens.md) | 画面ごとの構成要素・文言・状態による表示の違い |
| [behaviors.md](behaviors.md) | 画面上の動き（開閉、地図、現在地、お気に入り、並べ替え、名前のその場編集など） |
| [data.md](data.md) | テーブルと列、移行での扱い |
| [i18n.md](i18n.md) | 言語の切り替えと文言（訳の抜け、直書きの文言） |
| [external.md](external.md) | 外部サービス・SEO・静的ファイル |
| [source/](source/) | 文言の元ファイル（ロケール YAML）、静的ページ（規約・プライバシー・問い合わせ・トップ）、移植する画像 |

## 書き方の約束

- 「（バグ）」は、現行の動きだが新しい実装では直すもの。差分台帳の ID を併記する。
- 「（要確認）」は、仕様か不具合か判断が必要なもの。各機能の `/speckit-clarify` で Nao に確認する。
- 行番号は `source/COMMIT` の版のもの。
- まだ実際の画面では確かめていない。P1 の基準採取（Playwright での撮影）で裏付ける。
