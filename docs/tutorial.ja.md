# チュートリアル：0から受注入力画面まで

> **中身**: 何も無い状態から、明細つきの受注入力画面を1枚作って動かすまでを通しで1本。
> **読むとき**: 最初の30分。**先に読むものは無い**（導入もチートシートも、途中で必要になったら開く）。
> **要るもの**: Node（`npx` が動けばよい）。画面を出すところまで進むなら Flutter。

この1本で touched するのは**定義1枚と、道具7つ**。Flutter のコードは**1行も書かない**
（最後に貼る配線だけ、道具が書く）。

| 段 | やること | 道具 |
| --- | --- | --- |
| 1 | 何を作るかを決める | — |
| 2 | 雛形を出す | `hatake new` |
| 3 | 業務を書く | — |
| 4 | 書いたのに効かない所を潰す | `hatake validate` / `hatake fix` |
| 5 | **書いたものを読み返す** | `hatake explain` |
| 6 | 書き足したほうがいい所を聞く | `hatake advise` |
| 7 | アプリに繋ぐ | `hatake refs` / `hatake wire` |
| 8 | サーバと突き合わせる | `hatake probe` |

## 1. 何を作るか

受注入力。よくある形にする。

- ヘッダ：受注番号・受注日・得意先（マスタから選ぶ）・区分（法人/個人）・請求先
- **請求先は法人のときだけ必須**（個人には要らない）
- 明細：品名・数量・単価・金額（金額は数量×単価で自動）
- 金額：小計・消費税・合計（全部自動）

ここまでを**日本語で言えたら、定義はもう半分書けている**。定義に書くのはこの文章そのままだから。

## 2. 雛形を出す

```bash
npx hatake new form --id order_entry --title 受注入力 > order_entry.yaml
```

```yaml
dsl_version: "1.0"
page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository   # RepositoryRegistry に登録するキー
  key: id                  # レコードの主キー項目名
  form:
    sections:
      - title: 基本情報
        layout: { columns: 2 }
        fields:
          - { field: code, label: コード, type: text, required: true, normalize: [toHankaku, trim] }
          - { field: name, label: 名称, type: text, required: true }
```

`type: form` は**1件を入力する画面**。一覧は無い（一覧から開くなら `crud`）。
迷ったら [ページ種別の選び方](guide/page-types.ja.md)。

> **キーの名前や既定値で迷ったら仕様書を読まない。** 引く。
> `npx hatake reference requiredWhen` / `npx hatake examples 明細`

## 3. 業務を書く

雛形の項目を捨てて、1で決めたことを書く。

```yaml
dsl_version: "1.0"
page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: orderNo
  form:
    sections:
      - title: 受注情報
        layout: { columns: 2 }
        fields:
          - { field: orderNo, label: 受注番号, type: text, required: true,
              normalize: [toHankaku, trim], validators: [{ type: maxLength, value: 12 }] }
          - { field: orderDate, label: 受注日, type: date, required: true }
          - field: customerCode
            label: 得意先
            type: select
            required: true
            optionsSource: { repository: customerRepository, value: code, label: name }
          - field: kind
            label: 区分
            type: radio
            required: true
            options:
              - { value: corp, label: 法人 }
              - { value: person, label: 個人 }
          # 「法人のときだけ必須」は条件で書く（画面のコードには書かない）。
          - { field: billTo, label: 請求先, type: text,
              requiredWhen: { field: kind, value: corp } }

      # 明細。枠の見出しは付けない（subTable 自身の label が表の見出しになる）。
      - fields:
          - field: lines
            label: 明細
            type: subTable
            columns:
              - { field: productName, label: 品名, width: 220 }
              - { field: quantity, label: 数量, type: number, width: 90 }
              - { field: unitPrice, label: 単価, type: number, width: 120, format: currency }
              - { field: amount, label: 金額, type: number, width: 120, format: currency }
            fields:
              - { field: productName, label: 品名, type: text, required: true }
              - { field: quantity, label: 数量, type: number, required: true,
                  validators: [{ type: min, value: 1 }] }
              - { field: unitPrice, label: 単価, type: number, required: true,
                  validators: [{ type: min, value: 0 }] }
              # 行の中の計算：金額 = 数量 × 単価
              - { field: amount, label: 金額, type: number, readOnly: true,
                  computed: { op: product, fields: [quantity, unitPrice] } }

      - title: 金額
        fields:
          # 明細の合計と消費税は**組み込みには無い**（後述）。名前だけ書いておく。
          - { field: subtotal, label: 小計, type: number, readOnly: true, format: currency,
              computed: { op: sumLines, of: lines, field: amount } }
          - { field: tax, label: 消費税, type: number, readOnly: true, format: currency,
              computed: { op: consumptionTax, field: subtotal } }
          - { field: total, label: 合計, type: number, readOnly: true, format: currency,
              computed: { op: sum, fields: [subtotal, tax] } }
```

