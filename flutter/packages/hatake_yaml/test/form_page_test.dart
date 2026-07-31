import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

void main() {
  test('parses a form page', () {
    const yaml = '''
page:
  type: form
  id: customer_form
  title: 顧客入力
  repository: customerRepository
  key: id
  form:
    sections:
      - title: 基本情報
        fields:
          - { field: code, label: コード, required: true }
          - { field: name, label: 顧客名, required: true }
''';
    final page = parsePageYaml(yaml);
    expect(page, isA<FormPageDefinition>());
    final form = page as FormPageDefinition;
    expect(form.repository, 'customerRepository');
    expect(form.form.fields.map((f) => f.field), ['code', 'name']);
  });

  test('unsupported type still throws with the full supported list', () {
    expect(
      () => parsePageYaml('page:\n  type: wizard\n  id: p\n  title: t\n  repository: r'),
      throwsA(isA<DefinitionParseException>()),
    );
  });
}
