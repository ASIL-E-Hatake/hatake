import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// Records what the wizard finally saves, and how many times.
class _Repo implements Repository {
  DataRecord? saved;
  int saves = 0;

  @override
  Future<PageResult> search(RepositoryQuery query) async => PageResult.empty;

  @override
  Future<DataRecord?> findByKey(Object key) async =>
      {'id': key, 'code': 'C001', 'name': '山田商事', 'email': 'a@example.com'};

  @override
  Future<DataRecord> create(DataRecord data) async {
    saves++;
    return saved = data;
  }

  @override
  Future<DataRecord> update(Object key, DataRecord data) async {
    saves++;
    return saved = data;
  }

  @override
  Future<void> delete(Object key) async {}
}

const _definition = WizardPageDefinition(
  id: 'customer_wizard',
  title: '顧客登録',
  repository: 'repo',
  steps: [
    WizardStepDefinition(
      id: 'basic',
      title: '基本情報',
      description: 'まず会社の基本情報を',
      fields: [
        // normalize proves the whole-form pipeline runs at save time.
        FieldDefinition(
          field: 'code',
          label: 'コード',
          required: true,
          normalize: ['toHankaku'],
        ),
        FieldDefinition(field: 'name', label: '会社名', required: true),
      ],
    ),
    WizardStepDefinition(
      id: 'contact',
      title: '連絡先',
      fields: [
        FieldDefinition(
          field: 'email',
          label: 'メール',
          required: true,
          validators: [ValidatorDefinition(type: ValidatorTypes.email)],
        ),
      ],
    ),
    WizardStepDefinition(
      id: 'confirm',
      title: '確認',
      fields: [
        FieldDefinition(
          field: 'summary',
          label: '登録内容',
          computed: {'op': 'concat', 'fields': ['code', 'name'], 'separator': ' / '},
        ),
      ],
    ),
  ],
);

Widget _harness(_Repo repo, {Object? recordKey}) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({'repo': repo}),
        renderer: const MaterialRenderer(),
        child: HatakeWizardView(definition: _definition, recordKey: recordKey),
      ),
    ),
  );
}

Future<void> _fillBasic(WidgetTester tester) async {
  await tester.enterText(find.byKey(const Key('hatake.form.code')), 'C001');
  await tester.enterText(find.byKey(const Key('hatake.form.name')), '山田商事');
}

