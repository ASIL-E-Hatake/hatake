import 'dart:convert';
import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:test/test.dart';

/// Runs the shared conformance fixtures (spec/conformance) against the Dart
/// implementation. The same fixtures are consumed by the TS and Java editions,
/// guaranteeing identical output across languages.
const _dir = '../../../spec/conformance';

List<dynamic> _load(String file) =>
    jsonDecode(File('$_dir/$file').readAsStringSync()) as List<dynamic>;

Map<String, Object?> _opts(Map<String, dynamic> c) =>
    (c['options'] as Map?)?.cast<String, Object?>() ?? const {};

void main() {
  group('conformance: formatters', () {
    final fmt = FormatterRegistry();
    for (final raw in _load('formatters.json')) {
      final c = raw as Map<String, dynamic>;
      test('${c['name']} ${c['value']} ${c['options'] ?? ''}', () {
        expect(fmt.format(c['name'] as String, c['value'], _opts(c)),
            c['expected']);
      });
    }
  });

  group('conformance: converters', () {
    final conv = ConverterRegistry();
    for (final raw in _load('converters.json')) {
      final c = raw as Map<String, dynamic>;
      test('${c['name']} ${c['value']}', () {
        final result = conv.convert(c['name'] as String, c['value']);
        expect(result.toString(), c['expected'].toString());
      });
    }
  });

  group('conformance: validators', () {
    final validators = ValidatorRegistry();
    for (final raw in _load('validators.json')) {
      final c = raw as Map<String, dynamic>;
      test('${c['type']} ${c['value']}', () {
        final def = ValidatorDefinition(
          type: c['type'] as String,
          params: (c['params'] as Map?)?.cast<String, Object?>() ?? const {},
        );
        final result = validators.run(c['value'], def);
        expect(result == null, c['valid']);
        if (c['message'] != null) expect(result, c['message']);
      });
    }
  });

  group('conformance: tax', () {
    for (final raw in _load('tax.json')) {
      final c = raw as Map<String, dynamic>;
      test('${c['amount']}@${c['rate']} ${c['rounding'] ?? 'floor'}'
          '${c['included'] == true ? ' inc' : ''}', () {
        final r = computeTax(
          c['amount'] as num,
          rate: c['rate'] as num,
          included: c['included'] == true,
          rounding: c['rounding'] as String? ?? 'floor',
        );
        final e = c['expected'] as Map<String, dynamic>;
        expect(r.net, e['net']);
        expect(r.tax, e['tax']);
        expect(r.gross, e['gross']);
      });
    }
  });

  group('conformance: fiscal', () {
    for (final raw in _load('fiscal.json')) {
      final c = raw as Map<String, dynamic>;
      test('${c['date']} sm=${c['startMonth'] ?? 4}', () {
        final sm = (c['startMonth'] as int?) ?? 4;
        final e = c['expected'] as Map<String, dynamic>;
        expect(fiscalYear(c['date'] as String, startMonth: sm), e['year']);
        expect(fiscalQuarter(c['date'] as String, startMonth: sm), e['quarter']);
        expect(fiscalHalf(c['date'] as String, startMonth: sm), e['half']);
      });
    }
  });

  group('conformance: age/tenure', () {
    for (final raw in _load('age.json')) {
      final c = raw as Map<String, dynamic>;
      test('${c['from']} -> ${c['to']}', () {
        final t = tenure(c['from'] as String, c['to'] as String);
        expect(t.years, c['years']);
        expect(t.months, c['months']);
        expect(ageAt(c['from'] as String, c['to'] as String), c['years']);
      });
    }
  });

  group('conformance: business day', () {
    for (final raw in _load('businessday.json')) {
      final c = raw as Map<String, dynamic>;
      test('${c['date']} h=${(c['holidays'] as List).length}', () {
        final holidays = {for (final h in c['holidays'] as List) h.toString()};
        final e = c['expected'] as Map<String, dynamic>;
        expect(isBusinessDay(c['date'] as String, holidays: holidays),
            e['isBusinessDay']);
        expect(nextBusinessDay(c['date'] as String, holidays: holidays),
            e['next']);
        expect(prevBusinessDay(c['date'] as String, holidays: holidays),
            e['prev']);
      });
    }
  });
}
