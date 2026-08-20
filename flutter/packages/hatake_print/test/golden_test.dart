// 見本の帳票が、いまのコードで作ったものと同じであること。
//
// 体裁は「見て良いか」を人が決めるしかないので、**人が見て良いと決めた1本**を
// リポジトリに置き、コードがそれを変えていないかを機械が見張る。体裁を直したときは
// `dart run tool/generate_golden.dart` で作り直して、開いて見てから差分を出す。

import 'dart:convert';
import 'dart:io';

import 'package:test/test.dart';

import 'golden_source.dart';

void main() {
  final file = File(goldenPdfPath);
  final fresh = goldenPdf();

  test('見本（$goldenPdfPath）と1バイトも違わない', () {
    expect(
      file.existsSync(),
      isTrue,
      reason: 'dart run tool/generate_golden.dart で作れます',
    );
    expect(
      fresh,
      file.readAsBytesSync(),
      reason: '体裁を変えたなら、tool/generate_golden.dart で見本も作り直してください',
    );
  });

  test('同梱の例（$exampleYamlPath）がそのまま刷れる', () {
    final page = goldenPage();
    expect(page.id, 'sales_report');
    // 例は得意先ごとに改ページする指定なので、得意先の数だけ紙が出る。
    expect(page.report.groups.single.pageBreak, isTrue);
    final text = latin1.decode(fresh);
    expect(text, contains('/Count 3'));
  });

  test('金額は例の書式（円記号と桁区切り）で刷られる', () {
    // 例は format: currency / symbol: "¥"。桁区切りが入る。
    final text = latin1.decode(fresh);
    // 円記号は字送りが読めないので、1文字だけの塊として別に置かれる。
    expect(text, contains('<${hex('¥')}> Tj'));
    expect(text, contains('<${hex('1,250,000')}> Tj'));
  });
}

/// 期待値を組むための、書き出し側とは別実装の UTF-16BE 16進。
String hex(String text) => text.runes
    .map((rune) => rune.toRadixString(16).padLeft(4, '0').toUpperCase())
    .join();
