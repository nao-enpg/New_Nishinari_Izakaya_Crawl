# 旧 DB の調査（工程計画 P1-4）

旧 DB（Rails 版、Koyeb の PostgreSQL）を**読み取り専用**で調べ、移行の設計に要る数字を集める。
出力は件数・最大値・長さなどの集計だけで、メールアドレス・名前・uid などの値そのものは出さない。

| ファイル | 内容 |
| --- | --- |
| `survey.sql` | 調査の SQL。READ ONLY のトランザクションで実行し、最後に ROLLBACK する |
| `survey.sh` | `LEGACY_DATABASE_URL` を読んで `survey.sql` を実行する |
| `fixture.sql` | 確認用の合成データ（実データではない）。調べたい異常をわざと入れてある |
| `survey.expected.txt` | 合成データに対する期待値（1節以降） |
| `test-survey.sh` | 合成データで `survey.sql` を確かめる（手元の PostgreSQL が必要） |
| `../../.github/workflows/legacy-db-survey.yml` | GitHub Actions で実行するワークフロー（手動実行のみ） |

## 調べること

| 節 | 内容 | 使い道 |
| --- | --- | --- |
| 0 | PostgreSQL の版、DB のロケール、全角英字の大文字・小文字の扱い（実際の ILIKE の結果） | Q-009 |
| 1 | テーブルと列、適用済みのマイグレーション | `db/schema.rb` と一致しているかの確認 |
| 2 | テーブルごとの件数、番号の最小・最大、シーケンスの値、最終作成日・最終更新日 | 新しい番号の振り始め（P2-4）、停止後に書き込みが無いことの確認（P7） |
| 3 | パスワードを持つユーザー、`authentications` を持たないユーザー（そのうちデータを持つ人）、uid の形式、`(provider, uid)` の重複、`user_id` の孤立 | 旧ユーザーの紐付け（F3）、移行するユーザーの範囲 |
| 4 | 店名・紹介文・URL の欠け、前後の空白、同じ店名、URL の形（CID を含むか） | 店の突き合わせ（P2-2）、C-004 |
| 5 | タグの重複、店とタグの組の重複 | 移行での重複の除去 |
| 6 | 公開設定の NULL、空の旅程表名、`row_order` の NULL と同じ値の組、同じ店の重複 | 並び順の振り直し（P2-3）、D-014、D-015 |
| 7 | お気に入りの重複と孤立 | 一意制約の追加（D-013） |

## 実行のしかた

### A. GitHub Actions（推奨）

1. GitHub のリポジトリの Settings → Environments で、environment `legacy-db` を作る。
   - Deployment branches and tags: `main` だけにする。
   - Required reviewers: Nao を入れる（実行のたびに承認が要る）。
2. その environment の Environment secrets に `LEGACY_DATABASE_URL` を登録する。値は Koyeb の画面にある接続文字列（`postgres://…`）。**チャットには貼らない。**
3. このワークフローが `main` に入ったあと、Actions → 「Legacy DB survey (read-only)」→ Run workflow で実行し、承認する。
4. 結果は実行結果の Summary に出る。そのまま Claude に渡してよい（集計値だけなので）。

このリポジトリは public なので、Actions のログは誰でも読める。接続文字列の各部分はワークフローの中でログから伏せているが、`survey.sql` に行の値を出す変更を入れないこと。

### B. Nao の PC

```sh
read -rs LEGACY_DATABASE_URL && export LEGACY_DATABASE_URL   # 接続文字列を貼り付けて Enter（画面と履歴に残らない）
scripts/legacy-db/survey.sh > survey.txt
unset LEGACY_DATABASE_URL
```

`psql`（PostgreSQL のクライアント）が必要。

### 調査 SQL を変えたとき

```sh
TEST_DATABASE_URL='postgres://user:pass@localhost:5432/postgres' scripts/legacy-db/test-survey.sh
```

期待値を変える場合は、`fixture.sql` のコメントと `survey.expected.txt` を一緒に直す。

## 読み取り専用にしている仕組みと、残る注意

- SQL 全体を `BEGIN TRANSACTION READ ONLY` で囲み、最後に `ROLLBACK` する。途中で失敗したときは接続が切れ、何も確定しない。
- 1文あたり30秒で打ち切る（`statement_timeout`）。ロックは5秒で諦める（`lock_timeout`）。
- さらに安全にするなら、旧 DB に読み取り専用のロール（`SELECT` 権限だけ）を作り、その接続文字列を登録する。ロールを作る操作だけは書き込みになるので、Nao が Koyeb の画面か手元で行う。
