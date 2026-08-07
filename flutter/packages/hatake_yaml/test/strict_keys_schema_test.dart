import 'dart:convert';
import 'dart:io';

import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// The strict checker carries its own key table, so it could drift from the
/// spec. This test makes that impossible: **every closed node in
/// `spec/hatake-page.schema.json` must have exactly the same keys here**, and
/// there must be no nodes the schema does not describe.
///
/// A key added to the DSL therefore fails here until the checker learns it —
/// which is the point: silently ignoring a valid key is as bad as accepting a
/// typo.
void main() {
  final schema = jsonDecode(
    File('../../../spec/hatake-page.schema.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  final defs = (schema[r'$defs'] as Map).cast<String, dynamic>();

  /// Keys of a schema node: a `$defs` entry, or a nested object written inline
  /// under its parent (`report.sort`).
  Set<String>? schemaKeys(String node) {
    Map<String, dynamic>? target;
    if (node.contains('.')) {
      final parts = node.split('.');
      final parent = defs[parts[0]] as Map?;
      final property = (parent?['properties'] as Map?)?[parts[1]] as Map?;
      target = property?.cast<String, dynamic>();
    } else if (node.isEmpty) {
      target = schema;
    } else {
      target = (defs[node] as Map?)?.cast<String, dynamic>();
    }
    if (target == null) return null;
    // Only closed nodes are checked; open ones are free-form on purpose.
    if (target['additionalProperties'] != false) return null;
    return ((target['properties'] as Map?) ?? const {}).keys.cast<String>().toSet();
  }

  test('every node the checker closes matches the schema', () {
    final mismatches = <String>[];
    for (final entry in strictKeyTable.entries) {
      final expected = schemaKeys(entry.key);
      if (expected == null) {
        mismatches.add('${entry.key}: スキーマに閉じたノードが無い');
        continue;
      }
      if (!_sameSet(expected, entry.value)) {
        mismatches.add('${entry.key}: スキーマ=${_sorted(expected)} '
            'チェッカ=${_sorted(entry.value)}');
      }
    }
    expect(mismatches, isEmpty, reason: mismatches.join('\n'));
  });

  test('every closed node in the schema is checked', () {
    final missing = <String>[];
    for (final name in [...defs.keys, '']) {
      if (schemaKeys(name) == null) continue;
      if (!strictKeyTable.containsKey(name)) missing.add(name);
    }
    // The page kinds are reached through `page` / `app.pages`, the rest by name.
    expect(missing, isEmpty,
        reason: '未チェックのノード: ${missing.join(', ')}');
  });

  test('the inline sort objects are covered too', () {
    // These live under their parent in the schema, not in $defs.
    expect(strictKeyTable['report.sort'], {'field', 'ascending'});
    expect(strictKeyTable['dashboardItem.sort'], {'field', 'ascending'});
  });
}

bool _sameSet(Set<String> a, Set<String> b) =>
    a.length == b.length && a.every(b.contains);

List<String> _sorted(Set<String> keys) => keys.toList()..sort();
