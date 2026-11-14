# 進捗（2026-11-14 時点）

詳細な工程は [plan.md](plan.md)（v0.5）。このファイルは、作業を再開するときの入口。

## 終わったこと

- **計画**: 工程計画 v0.5、独立レビュー2回（[review/](review/)）とその反映。ホワイトボード「西成泥酔旅行 リビルド工程計画」（claude.ai の artifact）。
- **P0（手元で完了、push 前）**: React Router v8 の雛形、版の固定、spec-kit 1.4.0、CLAUDE.md、CI の下書き（`CLOUDFLARE_ENV` による環境の選択、本番は main からの手動実行のみ）。型チェック・禁止パターンの検査・テスト・ビルドが通る。
- **P1（一部）**
  - 現行仕様台帳（[legacy/](legacy/README.md)）と差分台帳 v0.1（[deviations.md](deviations.md)）
  - ローカルの技術検証 a・b・c・f・g（[poc/2026-11-14-local-poc.md](poc/2026-11-14-local-poc.md)。試作はブランチ `poc/local`）

## 終わっていないこと

### Nao さんの準備（これが済まないと先に進めない）

1. GitHub と Claude の連携、新リポジトリの作成（名前、public / private）。environment（staging / production）と secrets の設定
2. Cloudflare（Workers 有料プラン、D1 を staging と本番の2つ `--location apac`、API トークン）、Firebase（Spark、Google ログイン、承認済みドメイン）、Google Cloud（Places API (New)、Maps JS、キーの分離、予算アラート）
3. nishinari-izakaya.net の登録状況と DNS の管理先の確認
4. 旧 DB（Koyeb）の接続情報を GitHub Secrets に登録。データの取り出しは Nao の PC か GitHub Actions で行う
5. Google テイクアウトで保存済みリストを書き出す

### Claude の作業（準備の後）

- P0: 新リポジトリへ push（`main` と `poc/local`）、staging への空デプロイ
- P1: 旧 DB の調査、技術検証 d（Firebase）・e（Places API）・staging での CPU 時間・実機でのドラッグ＆ドロップ・h（shadcn/ui の画面試作）、費用の試算。現行アプリの起動は任意（台帳で判断できないときだけ）
- P2: データ移行（旧 DB と保存済みリストの突き合わせ、place_id の付与、upsert での取り込み）
- P3〜P5: constitution とロードマップ、F1〜F6 の機能ごとのサイクル、統合検証
- P6〜P8: staging での受け入れと公開リハーサル、本番公開（現行サイトは停止中なので新規公開）、運用

## 再開のしかた

- このリポジトリは `nishinari-next.bundle`（Nao さんに送付済み）から復元できる: `git clone nishinari-next.bundle nishinari-next`
- クラウドセッションで再開するときは CLAUDE.md の「この作業環境での注意」を読む（`prisma generate` の付け方など）。
