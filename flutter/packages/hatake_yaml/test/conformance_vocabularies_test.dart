import 'dart:convert';
import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// `app.vocabularies` の展開が **3版で同じ**であること
/// （spec/conformance/vocabularies.json）。
///
/// 展開は読み込み時なので、ここが揃っていれば下流（画面・CSV・紙）も揃う。
/// 揃っていないと、同じ定義から Flutter の画面と Java のサーバで**違う字**が出る。
void main() {
  final cases = (jsonDecode(
    File('../../../spec/conformance/vocabularies.json').readAsStringSync(),
  ) as Map<String, dynamic>)['cases'] as List;

  group('conformance: vocabularies', () {
    for (final raw in cases) {
      final c = raw as Map<String, dynamic>;
      test(c['name'], () {
        final app = parseAppJson(jsonEncode(c['document']));
        final page = app.pages.first as CrudPageDefinition;
        final column = page.table.columns
            .firstWhere((one) => one.field == c['column'] as String);
        final expected = [
          for (final one in c['expected'] as List)
            {'value': (one as Map)['value'], 'label': one['label']},
        ];
        expect(
          [
            for (final one in column.options)
              {'value': one.value, 'label': one.label},
          ],
          expected,
        );
      });
    }
  });
}
