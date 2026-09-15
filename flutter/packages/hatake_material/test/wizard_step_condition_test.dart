import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 条件で丸ごと飛ばすステップ（`steps[].visibleWhen`）。
///
/// 守るのは**送り側と検証側が同じ答えを持つ**こと。片方だけだと、誰にも見えない
/// ステップの必須で保存できない画面（画面にはどこが悪いか出ない）か、条件が効いて
/// いない画面のどちらかになる。
class _Repo implements Repository {
  DataRecord? saved;

  @override
  Future<PageResult> search(RepositoryQuery query) async => PageResult.empty;
  @override
  Future<DataRecord?> findByKey(Object key) async => null;
  @override
  Future<DataRecord> create(DataRecord data) async => saved = data;
  @override
  Future<DataRecord> update(Object key, DataRecord data) async => saved = data;
  @override
  Future<void> delete(Object key) async {}
}

/// 区分が「法人」のときだけ請求先のステップを出すウィザード。
const _definition = WizardPageDefinition(
  id: 'customer_wizard',
  title: '顧客登録',
  repository: 'repo',
  steps: [
    WizardStepDefinition(
      id: 'basic',
      title: '基本情報',
      fields: [
        FieldDefinition(
          field: 'kind',
          label: '区分',
          type: FieldTypes.select,
          required: true,
          options: [
            OptionItem(value: 'corp', label: '法人'),
            OptionItem(value: 'person', label: '個人'),
          ],
        ),
      ],
    ),
    WizardStepDefinition(
      id: 'billing',
      title: '請求先',
      // 法人のときだけ。個人なら丸ごと飛ばす（必須も効かない）。
      visibleWhen: {'field': 'kind', 'operator': 'equals', 'value': 'corp'},
      fields: [
        FieldDefinition(field: 'billTo', label: '請求先', required: true),
      ],
    ),
    WizardStepDefinition(
      id: 'confirm',
      title: '確認',
      fields: [FieldDefinition(field: 'memo', label: '備考')],
    ),
  ],
);

Widget _harness(_Repo repo, {WizardPageDefinition definition = _definition}) =>
    MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'repo': repo}),
          renderer: const MaterialRenderer(),
          child: HatakeWizardView(definition: definition),
        ),
      ),
    );

/// 選択肢を選ぶ（開いてから、その札を押す）。
Future<void> _pick(WidgetTester tester, String label) async {
  await tester.tap(find.byKey(Key(HatakeKeys.form('kind'))));
  await tester.pumpAndSettle();
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}

Future<void> _next(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key(HatakeKeys.wizardNext)));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('条件に合うときは、そのステップを通る', (tester) async {
    await tester.pumpWidget(_harness(_Repo()));
    await tester.pumpAndSettle();

    await _pick(tester, '法人');
    await _next(tester);

    expect(find.byKey(Key(HatakeKeys.form('billTo'))), findsOneWidget);
    // 歩数の表示にも出る。
    expect(find.byKey(Key(HatakeKeys.wizardStep('billing'))), findsOneWidget);
  });

  testWidgets('**条件に合わないステップは丸ごと飛ばす**（歩数の表示にも出さない）',
      (tester) async {
    await tester.pumpWidget(_harness(_Repo()));
    await tester.pumpAndSettle();

    await _pick(tester, '個人');
    await _next(tester);

    // 請求先は出ない＝次は確認。
    expect(find.byKey(Key(HatakeKeys.form('billTo'))), findsNothing);
    expect(find.byKey(Key(HatakeKeys.form('memo'))), findsOneWidget);
    expect(find.byKey(Key(HatakeKeys.wizardStep('billing'))), findsNothing);
    // 飛ばした先が最後なら「保存」になる（次へは出ない）。
    expect(find.byKey(const Key(HatakeKeys.wizardSave)), findsOneWidget);
  });

  testWidgets('**隠れたステップの必須は保存を止めない**（検証も飛ぶ）', (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(_harness(repo));
    await tester.pumpAndSettle();

    await _pick(tester, '個人');
    await _next(tester);
    await tester.tap(find.byKey(const Key(HatakeKeys.wizardSave)));
    await tester.pumpAndSettle();

    // billTo は必須だが、そのステップは誰にも見えていない＝保存できる。
    expect(repo.saved, isNotNull);
    expect(repo.saved!['kind'], 'person');
    expect(repo.saved!.containsKey('billTo'), isFalse);
  });

  testWidgets('戻るときも飛ばす（送り側と検証側で答えが違わない）', (tester) async {
    await tester.pumpWidget(_harness(_Repo()));
    await tester.pumpAndSettle();

    await _pick(tester, '個人');
    await _next(tester);
    expect(find.byKey(Key(HatakeKeys.form('memo'))), findsOneWidget);

    await tester.tap(find.byKey(const Key(HatakeKeys.wizardBack)));
    await tester.pumpAndSettle();

    // 1つ戻ると、請求先ではなく基本情報。
    expect(find.byKey(Key(HatakeKeys.form('kind'))), findsOneWidget);
    expect(find.byKey(Key(HatakeKeys.form('billTo'))), findsNothing);
  });

  testWidgets('全部隠れたら、黙って1枚目を出さない', (tester) async {
    const nothingShown = WizardPageDefinition(
      id: 'w',
      title: '出せないウィザード',
      repository: 'repo',
      steps: [
        WizardStepDefinition(
          id: 'only',
          title: '唯一',
          visibleWhen: {'field': 'kind', 'operator': 'equals', 'value': 'never'},
          fields: [FieldDefinition(field: 'a', label: 'A')],
        ),
      ],
    );
    await tester.pumpWidget(_harness(_Repo(), definition: nothingShown));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key(HatakeKeys.wizardEmpty)), findsOneWidget);
    expect(find.byKey(Key(HatakeKeys.form('a'))), findsNothing);
  });
}
