# 0.9.3 → 0.9.11 の上げ方

> **中身**: 0.9.4 から 0.9.11 までをまとめて上げるときに、**手で直す所**だけ。
> **読むとき**: `ref: v0.9.3` を指している案件を上げるとき。
> 変更の全部は [CHANGELOG](../../CHANGELOG.md)。ここは**動かなくなる所**に絞る。

この間はタグを切っていないので、**v0.9.3 の次は v0.9.11** です。1.0 で凍らせる前に、
破壊的な変更を入れきりました。**1.0 のあとは、ここに並ぶような変更は入れません**。

## 手で直す所は4つだけ

上から順に、当たる人が多い順です。**①以外はほとんどの案件で当たりません。**

| | 変わったもの | 当たるのは |
|---|---|---|
| ① | `keyField` → `keyFields`（3版） | **画面を Dart / Java から組み立てている案件**（YAML だけなら当たらない） |
| ② | `toCsv` の引数が1つ増えた | CSV を自分で書き出している案件 |
| ③ | `ColumnDefinition` に `options` が増えた | 列を Dart / Java から組み立てている案件 |
| ④ | Java の `FieldDefinition` / `FilterDefinition` に `options` が増えた | Java で項目を組み立てている案件 |

**YAML で定義を書いて、Repository を実装しているだけの案件は、①〜④のどれにも
当たりません。** `ref:` を差し替えるだけで上がります。

---

## ① `keyField` → `keyFields`

1件を指すのに**2つ以上の項目**が要る画面（受注明細＝受注番号＋行番号）を
持てるようにしたので、**1つの名前**から**名前の並び**になりました。

```dart
// 前
page.keyField            // 'orderNo'
CrudPageDefinition(keyField: 'orderNo', …)

// 後
page.keyFields           // ['orderNo']
CrudPageDefinition(keyFields: ['orderNo'], …)
```

同じ名前の所を機械的に直せます。

| 前 | 後 |
|---|---|
| `keyField: 'x'` | `keyFields: ['x']` |
| `page.keyField` | `page.keyFields` |
| `page.recordKeyField` | `page.recordKeyFields`（並び。無い画面は `null`） |
| `SubTableSource(keyField: 'x')` | `SubTableSource(keyFields: ['x'])` |
| `FakeRepository(rows, 'x')` | `FakeRepository(rows, ['x'])` |
| Java `page.keyField()` | `page.keyFields()` |
| TypeScript `page.keyField` | `page.keyFields` |

### 行から鍵を作る所

`record[keyField]` と書いていた所は、**そのままでは複合キーに当たりません**。

```dart
// 前
final key = record[definition.keyField];

// 後（単一なら素の値、複合なら RecordKey が返る）
final key = recordKeyOf(definition.keyFields, record);
```

### Repository は直さなくていい

`findByKey(Object key)` は**もともと `Object`** なので、口は変わっていません。

| 定義 | `findByKey` に渡るもの |
|---|---|
| `key: orderNo` | `'SO-1'` ── **いままでと同じ** |
| `key: [orderNo, lineNo]` | `RecordKey`（項目名と値の組） |

**複合キーを使うと決めた画面だけ**が新しい型を見ます。使わないなら、Repository は
1行も直りません。

複合キーを使うなら、REST は**宣言した順に道の区切り**として並びます。

```
key: [orderNo, lineNo]   →   GET /api/orderLines/SO-1/2
```

```java
@GetMapping("/api/orderLines/{orderNo}/{lineNo}")
public OrderLine find(@PathVariable String orderNo, @PathVariable int lineNo) { … }
```

> **並べた順は URL の一部です。** 並べ替えると別の1件を指します。

---

## ② `toCsv` の引数が1つ増えた

落とした CSV が**画面と違う字**になっていたので（一覧に「出荷済」と出ている列が
`shipped` で落ちていた）、選択肢を渡せるようにしました。

```dart
// 前
toCsv(columns, rows, options: options, formatters: formatters)

// 後（渡さなければ今までと同じ字。渡すと画面と揃う）
toCsv(columns, rows, options: options, formatters: formatters, owners: owners)
```

既定は空なので、**渡さなければ今までどおり動きます**。画面と字を揃えたいなら、
その画面の選択肢（`optionOwnersOf(page)`）を渡してください。

TypeScript は5つ目、Java は5つ目の引数です（どちらも省略できます）。

---

## ③④ `options` が増えた（列・項目・検索条件）

コード表をアプリに1回だけ書けるようにしたので（`app.vocabularies`）、
その実体が入る場所が要りました。

**定義には書けません。** 列に書けるのは名前だけ（`optionsOf`）で、実体は
読み込み時に入ります。組み立てているコードで名前つき引数を使っていれば、
**何も直らずに通ります**（既定は空）。

Java は record なので、**正式コンストラクタを直に呼んでいる所だけ**直しが要ります。
短縮コンストラクタはそのまま使えます。

```java
// 直しが要る（引数の数が増えた）
new ColumnDefinition(field, label, type, format, config, roles)
new ColumnDefinition(field, label, type, format, config, roles, options)

// そのままでよい
new ColumnDefinition(field, label, type, format, config)
```

---

## 直さなくていいのに、良くなっている所

上げるだけで効きます（**手で直す所はありません**）。

- **詳細画面の明細が表で出る**。前は `[{orderNo: SO-1, lineNo: 1}]` と1行で出ていた
- **詳細画面と CSV が、一覧と同じ字になる**（`shipped` ではなく「出荷済」）
- **`hatake openapi` が app 1枚から全画面ぶんを出す**。詳細画面の `GET /{key}` も宣言する
- **検証が言うことが増えた**。合計が黙って 0 円になる書き方・埋まらない差し込み・
  誰にも出ないステップ・シナリオの鍵の書き間違いなど

> 最後の1つだけ注意: **これまで緑だったものが赤くなることがあります。**
> それが目的です（黙って間違っていたものを言うようにしたので）。

---

## 上げる手順

```bash
# 1. 参照を差し替える（pubspec.yaml / package.json / build.gradle）
#    v0.9.3 → v0.9.11
# 2. 取り直す
flutter pub get      # Flutter
npm install          # TypeScript
./gradlew build      # Java
# 3. まず検証にかける（**動かす前にここで出る**）
npx hatake check definitions/app.yaml
```

`check` が言うことは、**直さないと動かないもの**（事実）と
**直したほうがいいもの**（好み）に分かれています。終了コードを動かすのは前者だけです。

## つまずきポイント

| 症状 | 原因 |
|---|---|
| `keyField` が無いと言われる | ① の名前の変更。`keyFields`（並び）に直す |
| 一覧の選択がおかしい（同じ行が2回数えられる） | 鍵を `record[...]` で直に作っている。`recordKeyOf` を通す |
| これまで緑だった検証が赤くなった | 黙っていた間違いを言うようになった。**中身を見てから**直す |
| シナリオが「知らないキー」で止まる | 値の入り口は `record`。`input` などは黙って捨てられていた |
| 合計が 0 になると言われた | `computed` に `fields` も `field` も無い。前から 0 だったのが、言うようになった |