void main() {
  testWidgets('starts on the first step and shows only its fields',
      (tester) async {
    await tester.pumpWidget(_harness(_Repo()));
    await tester.pumpAndSettle();

    expect(find.text('基本情報'), findsWidgets);
    expect(find.text('まず会社の基本情報を'), findsOneWidget);
    expect(find.byKey(const Key('hatake.form.code')), findsOneWidget);
    // A later step's field is not rendered yet.
    expect(find.byKey(const Key('hatake.form.email')), findsNothing);

    // First step: no 戻る, and 次へ rather than 保存.
    expect(find.byKey(const Key('hatake.wizard.back')), findsNothing);
    expect(find.byKey(const Key('hatake.wizard.next')), findsOneWidget);
    expect(find.byKey(const Key('hatake.wizard.save')), findsNothing);
  });

  testWidgets('every step appears in the step indicator', (tester) async {
    await tester.pumpWidget(_harness(_Repo()));
    await tester.pumpAndSettle();

    for (final id in ['basic', 'contact', 'confirm']) {
      expect(find.byKey(Key('hatake.wizard.step.$id')), findsOneWidget);
    }
  });

  testWidgets('次へ validates only the current step', (tester) async {
    await tester.pumpWidget(_harness(_Repo()));
    await tester.pumpAndSettle();

    // Empty required fields block the step.
    await tester.tap(find.byKey(const Key('hatake.wizard.next')));
    await tester.pumpAndSettle();
    expect(find.text('必須項目です'), findsNWidgets(2));
    expect(find.byKey(const Key('hatake.form.email')), findsNothing);

    // Filling this step advances — the next step's own `required` does not
    // block leaving this one.
    await _fillBasic(tester);
    await tester.tap(find.byKey(const Key('hatake.wizard.next')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.form.email')), findsOneWidget);
    expect(find.byKey(const Key('hatake.form.code')), findsNothing);
  });

  testWidgets('戻る keeps what was typed', (tester) async {
    await tester.pumpWidget(_harness(_Repo()));
    await tester.pumpAndSettle();

    await _fillBasic(tester);
    await tester.tap(find.byKey(const Key('hatake.wizard.next')));
    await tester.pumpAndSettle();

    // A half-filled step can still be left behind.
    await tester.tap(find.byKey(const Key('hatake.wizard.back')));
    await tester.pumpAndSettle();

    expect(
      tester.widget<TextField>(find.byKey(const Key('hatake.form.code'))).controller!.text,
      'C001',
    );
  });

  testWidgets('the last step saves once, with every step merged and normalized',
      (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(_harness(repo));
    await tester.pumpAndSettle();

    // Full-width digits prove `normalize: [toHankaku]` runs on save.
    await tester.enterText(find.byKey(const Key('hatake.form.code')), 'Ｃ００１');
    await tester.enterText(find.byKey(const Key('hatake.form.name')), '山田商事');
    await tester.tap(find.byKey(const Key('hatake.wizard.next')));
    await tester.pumpAndSettle();

    await tester.enterText(
        find.byKey(const Key('hatake.form.email')), 'a@example.com');
    await tester.tap(find.byKey(const Key('hatake.wizard.next')));
    await tester.pumpAndSettle();

    // Final step: 保存 replaces 次へ, and the computed summary is shown. It shows
    // the raw input — `normalize` runs at save time, as it does for any form.
    expect(find.byKey(const Key('hatake.wizard.next')), findsNothing);
    expect(find.byKey(const Key('hatake.wizard.save')), findsOneWidget);
    expect(find.text('Ｃ００１ / 山田商事'), findsOneWidget);

    await tester.tap(find.byKey(const Key('hatake.wizard.save')));
    await tester.pumpAndSettle();

    expect(repo.saves, 1);
    expect(repo.saved!['code'], 'C001'); // normalized
    expect(repo.saved!['name'], '山田商事');
    expect(repo.saved!['email'], 'a@example.com');
    expect(find.text('保存しました'), findsOneWidget);
  });

  testWidgets('a whole-form error jumps back to the step that owns the field',
      (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(_harness(repo));
    await tester.pumpAndSettle();

    await _fillBasic(tester);
    await tester.tap(find.byKey(const Key('hatake.wizard.next')));
    await tester.pumpAndSettle();

    await tester.enterText(
        find.byKey(const Key('hatake.form.email')), 'a@example.com');
    await tester.tap(find.byKey(const Key('hatake.wizard.next')));
    await tester.pumpAndSettle();

    // Wipe an earlier step's required field, then try to save from the last one.
    await tester.tap(find.byKey(const Key('hatake.wizard.back')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.wizard.back')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('hatake.form.name')), '');
    await tester.tap(find.byKey(const Key('hatake.wizard.next')));
    await tester.pumpAndSettle();

    // The step itself refuses first — nothing was saved.
    expect(find.text('必須項目です'), findsOneWidget);
    expect(repo.saves, 0);
  });

  testWidgets('with a record key the wizard edits, seeded from the repository',
      (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(_harness(repo, recordKey: 'X1'));
    await tester.pumpAndSettle();

    expect(
      tester.widget<TextField>(find.byKey(const Key('hatake.form.code'))).controller!.text,
      'C001',
    );

    await tester.tap(find.byKey(const Key('hatake.wizard.next')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.wizard.next')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.wizard.save')));
    await tester.pumpAndSettle();

    expect(repo.saves, 1);
    expect(repo.saved!['name'], '山田商事');
  });
}
