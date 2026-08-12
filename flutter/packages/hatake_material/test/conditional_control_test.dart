import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 項目制御の次段: `readOnlyWhen` / `requiredWhen` / セクション単位の条件。
///
/// 前段（`visibleWhen` / `enabledWhen` / `mode`）で足りなかったのは3つ。
/// 「見た目は普通のまま直せないだけにしたい」「条件によって必須にしたい」
/// 「枠ごと出し分けたい」。

class _Records implements Repository {
  final List<DataRecord> saved = [];

  @override
  Future<PageResult> search(RepositoryQuery query) async =>
      const PageResult(items: [], totalCount: 0);
  @override
  Future<DataRecord?> findByKey(Object key) async => null;
  @override
  Future<DataRecord> create(DataRecord data) async {
    saved.add(data);
    return data;
  }

  @override
  Future<DataRecord> update(Object key, DataRecord data) async {
    saved.add(data);
    return data;
  }

  @override
  Future<void> delete(Object key) async {}
}

const _kind = FieldDefinition(
  field: 'kind',
  label: '区分',
  type: FieldTypes.select,
  options: [
    OptionItem(value: 'personal', label: '個人'),
    OptionItem(value: 'corp', label: '法人'),
  ],
);

/// 法人のときだけ、登録番号が必須になり、請求先の枠が出る。
/// 個人のときは会員番号を直せない（読み取り専用。値は読ませたい）。
const _form = FormDefinition(
  sections: [
    SectionDefinition(
      fields: [
        _kind,
        FieldDefinition(
          field: 'memberNo',
          label: '会員番号',
          readOnlyWhen: {'field': 'kind', 'value': 'personal'},
        ),
        FieldDefinition(
          field: 'invoiceNo',
          label: '登録番号',
          requiredWhen: {'field': 'kind', 'value': 'corp'},
        ),
      ],
    ),
    SectionDefinition(
      title: '請求先',
      visibleWhen: {'field': 'kind', 'value': 'corp'},
      fields: [
        FieldDefinition(field: 'billingCode', label: '請求先コード', required: true),
      ],
    ),
  ],
);

Widget _host(Repository records) => MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'customerRepository': records}),
          renderer: const MaterialRenderer(),
          child: const HatakePageView(
            definition: FormPageDefinition(
              id: 'customer_form',
              title: '顧客入力',
              repository: 'customerRepository',
              form: _form,
            ),
          ),
        ),
      ),
    );

/// 画面が縦に長い（枠が出ると保存ボタンが 800x600 の外に出る）ので広げる。
Future<void> _pump(WidgetTester tester, Repository records) async {
  tester.view.physicalSize = const Size(1200, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(_host(records));
  await tester.pumpAndSettle();
}

Future<void> _choose(WidgetTester tester, String label) async {
  await tester.tap(find.byKey(const Key('hatake.form.kind')));
  await tester.pumpAndSettle();
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}

Future<void> _save(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('hatake.form.save')));
  await tester.pumpAndSettle();
}

TextField _input(WidgetTester tester, String field) =>
    tester.widget<TextField>(find.byKey(Key('hatake.form.$field')));

void main() {
  group('readOnlyWhen', () {
    testWidgets('条件が成立すると読み取り専用。非活性とは違って灰色にしない',
        (tester) async {
      await _pump(tester, _Records());

      await _choose(tester, '個人');
      final locked = _input(tester, 'memberNo');
      expect(locked.readOnly, isTrue);
      // ここが enabledWhen との違い。値は普通に読める（選択もできる）。
      expect(locked.enabled, isTrue);

      await _choose(tester, '法人');
      expect(_input(tester, 'memberNo').readOnly, isFalse);
    });
  });

  group('requiredWhen', () {
    testWidgets('条件が成立しなければ、空でも保存できる', (tester) async {
      final records = _Records();
      await _pump(tester, records);

      await _choose(tester, '個人');
      await _save(tester);

      expect(records.saved, hasLength(1));
      expect(records.saved.single['invoiceNo'], isEmpty);
    });

    testWidgets('条件が成立すると必須になり、保存が止まる', (tester) async {
      final records = _Records();
      await _pump(tester, records);

      await _choose(tester, '法人');
      await tester.enterText(
          find.byKey(const Key('hatake.form.billingCode')), 'B1');
      await _save(tester);

      expect(find.text('必須項目です'), findsWidgets);
      expect(records.saved, isEmpty);
    });

    testWidgets('埋めれば保存できる', (tester) async {
      final records = _Records();
      await _pump(tester, records);

      await _choose(tester, '法人');
      await tester.enterText(
          find.byKey(const Key('hatake.form.invoiceNo')), 'T1');
      await tester.enterText(
          find.byKey(const Key('hatake.form.billingCode')), 'B1');
      await _save(tester);

      expect(records.saved.single['invoiceNo'], 'T1');
    });
  });

  group('セクション単位の条件', () {
    testWidgets('隠れている枠は見出しも項目も出ず、中の必須は保存を止めない', (tester) async {
      final records = _Records();
      await _pump(tester, records);

      await _choose(tester, '個人');
      expect(find.text('請求先'), findsNothing);
      expect(find.byKey(const Key('hatake.form.billingCode')), findsNothing);

      // 中に required: true があるが、見えないので求めない
      // （入力できないのに保存できない画面にはしない）。
      await _save(tester);
      expect(records.saved, hasLength(1));
    });

    testWidgets('枠が出たら、中の必須が効く', (tester) async {
      final records = _Records();
      await _pump(tester, records);

      await _choose(tester, '法人');
      expect(find.text('請求先'), findsOneWidget);
      expect(find.byKey(const Key('hatake.form.billingCode')), findsOneWidget);

      await tester.enterText(
          find.byKey(const Key('hatake.form.invoiceNo')), 'T1');
      await _save(tester);

      expect(find.text('必須項目です'), findsWidgets);
      expect(records.saved, isEmpty);
    });
  });
}
