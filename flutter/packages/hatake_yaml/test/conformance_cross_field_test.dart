import 'dart:convert';
import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// Runs the shared cross-field-validation fixture
/// (spec/conformance/cross_field_validation.json) — the same contract the
/// TypeScript and Java editions implement.
///
/// ここで固定するのは「相手の項目と比べる」「数として読めれば数・読めなければ文字」
/// 「`aggregate` で明細を畳んだ数と比べる」「どちらかが空なら通す」「メッセージは
/// 相手のラベルで出す」の5つ。フロントとバックで検証がズレないことが値打ちなので、
/// 同じフィクスチャを3エディションで回す。
void main() {
  final fixture = jsonDecode(
    File('../../../spec/conformance/cross_field_validation.json')
        .readAsStringSync(),
  ) as Map<String, dynamic>;

  // strict で読む＝フィクスチャが「本当に書ける定義」であることも縛る。
  final page = parsePageJson(jsonEncode(fixture['page']), strict: true)
      as FormPageDefinition;
  final validator = FormValidator();

  group('conformance: cross-field validation', () {
    for (final raw in fixture['cases'] as List) {
      final c = raw as Map<String, dynamic>;
      test(c['name'], () {
        final record = (c['record'] as Map).cast<String, Object?>();
        final actual = validator
            .validate(page.form, record, mode: c['mode'] as String?)
            .errors;

        String key(String field, String message) => '$field=$message';
        final expected = [
          for (final e in c['expected'] as List)
            key((e as Map)['field'] as String, e['message'] as String),
        ];
        expect(
          actual.map((e) => key(e.field, e.message)).toSet(),
          expected.toSet(),
          reason: 'errors: ${actual.map((e) => key(e.field, e.message))}',
        );
      });
    }
  });
}
