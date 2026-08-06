import 'dart:convert';
import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// Runs the shared wizard validation fixture
/// (spec/conformance/wizard_validation.json). A case names the `step` to
/// validate, or null for the whole page — the same contract the TypeScript and
/// Java editions implement.
void main() {
  final fixture = jsonDecode(
    File('../../../spec/conformance/wizard_validation.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  final page = parsePageJson(jsonEncode(fixture['page'])) as WizardPageDefinition;
  final validator = FormValidator();

  group('conformance: wizard validation', () {
    for (final raw in fixture['cases'] as List) {
      final c = raw as Map<String, dynamic>;
      test(c['name'], () {
        final stepId = c['step'] as String?;
        // A named step validates that step alone; null validates every step.
        final form = stepId == null
            ? page.form
            : page.steps.firstWhere((s) => s.id == stepId).form;

        final record = (c['record'] as Map).cast<String, Object?>();
        final actual = validator.validate(form, record).errors;

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