**保存ボタンは書かない。** `form` の画面には最初から出ている。
定義に書くのは「業務のボタン」（承認・却下・CSV 出力…）だけ。

### 組み込みで足りない所は、名前を書いて後で登録する

| 計算 | 組み込み | どうするか |
| --- | --- | --- |
| 金額（数量×単価） | ある（`product`） | そのまま書く |
| 合計（小計＋消費税） | ある（`sum`＝**同じレコードの項目**を足す） | そのまま書く |
| 小計（**明細の行**を足す） | **無い** | 名前（`sumLines`）を書いて、アプリで登録する |
| 消費税 | **無い**（税率は案件ごとに違う） | 名前（`consumptionTax`）を書いて、アプリで登録する |

名前を書いておけば、**何を登録すればいいかは道具が数える**（7段目）。

## 4. 書いたのに効かない所を潰す

```bash
npx hatake validate order_entry.yaml
```

わざと `width` を `witdh` と書いてみると、こう出る。

```
FAIL order_entry.yaml
     page.form.sections[1].fields[0].columns[2]: 知らないキー "witdh"（width の間違い？）
```

**知らないキーは黙って捨てられる**（＝幅を指定した気になる）ので、既定で弾く。
綴り違いのように**直し方が1つに決まる**ものは、手で直さない。

```bash
npx hatake fix order_entry.yaml --write
```

```
1 件を直しました:
  page.form.sections[1].fields[0].columns[2].witdh のキー名を width に直しました
```

通ったあとも、**通るけれど意図どおり動かない書き方**は警告で出る。試しに新規登録ボタンを足すと:

```yaml
  actions:
    - { id: create, type: create, label: 新規登録 }
```

```
OK   order_entry.yaml (form)
     警告 page.actions[0].type: 「新規登録」は押しても何も起きません（`type: create` が開くのは
          **一覧からの新規入力**なので、置けるのは crud / master です）。
          → この画面には保存ボタンが最初から出ています（新規登録のボタンは要りません）。
```

CI に置くなら `--warn-as-error`（警告でも終了コード 1）。

## 5. 書いたものを読み返す

**ここが一番大事**。綴りと構造は機械が見たが、「頼まれたことと合っているか」は機械には分からない。

```bash
npx hatake explain order_entry.yaml
```

```
受注入力（order_entry）— 1件を入力する画面（新規と編集の両方）

## データ
  ・データの出どころは orderRepository（アプリ側が用意する）。
  ・1件を指すキーは orderNo。

## 受注情報
  ・受注番号 … 必須、12 文字以内、保存前に整える（全角→半角・前後の空白を落とす）
  ・受注日 … 日付、必須
  ・得意先 … 選択、必須、選択肢は customerRepository から引く
  ・区分 … ラジオ、必須、選べるのは 法人 / 個人
  ・請求先 … 区分 が 法人 のときだけ必須

## 入力する項目
  ・明細 … 明細（表で複数行）、1行は 品名・数量・単価・金額、行はこのレコードと一緒に保存する

## 金額
  ・小計 … 数値、読み取り専用、他の項目から自動で計算する（手では入れない）、¥1,234,567 のように見せる
  ・消費税 … 数値、読み取り専用、他の項目から自動で計算する（手では入れない）、¥1,234,567 のように見せる
  ・合計 … 数値、読み取り専用、他の項目から自動で計算する（手では入れない）、¥1,234,567 のように見せる

## この画面でできないこと
  ・一覧は無い（開く先は呼び出し側が決める）
```

「できる操作」の節は**出ない**（ボタンを1つも書いていないので）。保存ボタンは定義に
書かなくても出るから、ここに出ないのが正しい。

1で日本語で決めたことと、1行ずつ見比べる。**「請求先 … 区分 が 法人 のときだけ必須」**が
出ていれば、条件の向きは合っている（逆に書くとここが逆に出る）。

