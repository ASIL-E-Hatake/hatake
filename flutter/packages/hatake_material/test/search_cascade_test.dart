import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 検索条件の連動。入力フォームと同じ書き方（`optionsFrom` / `optionsSource`）が
/// 検索欄でも効くこと。「絞ってから探す」は業務では入力より先に欲しがられる。

class _Orders implements Repository {
  RepositoryQuery? lastQuery;

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    lastQuery = query;
    return const PageResult(
      items: [{'orderNo': 'SO-1'}],
      totalCount: 1,
    );
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

/// 市区町村マスタ。`optionsSource` の相手。
class _Cities implements Repository {
  final List<RepositoryQuery> queries = [];

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    queries.add(query);
    const all = [
      {'code': 'shibuya', 'name': '渋谷区', 'prefecture': 'tokyo'},
      {'code': 'kita', 'name': '北区', 'prefecture': 'osaka'},
    ];
    final wanted = query.filters['prefecture'];
    final items =
        wanted == null ? all : all.where((r) => r['prefecture'] == wanted).toList();
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

const _prefecture = FilterDefinition(
  field: 'prefecture',
  label: '都道府県',
  type: FieldTypes.select,
  operator: FilterOperators.equals,
  options: [
    OptionItem(value: 'tokyo', label: '東京都'),
    OptionItem(value: 'osaka', label: '大阪府'),
  ],
);

const _table = TableDefinition(
  columns: [ColumnDefinition(field: 'orderNo', label: '受注番号')],
);

/// 定義に書いた静的な絞り込み。
const _staticPage = SearchPageDefinition(
  id: 'order_search',
  title: '受注照会',
  repository: 'orderRepository',
  keyField: 'orderNo',
  search: SearchDefinition(
    filters: [
      _prefecture,
      FilterDefinition(
        field: 'city',
        label: '市区町村',
        type: FieldTypes.select,
        operator: FilterOperators.equals,
        optionsFrom: 'prefecture',
        options: [
          OptionItem(value: 'shibuya', label: '渋谷区', when: 'tokyo'),
          OptionItem(value: 'kita', label: '北区', when: 'osaka'),
          OptionItem(value: 'other', label: 'その他'),
        ],
      ),
    ],
  ),
  table: _table,
);

/// 選択肢を Repository から引く版。
const _sourcedPage = SearchPageDefinition(
  id: 'order_search',
  title: '受注照会',
  repository: 'orderRepository',
  keyField: 'orderNo',
  search: SearchDefinition(
    filters: [
      _prefecture,
      FilterDefinition(
        field: 'city',
        label: '市区町村',
        type: FieldTypes.select,
        operator: FilterOperators.equals,
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
  table: _table,
);

Widget _host(
  PageDefinition definition,
  Repository orders, {
  Repository? cities,
}) =>
    MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({
            'orderRepository': orders,
            if (cities != null) 'cityRepository': cities,
          }),
          renderer: const MaterialRenderer(),
          child: HatakePageView(definition: definition),
        ),
      ),
    );

Future<void> _choose(WidgetTester tester, String key, String label) async {
  await tester.tap(find.byKey(Key(key)));
  await tester.pumpAndSettle();
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}

void main() {
  group('検索条件の連動（定義に書く）', () {
    testWidgets('親を選ぶまで子は空、選ぶと絞られる', (tester) async {
      await tester.pumpWidget(_host(_staticPage, _Orders()));
      await tester.pumpAndSettle();

      // 親が未入力: when 付きは出ない（when 無しの「その他」だけ出る）。
      await tester.tap(find.byKey(const Key('hatake.filter.city')));
      await tester.pumpAndSettle();
      expect(find.text('渋谷区'), findsNothing);
      expect(find.text('その他'), findsWidgets);
      await tester.tapAt(const Offset(10, 10)); // 閉じる
      await tester.pumpAndSettle();

      await _choose(tester, 'hatake.filter.prefecture', '大阪府');

      await tester.tap(find.byKey(const Key('hatake.filter.city')));
      await tester.pumpAndSettle();
      expect(find.text('北区'), findsWidgets);
      expect(find.text('渋谷区'), findsNothing);
    });

    testWidgets('親を変えると、選べなくなった子の値を捨てて検索にも乗らない', (tester) async {
      final orders = _Orders();
      await tester.pumpWidget(_host(_staticPage, orders));
      await tester.pumpAndSettle();

      await _choose(tester, 'hatake.filter.prefecture', '東京都');
      await _choose(tester, 'hatake.filter.city', '渋谷区');
      // 大阪府に変えると渋谷区は選べない。
      await _choose(tester, 'hatake.filter.prefecture', '大阪府');

      await tester.tap(find.byKey(const Key('hatake.search')));
      await tester.pumpAndSettle();
      expect(orders.lastQuery!.filters, {'prefecture': 'osaka'});
    });
  });

  group('検索条件の連動（Repository から引く）', () {
    testWidgets('親の値を絞り込み条件として渡す', (tester) async {
      final cities = _Cities();
      await tester.pumpWidget(_host(_sourcedPage, _Orders(), cities: cities));
      await tester.pumpAndSettle();

      // 親が未入力のうちは引かない。
      expect(cities.queries, isEmpty);

      await _choose(tester, 'hatake.filter.prefecture', '大阪府');
      expect(cities.queries.single.filters, {'prefecture': 'osaka'});

      await tester.tap(find.byKey(const Key('hatake.filter.city')));
      await tester.pumpAndSettle();
      expect(find.text('北区'), findsWidgets);
      expect(find.text('渋谷区'), findsNothing);
    });
  });
}
