import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 画面項目の制御: 新規/編集での出し分けと、選択肢の連動。
/// どちらも「毎回 Dart で書かせない」ためのもの。

final _rows = <DataRecord>[
  {'id': 1, 'code': 'C001', 'prefecture': 'tokyo', 'city': 'shibuya'},
];

class _Records implements Repository {
  final List<DataRecord> rows;
  final List<DataRecord> saved = [];

  _Records(this.rows);

  @override
  Future<PageResult> search(RepositoryQuery query) async =>
      PageResult(items: rows, totalCount: rows.length);
  @override
  Future<DataRecord?> findByKey(Object key) async => rows.first;
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

/// 市区町村マスタ。`optionsSource` の相手（選択肢を引く先）。
class _Cities implements Repository {
  final List<RepositoryQuery> queries = [];

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    queries.add(query);
    const all = [
      {'code': 'shibuya', 'name': '渋谷区', 'prefecture': 'tokyo'},
      {'code': 'setagaya', 'name': '世田谷区', 'prefecture': 'tokyo'},
      {'code': 'kita', 'name': '北区', 'prefecture': 'osaka'},
    ];
    final wanted = query.filters['prefecture'];
    final items = wanted == null
        ? all
        : all.where((r) => r['prefecture'] == wanted).toList();
    return PageResult(items: items, totalCount: items.length);
  }

  @override
  Future<DataRecord?> findByKey(Object key) async => null;
  @override
  Future<DataRecord> create(DataRecord data) async => data;
  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;
  @override
  Future<void> delete(Object key) async {}
}

const _table = TableDefinition(
  columns: [ColumnDefinition(field: 'code', label: 'コード')],
  rowActions: [ActionTypes.edit],
);

/// コードは新規のときだけ入力できる。備考は編集のときだけ出す。
const _modePage = CrudPageDefinition(
  id: 'customer_master',
  title: '顧客マスタ',
  repository: 'customerRepository',
  table: _table,
  form: FormDefinition(
    sections: [
      SectionDefinition(
        fields: [
          FieldDefinition(
            field: 'code',
            label: 'コード',
            enabledWhen: {'mode': ConditionModes.create},
          ),
          FieldDefinition(
            field: 'note',
            label: '備考',
            visibleWhen: {'mode': ConditionModes.edit},
          ),
        ],
      ),
    ],
  ),
  actions: [
    ActionDefinition(id: 'create', type: ActionTypes.create, label: '新規登録'),
  ],
);

/// 都道府県 → 市区町村（定義に書いた静的な絞り込み）。
const _staticCascade = FormDefinition(
  sections: [
    SectionDefinition(
      fields: [
        FieldDefinition(
          field: 'prefecture',
          label: '都道府県',
          type: FieldTypes.select,
          options: [
            OptionItem(value: 'tokyo', label: '東京都'),
            OptionItem(value: 'osaka', label: '大阪府'),
          ],
        ),
        FieldDefinition(
          field: 'city',
          label: '市区町村',
          type: FieldTypes.select,
          optionsFrom: 'prefecture',
          options: [
            OptionItem(value: 'shibuya', label: '渋谷区', when: 'tokyo'),
            OptionItem(value: 'setagaya', label: '世田谷区', when: 'tokyo'),
            OptionItem(value: 'kita', label: '北区', when: 'osaka'),
          ],
        ),
      ],
    ),
  ],
);

/// 同じ連動を Repository から引く版。
const _sourcedCascade = FormDefinition(
  sections: [
    SectionDefinition(
      fields: [
        FieldDefinition(
          field: 'prefecture',
          label: '都道府県',
          type: FieldTypes.select,
          options: [
            OptionItem(value: 'tokyo', label: '東京都'),
            OptionItem(value: 'osaka', label: '大阪府'),
          ],
        ),
        FieldDefinition(
          field: 'city',
          label: '市区町村',
          type: FieldTypes.select,
          optionsFrom: 'prefecture',
          optionsSource: OptionsSource(
            repository: 'cityRepository',
            value: 'code',
            label: 'name',
            parentKey: 'prefecture',
          ),
        ),
      ],
    ),
  ],
);

Widget _host(Repository records, {FormDefinition? form, Repository? cities}) {
  final definition = form == null
      ? _modePage
      : FormPageDefinition(
          id: 'customer_form',
          title: '顧客入力',
          repository: 'customerRepository',
          form: form,
        );
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({
          'customerRepository': records,
          if (cities != null) 'cityRepository': cities,
        }),
        renderer: const MaterialRenderer(),
        child: HatakePageView(definition: definition),
      ),
    ),
  );
}

