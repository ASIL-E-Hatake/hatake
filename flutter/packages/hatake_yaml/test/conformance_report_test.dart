import 'dart:convert';
import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// Runs the shared report fixture (spec/conformance/report.json) against the
/// Dart implementation. The same fixture is consumed by the TS and Java
/// editions, so a 帳票 breaks its pages in the same places everywhere.
///
/// Each block is flattened to one line (see the fixture's `encoding`) because
/// that is comparable across languages.
void main() {
  final fixture = jsonDecode(
    File('../../../spec/conformance/report.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  group('conformance: report', () {
    for (final raw in fixture['cases'] as List) {
      final c = raw as Map<String, dynamic>;
      test(c['name'], () {
        final page = parsePageMap(
          (c['page'] as Map).cast<String, Object?>(),
        ) as ReportPageDefinition;
        final rows = [
          for (final row in c['rows'] as List)
            (row as Map).cast<String, Object?>(),
        ];

        final document = buildReport(page.report, rows);
        final actual = [
          for (final sheet in document.sheets)
            [for (final block in sheet.blocks) _encode(block, page)],
        ];
        expect(actual, c['expected']);
      });
    }
  });
}

/// `G<level>:<label>=<value>` / `D:<field>=<value>|…` / `S<level>:…` / `T:…`
String _encode(ReportBlock block, ReportPageDefinition page) {
  switch (block.kind) {
    case ReportBlockKinds.groupHeader:
      return 'G${block.level}:${block.label}=${block.value}';
    case ReportBlockKinds.detail:
      return 'D:${[
        for (final column in page.table.columns)
          '${column.field}=${block.row[column.field]}',
      ].join('|')}';
    case ReportBlockKinds.subtotal:
      return 'S${block.level}:${_totals(block, page)}';
    case ReportBlockKinds.grandTotal:
      return 'T:${_totals(block, page)}';
    default:
      return block.kind;
  }
}

/// Totals are positional (two may share a field), so they pair up by index.
String _totals(ReportBlock block, ReportPageDefinition page) => [
      for (var i = 0; i < page.report.totals.length; i++)
        '${page.report.totals[i].field}=${_num(block.totals[i])}',
    ].join(',');

/// Integers print without a decimal point so `300` and `300.0` compare equal.
String _num(num? value) {
  if (value == null) return 'null';
  return value == value.roundToDouble()
      ? value.toInt().toString()
      : value.toString();
}
