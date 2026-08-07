import 'dart:convert';
import 'dart:io';

import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// Runs the shared strict-keys fixture (spec/conformance/strict_keys.json).
/// The same fixture is consumed by the TS and Java editions, so a typo is
/// reported at the same place — with the same suggestion — everywhere.
void main() {
  final fixture = jsonDecode(
    File('../../../spec/conformance/strict_keys.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  group('conformance: strict keys', () {
    for (final raw in fixture['cases'] as List) {
      final c = raw as Map<String, dynamic>;
      test(c['name'], () {
        final document = (c['document'] as Map).cast<String, Object?>();
        final actual = [
          for (final key in findUnknownKeys(document))
            {'path': key.path, 'key': key.key, 'suggestion': key.suggestion},
        ];
        expect(actual, c['expected']);
      });
    }
  });
}
