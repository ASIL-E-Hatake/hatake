「本当に削除しますか」と「保存できたらこう動く」は、定義に書く。Dart やプラグインで書くものではない。

```yaml
actions:
  - id: delete
    type: delete
    label: 削除
    confirm:
      title: 顧客の削除
      message: この顧客を削除すると、受注履歴から辿れなくなります。よろしいですか？
      okLabel: 削除する
      danger: true
    onSuccess:
      message: 顧客を削除しました
```

## 削除は書かなくても確認される

`delete` は宣言しなくても必ず確認ダイアログが出る。`confirm` をわざわざ書くのは、次のどちらかのとき。

- 一般的な文言ではなく、**業務の言葉で聞きたい**とき（上の例のように、消すと何が困るのかを書く）
- `danger: true` で、取り返しがつかない操作だとハッキリ見せたいとき

逆に、確認が要らない操作にはそもそも書かない。

## 終わったあとの動きは onSuccess

保存や削除が成功したあと何をするか。メッセージを出すだけなら `message`、別の画面に戻したり送ったりするなら遷移先を書く。

```yaml
onSuccess:
  message: 登録しました
  page: customer_master     # 一覧に戻る
```

これを画面側のコードで書くと、「保存後の挙動」が定義と実装に散って追えなくなる。定義に書いておけば、画面の振る舞いは定義を読むだけで全部分かる。

## 実行の前に聞くなら prompt

「却下の理由を書いてから却下」は業務でそのまま来る。`confirm` は「はい / いいえ」しか聞けないので、ここで止まると**アプリに手書きのダイアログ**が必要になる（このフレームワークが無くしたい物がそこで戻ってくる）。

```yaml
prompt:
  title: 却下の理由
  okLabel: 却下する
  fields:
    - { field: reason, label: 理由, type: textarea, required: true }
    - { field: rejectedOn, label: 却下日, type: date }
```

聞くのは**普通の項目**なので、型・`required`・`validators`・`computed`・`normalize` がフォームと同じに効く。書いていなければ実行されず、ダイアログは開いたまま（閉じてしまうと書き直す場所が無くなる）。値は保存と同じ正規化を通ってからハンドラに届く。

```dart
'rejectOrders': (ctx) async {
  await api.reject(ctx.records, reason: ctx.input['reason']);
},
```

**確認ダイアログは増えない。** 聞くことがあるなら、その OK が確認そのもの。`confirm` に書いた文言・ボタン名・`danger` はこのダイアログが引き取る（2枚続けて出すのは、読まずに押す練習をさせるだけ）。

一括（`scope: selection`）でも**聞くのは1回**で、選んだ行に同じ理由が付く。行ごとに聞かれたら誰も使わない。

受け取れるのは `type: plugin` だけ。ほかの型は聞いた値の行き先が無いので、`npx hatake validate` が警告する。

## 失敗したときの文言は onError

書かなければ、失敗の理由がそのまま出る（`RepositoryHttpException: … 500 …`）。事実だが業務の言葉ではないし、同じ失敗が画面ごとに違う意味を持つ（「在庫が足りません」「締め済みなので直せません」）。

```yaml
onError:
  message: 受注が残っているので削除できません（{error}）
```

**`onError` に遷移先は書けない。** `onSuccess` は書けるのに無いのは意図的で、失敗した画面から離れると、何が起きたか読めなくなり、直すべき行も視界から消える。

`{error}` は失敗の理由。ほかに `{count}` / `{failed}` / `{total}`（件数）が書けるが、**埋まるのは一括（`scope: selection`）のときだけ**。埋まらない差し込みは文字のまま出てしまうので、`npx hatake validate` が押す前に言う（`placeholder-not-filled`）。

## 一括は「一部だけ失敗」が普通

5件のうち1件だけ出荷済みで承認できなかった、は失敗でも成功でもない。ハンドラが件数を返すと、何と言うかは定義が決める。

```dart
'approveOrders': (ctx) async {
  final rejected = await api.approve(ctx.records);   // 呼ぶのは1回
  ctx.report(ActionOutcome(
    succeeded: ctx.records.length - rejected.length,
    failed: rejected.length,
  ));
},
```

```yaml
onSuccess: { message: '{count} 件を承認しました' }
onError:   { message: '{count} 件を承認しました（{failed} 件は出荷済み）' }
```

**1件でも失敗が残っていれば `onSuccess` は動かない。** 画面を移してしまうと、直すべき行が視界から消えるため。何も報告せずに戻ったら成功扱いで、一括なら渡した行数がそのまま `{count}` に入る。

## 文言だけ差し替えたいとき

`okLabel` / `cancelLabel` はボタンの文字。`title` はダイアログの見出し。省けば既定の文言が出るので、変える必要があるところだけ書く。
