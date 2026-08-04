# レシピ: 消費税・適格請求書（インボイス）

> **中身**: 内税/外税・端数処理・**税率別合計**を業務要件どおりに計算する。
> **読むとき**: 請求・受注・見積で金額計算があるとき。
> **ポイント**: 税率も端数処理も**事業者ごとに違う**ので、hatake はハードコードせず全部パラメータで受ける。3言語（Dart/TS/Java）で**同じ入力→同じ出力**（[conformance](../../spec/conformance/)で担保）。

## 1件の消費税（内税・外税）

```dart
computeTax(1000, rate: 0.10);                    // 外税: net 1000 / tax 100 / gross 1100
computeTax(1080, rate: 0.08, included: true);    // 内税: net 1000 / tax 80  / gross 1080
computeTax(155,  rate: 0.10, rounding: 'round'); // 端数 15.5 → 四捨五入で tax 16
```

| 引数 | 意味 |
|---|---|
| `rate` | 税率（`0.10` / 軽減 `0.08`） |
| `included` | `amount` が税込かどうか（既定 false＝税抜） |
| `rounding` | `floor`(既定・切捨) / `round`(四捨五入) / `ceil`(切上) ← **事業者の設定を渡す** |

返るのは `net`（税抜）/ `tax`（税額）/ `gross`（税込）の整数3点セット。

## 税率別合計（適格請求書）

適格請求書は「**税率ごとに1回だけ**端数処理する」のがルール。明細ごとに丸めると1円ずれる。`computeInvoice` は同一税率を先に合算してから丸めるので、これを自動で守る。

```dart
final inv = computeInvoice([
  InvoiceLine(amount: 3000, rate: 0.10),
  InvoiceLine(amount: 1000, rate: 0.08),   // 軽減税率
  InvoiceLine(amount: 105,  rate: 0.08),
]);

inv.byRate;   // 税率昇順: 8% → net 1105/tax 88, 10% → net 3000/tax 300
inv.total;    // 全体: net 4105 / tax 388 / gross 4493
```

**なぜ効くか**: `105` を3行に分けた場合、明細ごとに丸めると `floor(8.4)×3 = 24`、正しく合算してから丸めると `floor(25.2) = 25`。この1円が請求書の不一致になる。

## 画面に出す

計算は Dart/TS/Java の関数で行い、**表示整形は定義側**に任せる。

```yaml
columns:
  - { field: net,   label: 税抜, type: number, format: currency, config: { symbol: "¥" } }
  - { field: tax,   label: 消費税, type: number, format: currency, config: { symbol: "¥" } }
  - { field: gross, label: 税込, type: number, format: currency, config: { symbol: "¥" } }
```

小計を定義だけで出したいなら計算項目が使える（税計算そのものは上の関数で）:

```yaml
- { field: total, label: 合計, computed: { op: sum, fields: [net, tax] } }
```

## 関連する日本企業util

同じ思想（**設定は引数、データは注入**）で揃えてある。

| やること | 呼び方 | メモ |
|---|---|---|
| 年度・四半期・半期 | `fiscalYear('2026-03-31')` → 2025 | 開始月は `startMonth`（既定4月） |
| 和暦表示 | `format: wareki` | `令和8年7月22日` / `style: short` で `R8/07/22` |
| 元号算出 | `eraOf('2026-07-31')` | 改元境界日で正しく切替 |
| 年齢・勤続 | `ageAt(birth, asOf)` / `tenure(from, to)` | 基準日指定 |
| 営業日 | `nextBusinessDay(date, holidays: {...})` | **祝日は引数で注入**（外部データは持ち込まない） |

一覧は [utils ロードマップ](../roadmap-utils.ja.md)、呼び出し例は [チートシート](../api-cheatsheet.ja.md)（末尾の「Dart から直接使う場合」）。

## つまずきポイント

| 症状 | 原因 |
|---|---|
| 内税計算が1円ずれる | 端数処理の指定漏れ。`rounding` は事業者設定に合わせる（既定は切捨） |
| 請求書の合計が明細合計と合わない | 明細ごとに丸めている。`computeInvoice` を使って税率単位で丸める |
| 営業日計算が土日しかスキップしない | `holidays` を渡していない。祝日カレンダーは利用者側のデータ |
| 言語間で答えが違う | 起きないはず（conformance で担保）。起きたら fixture を追加して報告してほしい |
