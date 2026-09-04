import 'dart:convert';
import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// Runs the shared scenario fixture (spec/conformance/scenario.json) — the same
/// contract the TypeScript edition (`hatake run`) implements.
///
/// ここで固定するのは「定義を動かした答えが、道具と画面で同じになる」こと。答えの
/// 作り方の順番（normalize → computed → 状態 → 検証）がどちらかでズレると、道具の
/// 答えが嘘になる（AI はその答えを信じて直すので、嘘は一番高くつく）。
void main() {
  final fixture = jsonDecode(
    File('../../../spec/conformance/scenario.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  // strict で読む＝フィクスチャが「本当に書ける定義」であることも縛る。
  final page = parsePageJson(jsonEncode(fixture['page']), strict: true);
  final runner = ScenarioRunner();

  group('conformance: scenario', () {
    for (final raw in fixture['cases'] as List) {
      final map = (raw as Map).cast<String, Object?>();
      final one = ScenarioCase.fromMap(map);
      test(one.name, () {
        final answer = runner.runCase(page, one);
        expect(
          compareAnswer(one.expect, answer),
          isEmpty,
          reason: '答えが表と違います: '
              'errors=${answer.errors.map((e) => '${e.field}=${e.message}')} '
              'computed=${answer.computed} enabled=${answer.enabled} '
              'hidden=${answer.hidden} required=${answer.required}',
        );
      });
    }

    // 期待は「書いた欄だけ」見るので、まるごと同じかもここで見る（表の側が欄を
    // 書き忘れても通ってしまうのを防ぐ）。
    test('答えの中身そのものが表と同じ', () {
      for (final raw in fixture['cases'] as List) {
        final map = (raw as Map).cast<String, Object?>();
        final one = ScenarioCase.fromMap(map);
        final expected = (map['expect']! as Map).cast<String, Object?>();
        final answer = runner.runCase(page, one);

        expect(
          answer.errors.map((e) => '${e.field}=${e.message}').toSet(),
          {
            for (final e in expected['errors']! as List)
              '${(e as Map)['field']}=${e['message']}',
          },
          reason: one.name,
        );
        expect(answer.hidden.toSet(),
            {...(expected['hidden']! as List).map((one) => '$one')},
            reason: one.name);
        expect(answer.required.toSet(),
            {...(expected['required']! as List).map((one) => '$one')},
            reason: one.name);
        expect(answer.enabled, (expected['enabled']! as Map).cast<String, bool>(),
            reason: one.name);
        (expected['computed']! as Map).forEach((key, value) {
          final actual = answer.computed['$key'];
          // JSON から読んだ数と計算した数は int / double が混ざる（1150 と 1150.0）。
          // 画面に出るのは同じ数なので、数として比べる。
          if (value is num && actual is num) {
            expect(actual.toDouble(), value.toDouble(), reason: '$key（${one.name}）');
          } else {
            expect(actual, value, reason: '$key（${one.name}）');
          }
        });
      }
    });
  });
}
