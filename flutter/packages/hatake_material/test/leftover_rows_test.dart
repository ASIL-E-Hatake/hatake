import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 一括のあとに残った行を、**画面の外へ持ち出す**（CSV）。
///
/// 選び直し（「この行だけ選ぶ」／中断したら残りは選んだまま）は「いま・ここ」の話で、
/// 読み直す・ページを変える・画面を閉じるで消える。一括の失敗と中断はそこで終わりでは
/// なく「担当に配る」「翌日やり直す」が続くので、画面の外に出せる形が要る。
///
/// ここで守るのは4つ。**1枚に出す**（次にやることは同じなので、失敗と未実行で2枚に
/// 分けない）・**理由の列でどちらか分かる**・**出す口が無ければボタンを出さない**
/// （押しても何も起きないボタンを作らない）・**見えない列は持ち出せない**。
class _Orders implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async => PageResult(
        items: [
          for (var i = 1; i <= 5; i++)
            {'orderNo': 'SO-$i', 'status': '未出荷', 'cost': 100 * i},
        ],
        totalCount: 5,
      );
  @override
  Future<DataRecord?> findByKey(Object key) async => null;
  @override
  Future<DataRecord> create(DataRecord data) async => data;
  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;
  @override
  Future<void> delete(Object key) async {}
}

/// 原価の列は manager だけに見える（持ち出しでも同じ扱いになるか）。
const _table = TableDefinition(
  pagination: PaginationDefinition(pageSize: 10),
  columns: [
    ColumnDefinition(field: 'orderNo', label: '受注番号'),
    ColumnDefinition(field: 'status', label: '状態'),
    ColumnDefinition(field: 'cost', label: '原価', roles: ['manager']),
  ],
);

SearchPageDefinition _page({BatchSize? batchSize}) => SearchPageDefinition(
      id: 'order_search',
      title: '受注照会',
      repository: 'orderRepository',
      keyField: 'orderNo',
      table: _table,
      actions: [
        ActionDefinition(
          id: 'approve',
          type: ActionTypes.plugin,
          plugin: 'approveOrders',
          label: '一括承認',
          scope: ActionScopes.selection,
          batchSize: batchSize,
        ),
      ],
    );

Widget _harness(
  SearchPageDefinition page,
  ActionHandler handler, {
  ExportSink? exportSink,
  Set<String> roles = const {},
}) =>
    MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'orderRepository': _Orders()}),
          renderer: const MaterialRenderer(),
          actions: ActionRegistry({'approveOrders': handler}),
          exportSink: exportSink,
          roles: roles,
          child: HatakePageView(definition: page),
        ),
      ),
    );

Future<void> _pressAll(WidgetTester tester) async {
  await tester.tap(find.byType(Checkbox).first);
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('hatake.action.approve')));
  await tester.pump();
}