- 1行でよければ `--brief`（README や PR に貼る用）
- PR に貼るなら `--markdown`
- 英語で読むなら `--lang en`（**ラベルは訳さない**＝業務の言葉なので）
- 直したあとの説明は `--diff`（[PR に自動で貼る仕掛け](guide/pr-comment.ja.md)）

## 6. 書き足したほうがいい所を聞く

```bash
npx hatake advise order_entry.yaml
```

助言は**好みの話**なので終了コードは変えない（「書いたのに効かない」は 4 段目の担当）。
案件の決めごとがあるなら物差しを渡せる（`--rules team.json`）。

## 7. アプリに繋ぐ

定義が**外に何を要求しているか**を数える。

```bash
npx hatake refs order_entry.yaml --needs-registration
```

```
repositories:
  customerRepository   ← 登録が要る
  orderRepository   ← 登録が要る
computedOps:
  consumptionTax   ← 登録が要る
  sumLines   ← 登録が要る
```

3段目で「名前だけ書いた」2つが、ここに出てくる。次に、繋ぐコードの**下書き**を出す。

```bash
npx hatake wire order_entry.yaml --base /api --out lib/wiring.dart
```

```dart
      home: HatakeScope(
        // 定義が名前を挙げた Repository。REST の口は hatake_http が持つ。
        repositories: RepositoryRegistry(restRepositories(
          baseUrl: '/api',
          send: _send,
          collections: {
            'customerRepository': 'customers',
            'orderRepository': 'orders',
          },
        )),
        // 組み込みに無い計算（入力から自動で埋める項目）。
        computeds: ComputedRegistry({
          'consumptionTax': (computed, record) =>
              throw UnimplementedError('consumptionTax: 計算の中身'),
          'sumLines': (computed, record) =>
              throw UnimplementedError('sumLines: 計算の中身'),
        }),
        renderer: const MaterialRenderer(),
        roles: const {}, // TODO: ログインから取る
        child: HatakePageView(definition: definition),
      ),
```

**中身は決められない**（何をするかは業務、どう繋ぐかは環境）ので TODO で空いている。
埋めるまでは実行時に落ちる＝**黙って何もしない実装は置かない**。埋めるのはこれだけ。

```dart
computeds: ComputedRegistry({
  'sumLines': (computed, record) {
    final rows = record['lines'];
    if (rows is! List) return 0;
    return rows.fold<num>(0, (sum, row) =>
        sum + ((row as Map)['amount'] as num? ?? 0));
  },
  'consumptionTax': (computed, record) =>
      taxOf(record['subtotal'] as num? ?? 0, rate: 0.10),
}),
```

画面を1枚増やしたら、**作り直さずに足す**。

```bash
npx hatake wire order_entry.yaml --merge lib/wiring.dart --write
```

```
足した computeds: discountRate
```

手で埋めた中身は1バイトも変わらない（消さない・並べ替えない・整形しない）。

## 8. サーバと突き合わせる

API を繋いだら、**宣言どおり返っているか**を叩いて確かめる。

```bash
npx hatake probe order_entry.yaml --base http://localhost:8080/api --token "$JWT"
```

食い違いは静かに出る（来なかった項目は空欄、文字で来た金額は合計から漏れる）。
`probe` はそれを言う。詳しくは [バックエンド連携](guide/backend.ja.md#宣言どおり返っているか-probe--attack)。

## できあがり

定義1枚（60行）と、業務の計算2つ。**画面のコードはゼロ**。

| 次に読むもの | いつ |
| --- | --- |
| [導入](getting-started.ja.md) | Flutter アプリに入れて動かすとき |
| [ページ種別の選び方](guide/page-types.ja.md) | 2枚目を作るとき |
| [cookbook](cookbook/) | 検索一覧・マスタ保守・請求書の税計算など、形の決まった画面 |
| [チートシート](api-cheatsheet.ja.md) | キーの名前を引くとき（AI に渡すのもこれ） |
| [MCP ガイド](guide/mcp.ja.md) | AI に定義を書かせるとき（道具を全部渡す） |

## つまずいたら

| 症状 | 見るもの |
| --- | --- |
| 書いたのに効いていない | `npx hatake validate`（知らないキーは弾かれる） |
| 意図と違う画面になった | `npx hatake explain`（読み返す） |
| どう書くのか分からない | `npx hatake examples <やりたいこと>` / `npx hatake reference <キー>` |
| なぜか転ぶ | `npx hatake pitfalls` / `npx hatake failures`（実際に転んだ例） |
| 押しても何も起きない | `npx hatake refs --needs-registration`（登録漏れ） |
