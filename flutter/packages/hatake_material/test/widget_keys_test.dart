import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// キーの規約（[HatakeKeys]）と、Renderer が実際に付けているキーの突き合わせ。
///
/// キーは画面の試験にとって**公開された契約**。契約を書いた紙（[HatakeKeys]）と
/// 実物（Renderer）が別々に在るので、機械が突き合わせないといつか食い違う。食い違うと
/// 「規約どおり書いた試験が、その画面では動かない」＝紙のほうが嘘になる。
///
/// 差し込み（`${field.field}` / `$key`）は `*` に潰して形だけを比べる。値そのものは
/// 定義から来るので、ここで確かめるのは**キーの形**。
String _shape(String key) => key
    .replaceAll(RegExp(r'\$\{[^}]*\}'), '*')
    .replaceAll(RegExp(r'\$[A-Za-z_][A-Za-z0-9_]*'), '*');

Set<String> _keysInRenderer() {
  final pattern = RegExp(r"Key\('(hatake\.[^']*)'\)");
  final found = <String>{};
  for (final entry in Directory('lib').listSync(recursive: true)) {
    if (entry is! File || !entry.path.endsWith('.dart')) continue;
    for (final match in pattern.allMatches(entry.readAsStringSync())) {
      found.add(_shape(match.group(1)!));
    }
  }
  return found;
}

void main() {
  group('キーの規約', () {
    final inRenderer = _keysInRenderer();
    final declared = HatakeKeys.shapes.toSet();

    test('Renderer が読めている（0件なら、この試験自体が壊れている）', () {
      expect(inRenderer.length, greaterThan(50));
    });

    test('規約に無いキーを Renderer が付けていない', () {
      // 出たら: そのキーを HatakeKeys に足す（試験を書く人は規約しか読まない）。
      expect(inRenderer.difference(declared), isEmpty);
    });

    test('規約に在るキーは、Renderer にも在る', () {
      // 出たら: Renderer から消えたキーが規約に残っている（試験が探せない相手を
      // 規約が名乗っている＝紙が嘘をついている）。
      expect(declared.difference(inRenderer), isEmpty);
    });

    test('組み立てた文字列は、そのまま規約の形になる', () {
      expect(HatakeKeys.form('orderNo'), 'hatake.form.orderNo');
      expect(HatakeKeys.action('approve'), 'hatake.action.approve');
      expect(HatakeKeys.rowAction('detail', 7), 'hatake.rowaction.detail.7');
      expect(HatakeKeys.confirmOk, 'hatake.confirm.ok');
    });
  });
}
