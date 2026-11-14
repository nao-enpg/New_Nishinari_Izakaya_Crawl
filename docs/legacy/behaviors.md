# 画面上の動き

現行は Turbo Drive が有効で、リンクとフォームは Turbo 経由でページを差し替える。削除などのリンクは `data-turbo-method="delete"`、確認ダイアログは `data-turbo-confirm`（ブラウザ標準の confirm）。

## 開閉ボタン（居酒屋一覧）

- 店名検索・タグ・地図の3つのボタンは、それぞれ対応する領域の表示と非表示を切り替え、ボタンの文言も切り替える（ページ内のスクリプト）。
- 初期状態はすべて閉じている。検索やタグの選択でページを移動すると、また閉じた状態に戻る（要確認）。

## 地図

- 一覧を開くと、Maps JavaScript API を `callback=initMap` 付きで読み込む。そのため、**地図を開かなくても、非表示の地図が毎回初期化される**（課金対象。C-006）。
- 地図を開くたびに、新しい地図を作り直す。
- Maps JS の `<script>` が本文にあるため、Turbo で一覧に戻るたびに読み込み直される（推定。Google の「複数回読み込み」の警告と、初期化の課金の増加。C-006）。
- 中心は (34.6492213, 135.5033723)、ズームは 16 で固定。
- 表示中の結果の全店にマーカー（`google.maps.Marker`。2024年から非推奨）を立てる。タイトルは店名。クリックすると `/izakayas/<id>` へ移る（言語の指定が消える → D-008）。
- 店のデータは `@izakayas.to_json` でページに埋め込まれる（住所・営業時間など全列を含む）。

## 現在地から近い10件

- ボタンを押すと `navigator.geolocation.getCurrentPosition` で現在地を取り、`/izakayas?lat=…&lng=…` に GET で送信する。
- 位置情報が使えないブラウザでは alert「Geolocation is not supported by this browser.」（英語の直書き）。
- **位置情報の許可が拒否されたときは何も起きない**（エラー処理なし）。
- 送信フォームは GET なので、言語の指定が消える（D-008）。
- 緯度経度はクエリ文字列でサーバーに送られる（アクセスログに残る。新しい実装ではログに出さない）。

## お気に入り

- 一覧のハートを押すと、Turbo Stream でボタンだけを差し替える（`favorites/_favorite_button`、`_favorite`、`_unfavorite`、`create/destroy.turbo_stream.erb`）。
  - 登録: `POST /favorites?izakaya_id=…` → 応答で `favorite-button-for-izakaya-<id>` を塗りのハートに差し替える。
  - 解除: `DELETE /favorites/<favorite_id>` → 応答で `unfavorite-button-for-izakaya-<id>` を白抜きのハートに差し替える。
- 2回押すと、サーバーは一意性チェックで 422 を返す。画面では、Turbo が 422 の HTML を描画しようとして**ページ全体を再読み込み**し、お気に入りは1件登録された状態になる（模擬環境で再現 → D-013）。2つの要求が同時に検証を通ると、一意制約が無いため重複行ができる。

## 旅程表への追加

- 一覧のカードで旅程表を選び、`追加` を押すと `POST /izakaya_plans` → 旅程表の詳細へ移る。
- 旅程表を選ばずに押すと保存に失敗し、`/izakayas` へ戻って alert「追加に失敗しました。」。

## 並べ替え

- 旅程表の詳細で、本人のときだけ SortableJS を有効にする（Stimulus の `sortable` コントローラ）。
- ドラッグ中の見た目は `bg-red-300`。カード全体がつかめる（ハンドルの指定は効いていない）。
- 離すと `PATCH /izakaya_plans/<id>/reorder` に `{ row_order_position: 新しい位置 }` を送る（`@rails/request.js` が CSRF トークンを付ける）。
- **送信の失敗は無視される**。画面は並べ替えた順のまま（D-018）。
- サーバーは ranked-model で `row_order` を更新する（値は離れた整数）。

## 名前のその場編集

- マイページの `名前を編集` は Turbo Frame `edit_profile` に編集フォームを読み込む。
- 送信すると Turbo Stream で次の3つを行う。
  - `profile` を新しい名前で差し替える
  - `edit_profile` を空にする
  - フラッシュを `flash` に追加する（**その要素が無いので表示されない** → D-011）
- `replace` で Turbo Frame の要素そのものが消えるため、**同じ画面で2回目の編集をすると壊れる**（推定 → D-012）。
- 名前が空だと、422 でフォームを再表示する。フラッシュはレイアウト側にあり、Turbo Frame の抽出で捨てられるので**表示されない**（模擬環境で再現。訳の誤り D-003 が見えるのは、JavaScript が無効なときだけ）。

## 削除の確認

- 旅程表の削除、旅程表の中の店の削除は、ブラウザ標準の確認ダイアログを出す。
- 文言は `plans.index.confirm_delete` / `plans.show.confirm_delete`（一覧の方は英語の訳が無い → D-005）。

## ログイン

- 「Googleログイン」は `/oauth/google` への GET リンク。Google の同意画面を経て `/oauth/callback?provider=google` に戻る。
- 初回はユーザーを作り（名前とメールアドレスを Google から取得）、`reset_session` してログインする。2回目以降は既存のユーザーでログインする。
- ログイン後は常にトップへ移動する（元のページには戻らない）。
- セッションはブラウザを閉じると切れる Cookie（有効期限なし）。
