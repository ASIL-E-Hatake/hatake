画面のボタンは `actions` に並べる。`type` がその挙動を決める。

```yaml
actions:
  - { id: create, type: create, label: 新規登録 }
  - { id: export, type: export, label: CSV出力, config: { filename: 顧客一覧, bom: true } }
  - { id: sync,   type: plugin, plugin: syncCustomers, label: 外部連携 }
```

## 6つの type で足りるか、足りないか

| type | 何をするか | 自分のコードが必要か |
| --- | --- | --- |
| `create` `edit` | フォームを開く | 不要 |
| `delete` | 確認してから削除する | 不要 |
| `navigate` | 別の画面へ移る | 不要 |
| `export` | 画面の列と行から CSV を組む | 出力先の登録だけ |
| `plugin` | 登録した処理を呼ぶ | **必要**（処理の中身） |

つまり**業務固有の処理は全部 `plugin`** に落ちる。承認する、外部システムに送る、帳票を作る、といったものはここ。

## plugin の中身は Framework の外に書く

`plugin: syncCustomers` は「`syncCustomers` という名前で登録された処理を呼ぶ」という指定でしかない。処理そのものは自分のコードで書いて、アプリ起動時に名前で登録する。Framework は業務ロジックを持たないので、ここが自分のコードとの境界になる。

定義側から渡せるのは `config`。同じ処理を画面ごとに少し変えたいときはここに差を書く。

## CSV 出力は「画面の見えているもの」が出る

`type: export` は、その画面の列定義と検索結果から CSV を組む。だから**ロールで見えない列は CSV にも出ない**。一覧の export は表示中のページではなく検索結果全体（`limit` まで）を出す。

`config` で `filename` / `delimiter` / `newline` / `bom` / `raw`（`format` を通さない生値）などを指定できる。Excel で開く前提なら `bom: true`。

**ファイルを実際に書くのは利用者側**。Framework はファイルシステムもダウンロードも知らないので、出力先を登録しておく必要がある。登録していなければ失敗する（`onSuccess` も動かない）。

## params は navigate のためのもの

`params` は遷移先に渡す値。`$row.<項目>` / `$record.<項目>` で現在の行やレコードの値を埋められる。詳しくは「画面から画面へ遷移する」に書いた。

## 確認と成功後の動き

`confirm` と `onSuccess` はどの type にも書ける。ただし `create` / `edit` はフォームを開くだけで保存の成否がその時点では分からないので、`onSuccess` は動かない。詳しくは「確認ダイアログと成功後の動き」に書いた。
