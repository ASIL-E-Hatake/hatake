長い入力を数ステップに分けるときは `type: wizard` にして、`form` の代わりに `steps` を書く。

```yaml
page:
  type: wizard
  id: customer_wizard
  title: 顧客登録
  repository: customerRepository
  key: id
  steps:
    - id: basic
      title: 基本情報
      description: まず会社の基本情報を入力してください。
      layout: { columns: 2 }
      fields:
        - { field: code, label: コード, type: text, required: true }
        - { field: name, label: 会社名, type: text, required: true }
    - id: contact
      title: 連絡先
      description: 請求書の送付先になります。
      fields:
        - { field: email, label: メール, type: text, required: true,
            validators: [ { type: email } ] }
```

ステップは**書いた順**に進む。`title` がステップの見出し、`description` はその下に出る説明文（省略可）。

## 検証は「そのステップだけ」

「次へ」を押したときに検証されるのは、いま表示しているステップの項目だけ。後のステップの必須項目が空でも次に進める。

**保存は最後のステップで1回だけ。** 途中で離脱すれば何も保存されない。逆に言えば、途中の状態を残したい要求（下書き保存）には向かない。

## いつウィザードにするか

`form` で足りるならウィザードにしない。ステップに分けるのは次のようなときだけ。

- 入力項目が多く、1画面に並べると利用者が諦める（20項目を超えるあたりから）
- 前の入力によって後で聞くことが変わる（区分を選んでから、その区分の項目だけ聞く）
- 入力の順番に業務上の意味がある

逆に、項目が10個程度なら1画面のほうが速い。ステップは「戻って直す」のが面倒なので、分けるほど親切とは限らない。

## 確認ステップを作る

最後に確認用のステップを置くと、保存前に見直せる。入力欄を並べ直すのではなく、計算項目で読み取り表示にするのが手軽。

```yaml
- id: confirm
  title: 確認
  description: 内容を確認して保存してください。
  fields:
    - { field: summary, label: 登録内容,
        computed: { op: concat, fields: [code, name], separator: " / " } }
```

## ステップの中は普通のフォームと同じ

`fields` に書けるものは `form` のセクションと同じ。型、必須、検証、正規化、条件表示、計算項目、明細（`subTable`）まで全部使える。`layout` もステップごとに変えられる。

セクションで区切ることはできない（ステップそのものがセクションの役割を果たす）。1ステップに詰め込みたくなったら、ステップを分ける。

## key は1件を特定するため

`key`（既定は `id`）は、保存したレコードを識別するための項目。新規登録専用のウィザードでも、保存後にそのレコードを指すために使われる。
