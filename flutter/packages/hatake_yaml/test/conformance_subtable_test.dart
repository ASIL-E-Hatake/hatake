import 'dart:convert';
import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// Runs the shared master-detail validation fixtures
/// (spec/conformance/subtable_validation.json and
/// subtable_source_validation.json). The TypeScript and Java editions consume
/// the same files, so server-side row validation stays identical across
/// languages.
void main() {
  runFixture('subTable validation', 'subtable_validation.json');
  runFixture(
    'subTable with source is skipped',
    'subtable_source_validation.json',
  );
}

void runFixture(String name, String file) {
  final fixture = jsonDecode(
    File('../../../spec/conformance/$file').readAsStringSync(),
  ) as Map<String, dynamic>;

  final page = parsePageJson(jsonEncode(fixture['page']));
  final form = (page as FormPageDefinition).form;
  final validator = FormValidator();

  group('conformance: $name', () {
    for (final raw in fixture['cases'] as List) {
      final c = raw as Map<String, dynamic>;
      test(c['name'], () {
        final record = (c['record'] as Map).cast<String, Object?>();
        final actual = validator.validate(form, record).errors;

        // Compare as an unordered set of "field=message".
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
