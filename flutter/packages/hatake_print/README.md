# hatake_print

帳票を**紙に出す** opt-in アダプタ。`ReportDocument` → PDF のバイト列。純 Dart・依存は `hatake_core` だけ。

Framework は「紙の中身」（`ReportDocument`）までを作る。画面のプレビューはそれを描くだけで、**そこから先の出口が無かった**。帳票は画面で見て終わりではないので、ここが要る。

## 3行で刷る

```dart
import 'package:hatake_print/hatake_print.dart';

final bytes = reportPdf(page, rows);          // page は ReportPageDefinition
await File('売上明細表.pdf').writeAsBytes(bytes);
```

`page` は YAML から読んだものでも、Dart ビルダーで組んだものでもよい。**UI を通らない**ので、夜間バッチやサーバ側からも同じ1行で刷れる（Flutter は要らない）。

書式（`format: currency`）・列幅（`column.width`）・見えない列（`roles`）・小計の言葉まで、**画面の帳票プレビューと同じ規則**で組む。画面で見た枚数と刷った枚数もずれない（紙の分かれ目は `buildReport` が決めたものをそのまま使う）。

```dart
// 役割を渡せば、その人に見えない列は紙にも出ない。
final bytes = reportPdf(page, rows, roles: {'staff'}, formatters: formatters);
```

## プリンタに送る

PDF のバイト列にしてあるので、[`printing`](https://pub.dev/packages/printing) パッケージにそのまま渡せる（このパッケージは `printing` に依存しない＝入れる/入れないは利用者が決める）。

```dart
await Printing.layoutPdf(onLayout: (_) => reportPdf(page, rows));
```

## 2段構え（出口を差し替えられる）

```
ReportDocument ──layoutReport──▶ PrintLayout ──writePdf──▶ PDF
                                （座標まで決めた紙）        （バイト列）
```

`PrintLayout` は**紙の上のどこに何があるか**だけを持つ中立な形（座標は左上原点・ポイント・y は下向き）。`ReportDocument` や `QuerySpec` と同じ立ち位置で、ここから先は差し替えられる。

```dart
final layout = layoutReport(page, buildReport(page.report, rows));
for (final sheet in layout.pages) {
  for (final item in sheet.items) {
    switch (item) {
      case final PrintText text: sendToPrinter(text.x, text.y, text.text);
      case final PrintRule rule: drawLine(rule.x, rule.y, rule.width);
    }
  }
}
```

中立な形を挟んでいる理由はもう1つある。**座標は数なので、1バイト単位で固定できる**。TypeScript 版が同じ `PrintLayout` を組んで**紙を文字で見せる**（`npx hatake paper`）のも、この形があるから＝AI も人も、刷る前に紙を読める。第三者のレイアウトエンジンに組み替えると、体裁が黙って変わったことに気づけなくなる。

## 体裁（`PrintStyle`）

余白や脚注は**業務ではなく印刷所の話**なので、定義（DSL）には入れず、呼ぶ側が渡す。

```dart
reportPdf(page, rows, style: const PrintStyle(
  margin: 42,                        // 余白（ポイント。36 = 0.5 inch）
  footer: '営業部 - {page}/{pages}',  // 脚注（{page} / {pages} が埋まる）
  pageNumber: '{page} / {pages}',    // 右上のページ番号（'' で消える）
  subtotalLabel: 'Subtotal',         // 小計・総計・件数の言葉
));
```

**日付は既定で入れない。** 入れると同じ帳票が刷るたび違うバイト列になり、「前と同じものが出ているか」を確かめられなくなる。要るなら `footer` に渡す。

## 紙から溢れない

画面のプレビューは行が入り切らなければ伸びればよいが、**紙は伸びない**。

- `rowsPerPage` 行が必ず1枚に載るよう、行の高さと文字を上限つきで**縮める**（広げはしない）
- `column.width` はポイントとして使い、指定の無い列が残りを分ける。全部足して紙幅を超えたら全体を同じ率で縮める
- 列に収まらない文字は切って `…` を付ける（隣の列に重ねない）

## フォント（埋め込まない）

PDF には「標準の日本語フォント」を**名前で**指定する仕組みがある（Adobe-Japan1 の CID フォント）。日本語のフォントは1本 5〜20MB あり再配布の可否も書体ごとに違うので、既定はこれ。ビューア側が実際の書体を当てる。

| | |
|---|---|
| 得るもの | 1枚 数KB・依存ゼロ・毎回同じバイト列・文字を選んでコピーできる |
| 失うもの | **書体は開いた環境が決める**（游明朝／MS ゴシックなど）。外字は出ない |

```dart
reportPdf(page, rows, font: PdfFont.mincho);     // 明朝体（既定は gothic）
reportPdf(page, rows, font: PdfFont.helvetica);  // 英数だけの帳票（日本語は ?）
```

### 字送りの約束

**半角は ASCII と半角形（半角カナ）だけ、あとは全部全角**として扱う。PDF に書き込む字送り（`/W` `/DW`）と、こちらの幅の見積もりを**同じ規則**にしてある（食い違うと右寄せした金額の右端がずれる）。

`¥` `§` `①` `℃` のように「半角に見えて全角に組まれる」文字があり、しかも**ビューアが実際に使う幅は読めない**（埋め込んでいないので当てられた書体の都合で決まる）。この種の文字は**1文字だけ別に置き直す**ので、幅が違っても後ろの文字がずれたり重なったりしない。

### 字面まで固定したいとき

見本と1ドットも変えたくない・外字がある・環境にフォントが無いところで開く、という要求があるなら埋め込みが要る。**まだ無い**（TrueType の解析とサブセット化が要る）。それまでは、印刷する環境の書体を揃えるのが現実的。

## 決めていないこと

- フォントの埋め込み、図形・画像・ロゴ、1枚の中でのフォント混在
- 「以下余白」・繰越／前頁計・複数レベルの改ページ制御（ロードマップの「帳票の次段」）
- xlsx 出力（`PrintLayout` からなら書けるが、別パッケージの話）
- Java 版（いまは Dart と TypeScript だけ）。TypeScript には `PrintLayout` までが在り
  （`npx hatake paper` / MCP の `hatake_print_preview` が紙を**文字で見せる**）、PDF を書くのは
  この版だけ。座標が1つも違わないことは
  [`spec/conformance/report_layout.json`](../../../spec/conformance/report_layout.json) が縛る

## 見本

`test/golden/sales_report.pdf` は、同梱の例（`spec/examples/sales_report.yaml`）を刷ったもの。**体裁が黙って変わらないため**に置いてある（テストが1バイト単位で比べる）。体裁を直したら作り直して、開いて見てから差分を出す。

```
dart run tool/generate_golden.dart
```