void main() {
  group('mode: 新規と編集で出し分ける', () {
    testWidgets('新規はコードが入力でき、備考は出ない', (tester) async {
      await tester.pumpWidget(_host(_Records([..._rows])));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('hatake.action.create')));
      await tester.pumpAndSettle();

      final code =
          tester.widget<TextField>(find.byKey(const Key('hatake.form.code')));
      expect(code.readOnly, isFalse);
      expect(find.byKey(const Key('hatake.form.note')), findsNothing);
    });

    testWidgets('編集はコードが非活性、備考が出る', (tester) async {
      await tester.pumpWidget(_host(_Records([..._rows])));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('hatake.edit.1')));
      await tester.pumpAndSettle();

      final code =
          tester.widget<TextField>(find.byKey(const Key('hatake.form.code')));
      // キー項目を見る回避策ではなく、定義に mode と書いてこうなる。
      expect(code.readOnly, isTrue);
      expect(find.byKey(const Key('hatake.form.note')), findsOneWidget);
    });
  });

  group('選択肢の連動（定義に書く）', () {
    testWidgets('親を選ぶまで子は空、選ぶと絞られる', (tester) async {
      await tester.pumpWidget(_host(_Records([]), form: _staticCascade));
      await tester.pumpAndSettle();

      Future<void> openCity() async {
        await tester.tap(find.byKey(const Key('hatake.form.city')));
        await tester.pumpAndSettle();
      }

      // 親が未入力: when 付きの選択肢は出ない。
      await openCity();
      expect(find.text('渋谷区'), findsNothing);
      await tester.tapAt(const Offset(10, 10)); // 閉じる
      await tester.pumpAndSettle();

      // 東京都を選ぶ。
      await tester.tap(find.byKey(const Key('hatake.form.prefecture')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('東京都').last);
      await tester.pumpAndSettle();

      await openCity();
      expect(find.text('渋谷区'), findsWidgets);
      expect(find.text('世田谷区'), findsWidgets);
      expect(find.text('北区'), findsNothing);
    });

    testWidgets('親を変えると、選べなくなった子の値を捨てる', (tester) async {
      final repository = _Records([]);
      await tester.pumpWidget(_host(repository, form: _staticCascade));
      await tester.pumpAndSettle();

      // 東京都 → 渋谷区 を選ぶ。
      await tester.tap(find.byKey(const Key('hatake.form.prefecture')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('東京都').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('hatake.form.city')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('渋谷区').last);
      await tester.pumpAndSettle();

      // 大阪府に変える。渋谷区は選べないので消える（「大阪府なのに渋谷区」を防ぐ）。
      await tester.tap(find.byKey(const Key('hatake.form.prefecture')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('大阪府').last);
      await tester.pumpAndSettle();

      expect(find.text('渋谷区'), findsNothing);

      await tester.tap(find.byKey(const Key('hatake.form.save')));
      await tester.pumpAndSettle();
      expect(repository.saved.single['prefecture'], 'osaka');
      expect(repository.saved.single['city'], isNull);
    });
  });

  group('選択肢の連動（Repository から引く）', () {
    testWidgets('親の値を絞り込み条件として渡す', (tester) async {
      final cities = _Cities();
      await tester.pumpWidget(
          _host(_Records([]), form: _sourcedCascade, cities: cities));
      await tester.pumpAndSettle();

      // 親が未入力のうちは引かない（全件出しても連動の意味が無い）。
      expect(cities.queries, isEmpty);

      await tester.tap(find.byKey(const Key('hatake.form.prefecture')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('大阪府').last);
      await tester.pumpAndSettle();

      // Repository に「prefecture: osaka」で聞いている。
      expect(cities.queries.single.filters, {'prefecture': 'osaka'});

      await tester.tap(find.byKey(const Key('hatake.form.city')));
      await tester.pumpAndSettle();
      expect(find.text('北区'), findsWidgets);
      expect(find.text('渋谷区'), findsNothing);
    });

    testWidgets('親を変えたら引き直す', (tester) async {
      final cities = _Cities();
      await tester.pumpWidget(
          _host(_Records([]), form: _sourcedCascade, cities: cities));
      await tester.pumpAndSettle();

      for (final prefecture in ['大阪府', '東京都']) {
        await tester.tap(find.byKey(const Key('hatake.form.prefecture')));
        await tester.pumpAndSettle();
        await tester.tap(find.text(prefecture).last);
        await tester.pumpAndSettle();
      }

      expect(cities.queries.map((q) => q.filters['prefecture']),
          ['osaka', 'tokyo']);
      // 同じ親で描き直しても引き直さない（キャッシュ）。
      await tester.pump();
      expect(cities.queries.length, 2);
    });
  });
}
