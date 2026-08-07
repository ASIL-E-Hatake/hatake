import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// `strict: true` turns "the key I wrote does nothing" into an error. Without it
/// the parser stays as forgiving as it has always been (existing definitions
/// keep working).
///
/// The typos here are on **optional** keys on purpose: a misspelled required key
/// (`labell` for `label`) already fails, because the parser then cannot find the
/// value it needs. Silence is the problem of the optional ones — and those are
/// most of the DSL.
const _withTypos = '''
dsl_version: "1.0"
page:
  type: form
  id: customer_form
  title: 顧客入力
  repository: customerRepository
  form:
    sections:
      - fields:
          - { field: code, label: コード, requred: true, readonly: true }
''';

void main() {
  test('a typo on an optional key is silently ignored by default', () {
    final page = parsePageYaml(_withTypos) as FormPageDefinition;
    final field = page.form.sections.single.fields.single;
    // What the writer meant is simply not there — and nothing said so.
    expect(field.required, isFalse);
    expect(field.readOnly, isFalse);
  });

  test('strict reports every unknown key at once, with suggestions', () {
    expect(
      () => parsePageYaml(_withTypos, strict: true),
      throwsA(isA<UnknownKeysException>()
          .having(
              (e) => e.keys.map((k) => k.key), 'keys', ['readonly', 'requred'])
          .having((e) => e.keys.map((k) => k.suggestion), 'suggestions',
              ['readOnly', 'required'])
          .having((e) => e.keys.first.path, 'path',
              'page.form.sections[0].fields[0]')),
    );
  });

  test('the message names the place, the key and the likely fix', () {
    try {
      parsePageYaml(_withTypos, strict: true);
      fail('expected UnknownKeysException');
    } on UnknownKeysException catch (e) {
      expect(e.message, contains('page.form.sections[0].fields[0]'));
      expect(e.message, contains('"requred"'));
      expect(e.message, contains('required の間違い？'));
      // It is a DefinitionParseException, so existing handlers still catch it.
      expect(e, isA<DefinitionParseException>());
    }
  });

  test('a misspelled required key fails even without strict', () {
    // Worth pinning: this is why strict is about the optional keys.
    expect(
      () => parsePageYaml('''
page:
  type: form
  id: customer_form
  title: 顧客入力
  repository: customerRepository
  form:
    sections:
      - fields:
          - { field: code, labell: コード }
'''),
      throwsA(isA<DefinitionParseException>()),
    );
  });

  test('a correct definition passes strict unchanged', () {
    const yaml = '''
page:
  type: form
  id: customer_form
  title: 顧客入力
  repository: customerRepository
  form:
    sections:
      - fields:
          - { field: code, label: コード, required: true }
''';
    expect(parsePageYaml(yaml, strict: true), parsePageYaml(yaml));
  });

  test('strict works on app documents too', () {
    expect(
      () => parseAppYaml('''
app:
  id: sales_admin
  title: 販売管理
  home: orders
  menu:
    - { id: orders, label: 受注, page: order_search, ikon: list }
  pages:
    - { type: search, id: order_search, title: 受注照会, repository: orderRepository }
''', strict: true),
      throwsA(isA<UnknownKeysException>().having(
          (e) => e.keys.single.suggestion, 'suggestion', 'icon')),
    );
  });

  test('a broken type is still reported as a type problem', () {
    // The page kind is the more fundamental error, so it wins over key checks.
    expect(
      () => parsePageYaml('''
page:
  type: kanban
  id: board
  title: 板
  repository: taskRepository
  lanes: []
''', strict: true),
      throwsA(isA<DefinitionParseException>().having(
          (e) => e.message, 'message', contains('Unsupported page type'))),
    );
  });

  test('every shipped example passes strict', () {
    // The examples are what people (and AI) copy, so they must be exemplary.
    for (final file in [
      'customer_master',
      'product_search',
      'dept_master',
      'customer_detail',
      'customer_form',
      'order_entry',
      'order_entry_paged',
      'customer_wizard',
      'sales_dashboard',
      'sales_report',
    ]) {
      expect(
        () => parsePageYaml(
          _read('../../../spec/examples/$file.yaml'),
          strict: true,
        ),
        returnsNormally,
        reason: file,
      );
    }
    expect(
      () => parseAppYaml(
        _read('../../../spec/examples/sales_app.yaml'),
        strict: true,
      ),
      returnsNormally,
    );
  });
}

String _read(String path) => File(path).readAsStringSync();
