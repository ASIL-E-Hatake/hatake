import 'dart:convert';
import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// Runs the shared conditional-validation fixture
/// (spec/conformance/conditional_validation.json) — the same contract the
/// TypeScript and Java editions implement.
///
/// ここで固定するのは「隠れている項目は検証しない」「`requiredWhen` が成立したら
/// 必須になる」「mode が分からない場所では mode の条件が false になる」の3つ。
void main() {
  final fixture = jsonDecode(
    File('../../../spec/conformance/conditional_validation.json')
        .readAsStringSync(),
  ) as Map<String, dynamic>;

  final page = parsePageJson(jsonEncode(fixture['page'])) as FormPageDefinition;
  final validator = FormValidator();

  group('conformance: conditional validation', () {
    for (final raw in fixture['cases'] as List) {
      final c = raw as Map<String, dynamic>;
      test(c['name'], () {
        final record = (c['record'] as Map).cast<String, Object?>();
        final actual =
            validator.validate(page.form, record, mode: c['mode'] as String?)
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
