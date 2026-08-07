import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// A report page runs its conditions once, then pages over the built sheets.
class _Orders implements Repository {
  final List<DataRecord> rows;
  final List<RepositoryQuery> queries = [];

  _Orders(this.rows);

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    queries.add(query);
    var matched = rows;
    final status = query.filters['status'];
    if (status != null) {
      matched = rows.where((r) => r['status'] == status).toList();
    }
    return PageResult(items: matched, totalCount: matched.length);
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

final _rows = <DataRecord>[
  {'orderNo': 'SO-1', 'customer': '山田商事', 'status': '未出荷', 'amount': 100},
  {'orderNo': 'SO-2', 'customer': '山田商事', 'status': '出荷済', 'amount': 200},
  {'orderNo': 'SO-3', 'customer': '佐藤物産', 'status': '未出荷', 'amount': 50},
];

const _table = TableDefinition(
  columns: [
    ColumnDefinition(field: 'orderNo', label: '受注番号', width: 160),
    ColumnDefinition(
      field: 'amount',
      label: '金額',
      type: ColumnTypes.number,
      format: 'currency',
      config: {'symbol': '¥'},
    ),
  ],
);

const _report = ReportPageDefinition(
  id: 'sales_report',
  title: '売上明細表',
  repository: 'orderRepository',
  search: SearchDefinition(
    filters: [FilterDefinition(field: 'status', label: '状態')],
  ),
  table: _table,
  report: ReportDefinition(
    rowsPerPage: 40,
    groups: [ReportGroup(field: 'customer', label: '顧客')],
    totals: [ReportTotal(field: 'amount', aggregate: AggregateOps.sum)],
  ),
  actions: [
    ActionDefinition(
      id: 'csv',
      type: ActionTypes.export,
      label: 'CSV出力',
      config: {'filename': '売上明細', 'bom': true},
    ),
  ],
);

Widget _harness(
  Repository repository, {
  ReportPageDefinition definition = _report,
  ExportSink? exportSink,
}) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({'orderRepository': repository}),
        renderer: const MaterialRenderer(),
        exportSink: exportSink,
        child: HatakePageView(definition: definition),
      ),
    ),
  );
}

void main() {
  testWidgets('runs the conditions once and prints one sheet', (tester) async {
    final repository = _Orders(_rows);
    await tester.pumpWidget(_harness(repository));
    await tester.pumpAndSettle();

    // One bounded read (report.limit), not a paged list.
    expect(repository.queries.single.pageSize, 1000);
    expect(find.byKey(const Key('hatake.report.sheet')), findsOneWidget);
    // Group headings, formatted detail cells and the totals are all on paper.
    expect(find.text('顧客: 山田商事'), findsOneWidget);
    expect(find.text('顧客: 佐藤物産'), findsOneWidget);
    expect(find.text('¥100'), findsOneWidget);
    expect(find.text('小計'), findsNWidgets(2));
    expect(find.byKey(const Key('hatake.report.grandTotal')), findsOneWidget);
    expect(find.text('¥350'), findsOneWidget);
  });

  testWidgets('rows read like the app’s other lists', (tester) async {
    // The 帳票 used to be typeset dense like a print-out, which looked out of
    // place next to the search / master tables. These pin the shared look:
    // declared column widths, list-sized text, and one row height everywhere.
    await tester.pumpWidget(_harness(_Orders(_rows)));
    await tester.pumpAndSettle();

    final theme = Theme.of(tester.element(find.byType(HatakePageView)));

    // Detail cells sit in the width the column declared (like _sizedColumn).
    final cell = tester.widget<SizedBox>(find
        .descendant(
          of: find.byKey(const Key('hatake.report.detail.1')),
          matching: find.byType(SizedBox),
        )
        .first);
    expect(cell.width, 160);

    // Detail text is the same size as a list row's, not print-dense.
    final text = tester.widget<Text>(find.text('SO-1'));
    expect(text.style?.fontSize, theme.textTheme.bodyMedium?.fontSize);

    // Details and totals share one row height, so the columns line up.
    Size sizeOf(Key key) => tester.getSize(find.byKey(key));
    expect(sizeOf(const Key('hatake.report.detail.1')).height, 44);
    expect(sizeOf(const Key('hatake.report.grandTotal')).height, 44);
    // Group headings span the whole row (a narrow first column would clip them).
    expect(
      sizeOf(const Key('hatake.report.group.0')).width,
      sizeOf(const Key('hatake.report.detail.1')).width,
    );
  });

  testWidgets('the conditions re-run the report', (tester) async {
    final repository = _Orders(_rows);
    await tester.pumpWidget(_harness(repository));
    await tester.pumpAndSettle();

    await tester.enterText(
        find.byKey(const Key('hatake.filter.status')), '未出荷');
    await tester.tap(find.byKey(const Key('hatake.search')));
    await tester.pumpAndSettle();

    expect(repository.queries.last.filters, {'status': '未出荷'});
    // 100 + 50 of the two 未出荷 rows.
    expect(find.text('¥150'), findsOneWidget);
  });

  testWidgets('sheets are navigable when the rows do not fit one page',
      (tester) async {
    const twoPerSheet = ReportPageDefinition(
      id: 'sales_report',
      title: '売上明細表',
      repository: 'orderRepository',
      table: _table,
      report: ReportDefinition(rowsPerPage: 2),
    );
    await tester.pumpWidget(
        _harness(_Orders(_rows), definition: twoPerSheet));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.report.pageIndicator')), findsOneWidget);
    expect(find.text('1 / 2'), findsNWidgets(2)); // navigator + sheet header
    expect(find.text('SO-1'), findsOneWidget);
    expect(find.text('SO-3'), findsNothing);

    await tester.tap(find.byKey(const Key('hatake.report.next')));
    await tester.pumpAndSettle();
    expect(find.text('SO-3'), findsOneWidget);
    expect(find.text('SO-1'), findsNothing);
  });

  testWidgets('an empty result says so instead of drawing paper',
      (tester) async {
    await tester.pumpWidget(_harness(_Orders(const [])));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.empty')), findsOneWidget);
    expect(find.byKey(const Key('hatake.report.sheet')), findsNothing);
  });

  testWidgets('the export action hands a CSV to the registered sink',
      (tester) async {
    ExportRequest? captured;
    await tester.pumpWidget(_harness(
      _Orders(_rows),
      exportSink: (request) => captured = request,
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.action.csv')));
    await tester.pumpAndSettle();

    expect(captured, isNotNull);
    expect(captured!.filename, '売上明細.csv');
    expect(captured!.mimeType, 'text/csv');
    // BOM, the column labels, and the same formatting the sheet shows.
    expect(captured!.text.startsWith('\u{FEFF}受注番号,金額\r\n'), isTrue);
    expect(captured!.text, contains('SO-1,¥100'));
  });

  testWidgets('an export with no sink registered reports itself',
      (tester) async {
    await tester.pumpWidget(_harness(_Orders(_rows)));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.action.csv')));
    await tester.pumpAndSettle();

    expect(find.textContaining('出力先が未登録'), findsOneWidget);
  });
}
