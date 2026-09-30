import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// `pageSize` 件で切って返す（サーバと同じ）。全体の件数は切る前の数。
class _PagedRepository implements Repository {
  final int total;
  _PagedRepository(this.total);

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    final start = query.page * query.pageSize;
    final end = (start + query.pageSize).clamp(0, total);
    return PageResult(
      items: [
        for (var i = start; i < end; i++) {'id': i, 'name': '行$i'},
      ],
      totalCount: total,
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

SearchPageDefinition _page(PaginationDefinition pagination) => SearchPageDefinition(
      id: 'rows',
      title: '行',
      repository: 'rows',
      keyFields: const ['id'],
      table: TableDefinition(
        columns: const [ColumnDefinition(field: 'name', label: '名前')],
        pagination: pagination,
      ),
    );

Future<void> _show(
  WidgetTester tester,
  PaginationDefinition pagination,
  int total,
) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'rows': _PagedRepository(total)}),
          renderer: const MaterialRenderer(),
          child: HatakePageView(definition: _page(pagination)),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

String _pagerText(WidgetTester tester) =>
    tester.widget<Text>(find.byKey(const Key(HatakeKeys.pagerText))).data!;

void main() {
  testWidgets('送る（既定）: 全 N 件とページ送り', (tester) async {
    await _show(tester, const PaginationDefinition(pageSize: 10), 25);
    expect(_pagerText(tester), '全 25 件');
    expect(find.byKey(const Key(HatakeKeys.next)), findsOneWidget);
  });

  testWidgets('送らない・出しきれない: 送る口を出さず、そう言う', (tester) async {
    await _show(
      tester,
      const PaginationDefinition(pageSize: 10, enabled: false),
      25,
    );
    expect(_pagerText(tester), '25 件中 10 件を表示しています（絞り込んでください）');
    expect(find.byKey(const Key(HatakeKeys.prev)), findsNothing);
    expect(find.byKey(const Key(HatakeKeys.next)), findsNothing);
    expect(find.text('行9'), findsOneWidget);
    expect(find.text('行10'), findsNothing);
  });

  testWidgets('送らない・全部出た: 全 N 件だけ', (tester) async {
    await _show(
      tester,
      const PaginationDefinition(pageSize: 10, enabled: false),
      7,
    );
    expect(_pagerText(tester), '全 7 件');
    expect(find.byKey(const Key(HatakeKeys.next)), findsNothing);
  });
}
