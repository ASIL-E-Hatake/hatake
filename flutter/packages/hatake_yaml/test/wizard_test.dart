import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

const _yaml = '''
page:
  type: wizard
  id: customer_onboarding
  title: 顧客登録
  repository: customerRepository
  key: id
  steps:
    - id: basic
      title: 基本情報
      description: まず会社の基本情報を
      layout: { columns: 2 }
      fields:
        - { field: code, label: コード, required: true }
        - { field: name, label: 会社名, required: true }
    - id: contact
      title: 連絡先
      fields:
        - { field: email, label: メール, validators: [ { type: email } ] }
  actions:
    - { id: showDef, type: plugin, plugin: showDefinition, label: 定義を見る }
''';

const _json = '''
{
  "page": {
    "type": "wizard", "id": "customer_onboarding", "title": "顧客登録",
    "repository": "customerRepository", "key": "id",
    "steps": [
      { "id": "basic", "title": "基本情報", "description": "まず会社の基本情報を",
        "layout": { "columns": 2 },
        "fields": [
          { "field": "code", "label": "コード", "required": true },
          { "field": "name", "label": "会社名", "required": true }
        ] },
      { "id": "contact", "title": "連絡先",
        "fields": [
          { "field": "email", "label": "メール",
            "validators": [ { "type": "email" } ] }
        ] }
    ],
    "actions": [
      { "id": "showDef", "type": "plugin", "plugin": "showDefinition", "label": "定義を見る" }
    ]
  }
}
''';

void main() {
  test('parses a wizard page (steps reuse the section shape)', () {
    final page = parsePageYaml(_yaml) as WizardPageDefinition;

    expect(page.id, 'customer_onboarding');
    expect(page.repository, 'customerRepository');
    expect(page.keyField, 'id');
    expect(page.steps.map((s) => s.id), ['basic', 'contact']);

    final basic = page.steps.first;
    expect(basic.title, '基本情報');
    expect(basic.description, 'まず会社の基本情報を');
    expect(basic.layout.columns, 2);
    expect(basic.fields.map((f) => f.field), ['code', 'name']);
    expect(basic.fields.first.required, isTrue);

    final contact = page.steps.last;
    expect(contact.description, isNull);
    expect(contact.layout.columns, 1); // default
    expect(contact.fields.single.validators.single.type, ValidatorTypes.email);

    expect(page.actions.single.id, 'showDef');
  });

  test('a step exposes itself as a one-section form', () {
    final page = parsePageYaml(_yaml) as WizardPageDefinition;
    final form = page.steps.first.form;
    expect(form.sections.single.fields.map((f) => f.field), ['code', 'name']);
    expect(form.sections.single.layout.columns, 2);
  });

  test('the whole page is one form with a section per step', () {
    final page = parsePageYaml(_yaml) as WizardPageDefinition;
    expect(page.form.sections.map((s) => s.title), ['基本情報', '連絡先']);
    expect(page.form.fields.map((f) => f.field), ['code', 'name', 'email']);
  });

  test('stepIndexOfField locates which step owns a field', () {
    final page = parsePageYaml(_yaml) as WizardPageDefinition;
    expect(page.stepIndexOfField('code'), 0);
    expect(page.stepIndexOfField('email'), 1);
    expect(page.stepIndexOfField('nope'), -1);
  });

  test('a wizard without steps is rejected', () {
    expect(
      () => parsePageYaml('''
page:
  type: wizard
  id: w
  title: W
  repository: r
'''),
      throwsA(isA<DefinitionParseException>()),
    );
  });

  test('a step without an id is rejected', () {
    expect(
      () => parsePageYaml('''
page:
  type: wizard
  id: w
  title: W
  repository: r
  steps:
    - { title: 基本情報 }
'''),
      throwsA(isA<DefinitionParseException>()),
    );
  });

  test('YAML and JSON converge on an identical definition', () {
    expect(parsePageYaml(_yaml), parsePageJson(_json));
  });

  test('the shipped example (spec/examples/customer_wizard.yaml) parses', () {
    final source =
        File('../../../spec/examples/customer_wizard.yaml').readAsStringSync();
    final page = parsePageYaml(source) as WizardPageDefinition;
    expect(page.steps.length, 3);
    // The confirm step derives a summary from earlier steps.
    expect(page.steps.last.fields.first.computed, isNotNull);
  });
}