void main() {
  testWidgets('失敗した行を CSV に出す（理由の列が付く）', (tester) async {
    ExportRequest? sent;
    await tester.pumpWidget(_harness(
      _page(),
      (ctx) async => ctx.report(ActionOutcome.rejected(
        succeeded: 3,
        rows: const [
          FailedRow('SO-1', reason: '締め済み'),
          FailedRow('SO-2'),
        ],
      )),
      exportSink: (request) async => sent = request,
    ));
    await tester.pumpAndSettle();
    await _pressAll(tester);
    await tester.pumpAndSettle();

    await tester.tap(find.text('どの行か'));
    await tester.pumpAndSettle();
    expect(find.text('CSV に出す（失敗した 2 件）'), findsOneWidget);
    await tester.tap(find.byKey(const Key('hatake.leftover.export')));
    await tester.pumpAndSettle();

    expect(sent, isNotNull);
    // ファイル名はボタンのラベルから（何の残りか分かる形）。
    expect(sent!.filename, '一括承認_残り.csv');
    expect(sent!.actionId, 'approve');
    // Excel で開くので BOM 付き（`type: export` の既定と同じ）。
    expect(sent!.text.startsWith('\u{FEFF}'), isTrue);
    final lines = sent!.text.replaceFirst('\u{FEFF}', '').trim().split('\r\n');
    // 見えない列（原価は manager だけ）は持ち出せない。理由の列が最後に付く。
    expect(lines.first, '受注番号,状態,理由');
    expect(lines[1], 'SO-1,未出荷,締め済み');
    // 理由を書いていない行も出す（黙って落とすと「1件だけ失敗した」に見える）。
    expect(lines[2], 'SO-2,未出荷,失敗しました');
    expect(lines, hasLength(3));
  });

  testWidgets('見える人には、見える列も入る', (tester) async {
    ExportRequest? sent;
    await tester.pumpWidget(_harness(
      _page(),
      (ctx) async => ctx.report(
        ActionOutcome.rejected(rows: const [FailedRow('SO-1', reason: '締め済み')]),
      ),
      exportSink: (request) async => sent = request,
      roles: const {'manager'},
    ));
    await tester.pumpAndSettle();
    await _pressAll(tester);
    await tester.pumpAndSettle();
    await tester.tap(find.text('どの行か'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.leftover.export')));
    await tester.pumpAndSettle();

    final lines = sent!.text.replaceFirst('\u{FEFF}', '').trim().split('\r\n');
    expect(lines.first, '受注番号,状態,原価,理由');
    expect(lines[1], 'SO-1,未出荷,100,締め済み');
  });

  testWidgets('出す口が無ければ、そのボタンは出さない', (tester) async {
    await tester.pumpWidget(_harness(
      _page(),
      (ctx) async => ctx.report(
        ActionOutcome.rejected(rows: const [FailedRow('SO-1', reason: '締め済み')]),
      ),
    ));
    await tester.pumpAndSettle();
    await _pressAll(tester);
    await tester.pumpAndSettle();
    await tester.tap(find.text('どの行か'));
    await tester.pumpAndSettle();

    // 「この行だけ選ぶ」は出るが、持ち出しは出ない（押しても何も起きないので）。
    expect(find.byKey(const Key('hatake.failedRows.select')), findsOneWidget);
    expect(find.byKey(const Key('hatake.leftover.export')), findsNothing);
  });

  testWidgets('中断しただけでも、実行していない行を持ち出せる', (tester) async {
    ExportRequest? sent;
    final gates = <Completer<void>>[];
    await tester.pumpWidget(_harness(
      _page(batchSize: const BatchSize.of(2)),
      (ctx) async {
        final gate = Completer<void>();
        gates.add(gate);
        await gate.future;
      },
      exportSink: (request) async => sent = request,
    ));
    await tester.pumpAndSettle();
    await _pressAll(tester);
    await tester.pump();
    await tester.tap(find.byKey(const Key('hatake.bulkProgress.cancel')));
    await tester.pump();
    gates[0].complete();
    await tester.pumpAndSettle();

    // 失敗は1件も無いので「どの行か」は出ない。持ち出しはその場でできる。
    expect(find.text('どの行か'), findsNothing);
    await tester.tap(find.byKey(const Key('hatake.leftover.export')));
    await tester.pumpAndSettle();

    final lines = sent!.text.replaceFirst('\u{FEFF}', '').trim().split('\r\n');
    expect(lines.first, '受注番号,状態,理由');
    // 送っていない3件だけ（送った2件は出さない＝もう動いている）。
    expect(lines.sublist(1), [
      'SO-3,未出荷,実行していません',
      'SO-4,未出荷,実行していません',
      'SO-5,未出荷,実行していません',
    ]);
  });

  testWidgets('失敗と未実行が混ざっても、1枚に出る（理由で分かれる）', (tester) async {
    ExportRequest? sent;
    var calls = 0;
    await tester.pumpWidget(_harness(
      _page(batchSize: const BatchSize.of(2)),
      (ctx) async {
        calls++;
        // 2区切り目は1件失敗（報告）。3区切り目は投げる＝そこから先は送らない。
        if (calls == 2) {
          ctx.report(ActionOutcome.rejected(
            succeeded: 1,
            rows: [FailedRow(ctx.records.last['orderNo'], reason: '締め済み')],
          ));
        }
        if (calls == 3) throw StateError('締め済み');
      },
      exportSink: (request) async => sent = request,
    ));
    await tester.pumpAndSettle();
    await _pressAll(tester);
    await tester.pumpAndSettle();

    // 区切りが投げたときは、通知に出るのは**その理由**（件数に置き換えない）。
    // 名指しできた行は紙の中に残る＝そこまでの報告を落とさない。
    expect(find.textContaining('締め済み'), findsOneWidget);
    await tester.tap(find.byKey(const Key('hatake.leftover.export')));
    await tester.pumpAndSettle();

    final lines = sent!.text.replaceFirst('\u{FEFF}', '').trim().split('\r\n');
    // 失敗した行が先（手が要る側）。投げた区切りの行は「終わっていない」側に数える
    // ＝送ったけれど動いたかどうかは枠組みには分からない。
    expect(lines.sublist(1), [
      'SO-4,未出荷,締め済み',
      'SO-5,未出荷,実行していません',
    ]);
  });
}
