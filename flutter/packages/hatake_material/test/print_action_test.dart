import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// Printing from a definition (`type: print`). The point of these tests: the
/// framework hands over **everything the paper needs and nothing it cannot
/// make** — no bytes, no file, no printer. A missing sink is reported rather
/// than swallowed, and a page with no report cannot print at all.
class _Orders implements Repository {
  final List<DataRecord> rows;
  final List<RepositoryQuery> queries = [];

  _Orders(this.rows);

  @override
  Future<PageResult> search(RepositoryQuery query) async {
    queries.add(query);
    return PageResult(items: rows, totalCount: rows.length);
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
  {'orderNo': 'SO-1', 'customer': '山田商事', 'amount': 100, 'cost': 60},
  {'orderNo': 'SO-2', 'customer': '山田商事', 'amount': 200, 'cost': 120},
];

const _report = ReportPageDefinition(
  id: 'sales_report',
  title: '売上明細表',
  repository: 'orderRepository',
  table: TableDefinition(
    columns: [
      ColumnDefinition(field: 'orderNo', label: '受注番号', width: 160),
      ColumnDefinition(
        field: 'amount',
        label: '金額',
        type: ColumnTypes.number,
        format: 'currency',
        config: {'symbol': '¥'},
      ),
      // 原価は管理者だけ。紙にも出てはいけない。
      ColumnDefinition(field: 'cost', label: '原価', roles: ['manager']),
    ],
  ),
  report: ReportDefinition(
    paper: PaperDefinition(size: PaperSizes.a4),
    rowsPerPage: 40,
    groups: [ReportGroup(field: 'customer', label: '顧客')],
    totals: [ReportTotal(field: 'amount', aggregate: AggregateOps.sum)],
  ),
  actions: [
    ActionDefinition(
      id: 'printPdf',
      type: ActionTypes.print,
      label: '印刷',
      config: {'filename': '売上明細', 'font': 'mincho'},
      onSuccess: ActionSuccessDefinition(message: '印刷しました'),
    ),
  ],
);

Widget _harness({
  PrintSink? printSink,
  Set<String> roles = const {},
  ReportPageDefinition definition = _report,
}) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({
          'orderRepository': _Orders(_rows),
        }),
        renderer: const MaterialRenderer(),
        printSink: printSink,
        roles: roles,
        child: HatakePageView(definition: definition),
      ),
    ),
  );
}

void main() {
  testWidgets('the sink gets the report, the rows on screen, and the name',
      (tester) async {
    PrintRequest? captured;
    await tester.pumpWidget(_harness(printSink: (r) => captured = r));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.action.printPdf')));
    await tester.pumpAndSettle();

    expect(captured!.page.id, 'sales_report');
    // Printing re-reads nothing: the paper holds what the screen held.
    expect(captured!.rows, _rows);
    expect(captured!.filename, '売上明細.pdf');
    expect(captured!.actionId, 'printPdf');
    // 用紙や字は出力先の語彙なので、config はそのまま渡る（Framework は読まない）。
    expect(captured!.config['font'], 'mincho');
    // The declared onSuccess ran, because the report reached the sink.
    expect(find.text('印刷しました'), findsOneWidget);
  });

  testWidgets('the file name falls back to the page title', (tester) async {
    PrintRequest? captured;
    await tester.pumpWidget(_harness(
      printSink: (r) => captured = r,
      definition: const ReportPageDefinition(
        id: 'sales_report',
        title: '売上明細表',
        repository: 'orderRepository',
        table: TableDefinition(
          columns: [ColumnDefinition(field: 'orderNo', label: '受注番号')],
        ),
        report: ReportDefinition(rowsPerPage: 40),
        actions: [
          ActionDefinition(
            id: 'printPdf',
            type: ActionTypes.print,
            label: '印刷',
          ),
        ],
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.action.printPdf')));
    await tester.pumpAndSettle();
    expect(captured!.filename, '売上明細表.pdf');
  });

  testWidgets(
      'the current roles ride along, so the paper hides what the screen hides',
      (tester) async {
    PrintRequest? withRole;
    await tester.pumpWidget(_harness(
      printSink: (r) => withRole = r,
      roles: const {'manager'},
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.action.printPdf')));
    await tester.pumpAndSettle();
    expect(withRole!.roles, const {'manager'});

    PrintRequest? withoutRole;
    await tester.pumpWidget(_harness(printSink: (r) => withoutRole = r));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.action.printPdf')));
    await tester.pumpAndSettle();
    expect(withoutRole!.roles, isEmpty);
  });

  testWidgets('the formatters are the renderer own ones, so a number reads '
      'the same on paper', (tester) async {
    PrintRequest? captured;
    await tester.pumpWidget(_harness(printSink: (r) => captured = r));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.action.printPdf')));
    await tester.pumpAndSettle();

    expect(
      captured!.formatters.format('currency', 100, const {'symbol': '¥'}),
      '¥100',
    );
  });

  testWidgets('no sink registered says so, and onSuccess does not run',
      (tester) async {
    await tester.pumpWidget(_harness());
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.action.printPdf')));
    await tester.pumpAndSettle();

    expect(find.textContaining('printSink'), findsOneWidget);
    expect(find.text('印刷しました'), findsNothing);
  });

  testWidgets('a sink that throws is reported, not swallowed', (tester) async {
    await tester.pumpWidget(_harness(
      printSink: (_) => throw StateError('プリンタが見つかりません'),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.action.printPdf')));
    await tester.pumpAndSettle();

    expect(find.textContaining('印刷に失敗しました'), findsOneWidget);
    expect(find.text('印刷しました'), findsNothing);
  });

  testWidgets('a page with no report cannot print, and says so',
      (tester) async {
    const search = SearchPageDefinition(
      id: 'order_search',
      title: '受注照会',
      repository: 'orderRepository',
      keyField: 'orderNo',
      table: TableDefinition(
        columns: [ColumnDefinition(field: 'orderNo', label: '受注番号')],
      ),
      actions: [
        ActionDefinition(
          id: 'printPdf',
          type: ActionTypes.print,
          label: '印刷',
        ),
      ],
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({
            'orderRepository': _Orders(_rows),
          }),
          renderer: const MaterialRenderer(),
          printSink: (_) {},
          child: const HatakePageView(definition: search),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.action.printPdf')));
    await tester.pumpAndSettle();
    expect(find.textContaining('刷れません'), findsOneWidget);
  });
}
