import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

/// デモの定義を**動かして**、答えが道具（`hatake run`）と同じかを見る。
///
/// 収束テスト（`spec/conformance/`）が縛っているのは**枠組みが書いた表**だけ。
/// 案件の定義（＝このデモ）で答えが揃っていることは、同じシナリオを両方の版で
/// 回して初めて言える:
///
///   ・ここ（Flutter）… `ScenarioRunner` に**アプリの登録**を渡して回す
///   ・CI（TypeScript）… `hatake run <定義> --scenario <同じファイル>`
///
/// 期待は**業務の言葉で人が書いたもの**（`run --draft` の写しではない）。だから
/// 「画面の実装が答えを変えた」ときにここで落ちる。
void main() {
  final page = parseAppYaml(
    File('assets/sales_app.yaml').readAsStringSync(),
    strict: true,
  ).pageById('order_entry')!;

  final file = jsonDecode(
    File('test/order_entry.scenario.json').readAsStringSync(),
  ) as Map<String, Object?>;

  // デモは独自の計算・検証を登録していないので、既定のまま（アプリが登録したら
  // ここに渡す＝プラグイン込みで同じシナリオが回る）。
  final runner = ScenarioRunner();

  final cases = [
    for (final raw in file['cases']! as List)
      ScenarioCase.fromMap((raw as Map).cast<String, Object?>()),
  ];

  test('シナリオのファイルは、CLI が読むものと同じ形', () {
    // どちらかが読めない形になったら、片方だけ回っている状態に静かに戻る。
    expect(file['page'], 'order_entry');
    expect(cases, isNotEmpty);
  });

  for (final one in cases) {
    test('デモを動かす: ${one.name}', () {
      final answer = runner.runCase(page, one);
      expect(
        compareAnswer(one.expect, answer),
        isEmpty,
        reason: '${one.name}\n答え: '
            'computed=${answer.computed} errors=${answer.errors}',
      );
      // 答えられないことがあれば、それは登録の抜け（デモは組み込みだけで足りる）。
      expect(answer.cannot, isEmpty, reason: answer.cannot.join(' / '));
    });
  }
}
