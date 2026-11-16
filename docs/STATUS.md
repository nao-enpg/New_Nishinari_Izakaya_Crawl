# 進捗（2026-11-14 時点）

詳細な工程は [plan.md](plan.md)（v0.5）。このファイルは、作業を再開するときの入口。

## 終わったこと

- **計画**: 工程計画 v0.5、独立レビュー2回（[review/](review/)）とその反映。ホワイトボード「西成泥酔旅行 リビルド工程計画」（claude.ai の artifact）。
- **P0（一部）**: React Router v8 の雛形、版の固定、spec-kit 1.4.0、CLAUDE.md、CI。新リポジトリ（nao-enpg/New_Nishinari_Izakaya_Crawl、public）に `main` と `poc/local` を push 済み。CI の検査（型チェック・禁止パターン・テスト・ビルド）は通る。**staging へのデプロイは、Cloudflare のトークンが未登録のため失敗している**。
- **P1（一部）**
  - 現行仕様台帳（[legacy/](legacy/README.md)）と差分台帳 v0.1（[deviations.md](deviations.md)）
  - ローカルの技術検証 a・b・c・f・g と、**d のサーバー側**（ID トークンの検証、公開鍵の取得、旧ユーザーとの紐付け、セッション、CSRF 対策、`/__/auth` の中継）。[poc/2026-11-14-local-poc.md](poc/2026-11-14-local-poc.md)。試作はブランチ `poc/local`
  - **旧 DB の調査の準備**: 読み取り専用・集計値だけの SQL と、手動実行の Actions。合成データで確認済み。実行はまだ（[../scripts/legacy-db/README.md](../scripts/legacy-db/README.md)）
  - **費用の試算 v0.2**（[poc/2026-11-14-cost-estimate.md](poc/2026-11-14-cost-estimate.md)）: 単価は公式で確認。**写真は Places UI Kit で表示することに決定**（Nao、2026-11-14）。月 500 PV 程度（ほぼ日本から）の見込みで、写真は無料枠に収まり、月額はほぼ Workers の $5。日次クォータは1日 320件

## 終わっていないこと

### Nao さんの準備（これが済まないと先に進めない。上から順に）

1. **Cloudflare**: Workers の有料プランに入る。D1 を2つ作る（名前は `nishinari-staging` と `nishinari-production`、場所は Asia-Pacific）。API トークンを作る（ひな形「Edit Cloudflare Workers」に D1 の編集権限を足し、対象をこのアカウントと nishinari-izakaya.net に絞る）。アカウント ID を控える
2. **Claude に D1 の database_id を2つ伝える**（秘密情報ではない）。Claude が `wrangler.jsonc` に書く
3. **GitHub**: environment `staging` と `production` を作り、それぞれに secret `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を登録する。`production` の Deployment branches は main だけにする
4. **GitHub**: environment `legacy-db` を作り、secret `LEGACY_DATABASE_URL` を登録する（手順は `scripts/legacy-db/README.md`）。`p1/remaining` を main に入れたあと、Actions で旧 DB の調査を実行する
5. **Firebase**（Spark、Google ログイン、承認済みドメイン）、**Google Cloud**（Places API (New)、Maps JS、Places UI Kit。ブラウザ用キーは HTTP リファラーと API で制限する。予算アラートは任意）
6. Google テイクアウトで保存済みリストを書き出す
7. （任意）GA4 の数字。月 500 PV の見込みの確認用

決まったこと（2026-11-14）: 写真は Places UI Kit の部品をそのまま使う、日次上限は設けない、日本以外からのアクセスは止める（確認済みのボットは通す。C-017）、DNS は旧サイトのときから Cloudflare で管理している。

済んだこと（2026-11-16）: nishinari-izakaya.net に WAF のカスタムルール（日本以外を Block）を設定した。**確認済みのボットを通す条件（`and not cf.client.bot`）を足す必要がある**（足さないと検索エンジンと SNS のプレビューも止まる）。staging は当面 workers.dev（Cloudflare Access で閉じる）、P6 で `staging.nishinari-izakaya.net` を付ける。Worker はダッシュボードで作らず、初回の Actions のデプロイで作る。

### Claude の作業（準備の後）

- P0: staging への空デプロイ（Cloudflare の secrets の登録後）
- P1
  - 旧 DB の調査の実行（`p1/remaining` を main に入れ、Nao が Actions で実行・承認する）と、結果の整理
  - 技術検証 d の実機確認（Firebase プロジェクトと staging が要る。`/poc/auth` でリダイレクト方式とポップアップ方式を比べる）
  - 技術検証 e（Places API。キーが要る）、staging での CPU 時間、実機でのドラッグ＆ドロップ（f）
  - 技術検証 h（shadcn/ui の画面試作。写真の方式が決まってから）
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
