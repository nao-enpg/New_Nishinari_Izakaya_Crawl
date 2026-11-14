# 進捗（2026-11-14 時点）

詳細な工程は [plan.md](plan.md)（v0.5）。このファイルは、作業を再開するときの入口。

## 終わったこと

- **計画**: 工程計画 v0.5、独立レビュー2回（[review/](review/)）とその反映。ホワイトボード「西成泥酔旅行 リビルド工程計画」（claude.ai の artifact）。
- **P0（一部）**: React Router v8 の雛形、版の固定、spec-kit 1.4.0、CLAUDE.md、CI。新リポジトリ（nao-enpg/New_Nishinari_Izakaya_Crawl、public）に `main` と `poc/local` を push 済み。CI の検査（型チェック・禁止パターン・テスト・ビルド）は通る。**staging へのデプロイは、Cloudflare のトークンが未登録のため失敗している**。
- **P1（一部）**
  - 現行仕様台帳（[legacy/](legacy/README.md)）と差分台帳 v0.1（[deviations.md](deviations.md)）
  - ローカルの技術検証 a・b・c・f・g と、**d のサーバー側**（ID トークンの検証、公開鍵の取得、旧ユーザーとの紐付け、セッション、CSRF 対策、`/__/auth` の中継）。[poc/2026-11-14-local-poc.md](poc/2026-11-14-local-poc.md)。試作はブランチ `poc/local`
  - **旧 DB の調査の準備**: 読み取り専用・集計値だけの SQL と、手動実行の Actions。合成データで確認済み。実行はまだ（[../scripts/legacy-db/README.md](../scripts/legacy-db/README.md)）
  - **費用の試算 v0.1**: 単価は公式で確認。アクセス数は仮の値（[poc/2026-11-14-cost-estimate.md](poc/2026-11-14-cost-estimate.md)）。写真の方式で月額が桁違いに変わる（10,000 PV で、現計画は約 $470/月、Places UI Kit は約 $58、詳細だけなら約 $14、自前の写真なら $0）

## 終わっていないこと

### Nao さんの準備・判断（これが済まないと先に進めない）

1. **GitHub**: environment（staging / production）に Cloudflare の secrets を登録する。旧 DB の調査用に environment `legacy-db` と secret `LEGACY_DATABASE_URL` を登録する（手順は `scripts/legacy-db/README.md`）
2. **Cloudflare**（Workers 有料プラン、D1 を staging と本番の2つ `--location apac`、API トークン）、**Firebase**（Spark、Google ログイン、承認済みドメイン）、**Google Cloud**（Places API (New)、Maps JS、キーの分離、予算アラートと API ごとの日次クォータ）
3. nishinari-izakaya.net の登録状況と DNS の管理先の確認
4. Google テイクアウトで保存済みリストを書き出す
5. **GA4 の数字**（現行サイトが動いていた最後の12か月の、ページのパス別の月ごとの PV）
6. **写真の表示方式**（費用の試算の第4章の案 A〜D）と月の予算（日次上限の元になる）

### Claude の作業（準備の後）

- P0: staging への空デプロイ（Cloudflare の secrets の登録後）
- P1
  - 旧 DB の調査の実行（`p1/remaining` を main に入れ、Nao が Actions で実行・承認する）と、結果の整理
  - 技術検証 d の実機確認（Firebase プロジェクトと staging が要る。`/poc/auth` でリダイレクト方式とポップアップ方式を比べる）
  - 技術検証 e（Places API。キーが要る）、staging での CPU 時間、実機でのドラッグ＆ドロップ（f）
  - 技術検証 h（shadcn/ui の画面試作。写真の方式が決まってから）
  - 費用の試算の確定（GA4 の数字で差し替える）
  - 現行アプリの起動は任意（台帳で判断できないときだけ）
- P2: データ移行（旧 DB と保存済みリストの突き合わせ、place_id の付与、upsert での取り込み）
- P3〜P5: constitution とロードマップ、F1〜F6 の機能ごとのサイクル、統合検証
- P6〜P8: staging での受け入れと公開リハーサル、本番公開（現行サイトは停止中なので新規公開）、運用

## 再開のしかた

- ブランチ
  - `main`: 計画と台帳、雛形
  - `p1/remaining`: 旧 DB の調査の準備、費用の試算、この STATUS.md（**main へ未マージ**）
  - `poc/local`: 技術検証の試作（本線には入れない）
- クラウドセッションは environment「new_nishinari_izakaya_crawl」で始める（公式ドキュメントと shadcn のレジストリに届く）。CLAUDE.md の「この作業環境での注意」も読む（`prisma generate` の付け方など）。
- 手元では `nishinari-next.bundle`（Nao さんに送付済み）からも復元できる: `git clone nishinari-next.bundle nishinari-next`。ただし 2026-11-14 以降の作業は GitHub にだけある。
