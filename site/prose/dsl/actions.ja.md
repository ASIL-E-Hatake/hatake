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

## 押しても何も起きないボタンは、押す前に言う

`type` はどれも「その画面が持っているもの」に効く。持っていない画面に置くと、**定義は通り、ボタンも出て、押すまで気づけない**（押した人には壊れているように見える）。この枠組みで一番まずい転び方なので、`npx hatake validate` が押す前に言う。

| 書き方 | 押すとどうなるか | 規則 |
| --- | --- | --- |
| `create` を `crud` / `master` 以外に | 何も起きない（開く一覧が無い） | `create-action-unusable` |
| `export` を表の無い画面に | 何も出ない（CSV にする行が無い） | `export-without-rows` |
| `print` を `report` の無い画面に | 何も出ない（刷る紙が無い） | `print-without-report` |
| `plugin` に `plugin:` を書き忘れ | 何も起きない（呼ぶ相手が無い） | `plugin-without-name` |
| `navigate` の行き先がその画面自身 | 同じ画面がもう1枚開くだけ | `navigate-to-self` |
| `edit` / `delete` を行の外に | 何も起きない（行の操作なので） | `row-declaration-unused` |

判定は**1画面ぶんの情報だけ**で決まる（外の登録も、他の画面も見ない）。だから CI に置ける。

## いま押せるかどうかを、定義で言う

「出荷済は却下できない」を、押してから断るのではなく**ボタンの活性**で言う。条件の書き方は `visibleWhen` と同じ。

```yaml
table:
  rowActions: [openEntry]
actions:
  - id: openEntry
    type: navigate
    label: 明細編集
    page: order_entry
    params: { id: "$row.orderNo" }
    enabledWhen: { field: status, operator: notEquals, value: 出荷済 }
```

判定する相手は**置き場所で決まる**。行アクションはその行、一括（`scope: selection`）は選んだ行**全部**、入力する画面（`form` / `wizard`）のボタンは**いま入力されている値**、読むだけの画面（`detail`）のボタンはいま開いているレコード。一覧の上のボタンには判定する相手が無いので、書いても効かない（`validate` が言う）。

| 何で出し分けるか | 使うもの |
| --- | --- |
| 誰が使えるか（見えるかどうか） | `roles` |
| いまの状態で押せるか（出たまま灰色） | `enabledWhen` |
| 1回で動かせる件数 | `maxRows` |

押せないボタンは**消えない**。灰色のまま出て、**何の状態で決まるのか**が添えられる（文言は書かなくてよい＝条件から作る）。消してしまうと、その操作が在ること自体が分からなくなる。

一括は「選んだ行が全部満たすときだけ」押せる。合わない行が混ざっている間はボタンに件数が出る（「一括承認（3 件：1 件は条件に合いません）」）＝選び直せば押せることが、押す前に読める。

### 入力する画面では、保存を挟まずに変わる

「下書きに直したら送信できる」は、**直した時点で**押せるようになる。ボタンが見ているのは、項目の出し分け（`visibleWhen`）や計算（`computed`）が見ているものと**同じ record**（いま入力されている値）だからで、保存を挟む必要はない。

```yaml
    enabledWhen: { field: status, operator: equals, value: 下書き }
```

計算した項目でも書ける（`enabledWhen: { field: 合計, operator: gt, value: 0 }`＝金額が入るまで送信させない）。新規入力のときだけ押せるボタンは `{ mode: create }`。

保存しないと押せないままだと、押した人は「直したのに壊れている」と読む。**画面に出ている値で判定する**のがこの機能の意味です。読むだけの画面（`detail`）は入力が無いので、開いているレコードで判定する。

押せない理由に出る項目名は、その画面の見出しで言う（「いまは押せません（状態 によります）」）＝定義に書いた `label` をそのまま使う。

## params は navigate のためのもの

`params` は遷移先に渡す値。`$row.<項目>` / `$record.<項目>` で現在の行やレコードの値を埋められる。詳しくは「画面から画面へ遷移する」に書いた。

## 確認と成功後の動き

`confirm` と `onSuccess` はどの type にも書ける。ただし `create` / `edit` はフォームを開くだけで保存の成否がその時点では分からないので、`onSuccess` は動かない。詳しくは「確認ダイアログと成功後の動き」に書いた。
