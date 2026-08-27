import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 一括を**区切って実行する**（`batchSize`）＝進み具合を出して、途中で止められる。
///
/// ここで守るのは4つ。**区切りごとに呼ぶ**（枠組みが回す）・**進み具合が見える**
/// （何件終わったか）・**中断は「まだ送っていない分を送らない」だけ**（送った分は
/// 動いている＝取り消しではない）・**報告は1回ぶんにまとめる**（何回に分けたかは
/// 枠組みの都合）。
class _Orders implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async => PageResult(
        items: [
          for (var i = 1; i <= 5; i++) {'orderNo': 'SO-$i', 'status': '未出荷'},
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

const _table = TableDefinition(
  pagination: PaginationDefinition(pageSize: 10),
  columns: [
    ColumnDefinition(field: 'orderNo', label: '受注番号'),
    ColumnDefinition(field: 'status', label: '状態'),
  ],
);

/// 2件ずつ渡す一括（5件選べば 2 + 2 + 1 の3回）。
SearchPageDefinition _page({int? batchSize, String? onError}) =>
    SearchPageDefinition(
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
          onError:
              onError == null ? null : ActionErrorDefinition(message: onError),
        ),
      ],
    );

Widget _harness(SearchPageDefinition page, ActionHandler handler) => MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'orderRepository': _Orders()}),
          renderer: const MaterialRenderer(),
          actions: ActionRegistry({'approveOrders': handler}),
          child: HatakePageView(definition: page),
        ),
      ),
    );

/// 全選択して一括ボタンを押す（確認は宣言していないので、そのまま走る）。
Future<void> _pressAll(WidgetTester tester) async {
  await tester.tap(find.byType(Checkbox).first);
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('hatake.action.approve')));
  await tester.pump();
}

String _snack(WidgetTester tester) {
  final text = find.descendant(
    of: find.byType(SnackBar),
    matching: find.byType(Text),
  );
  return tester.widget<Text>(text.first).data ?? '';
}

void main() {
  testWidgets('区切りごとに呼ぶ（5件を2件ずつ＝3回）', (tester) async {
    final batches = <int>[];
    await tester.pumpWidget(_harness(
      _page(batchSize: 2),
      (ctx) async => batches.add(ctx.records.length),
    ));
    await tester.pumpAndSettle();
    await _pressAll(tester);
    await tester.pumpAndSettle();

    expect(batches, [2, 2, 1]);
  });

  testWidgets('区切りが1回で終わるなら、今まで通り1回で渡す（ダイアログも出さない）',
      (tester) async {
    final batches = <int>[];
    await tester.pumpWidget(_harness(
      _page(batchSize: 20),
      (ctx) async => batches.add(ctx.records.length),
    ));
    await tester.pumpAndSettle();
    await _pressAll(tester);
    await tester.pumpAndSettle();

    expect(batches, [5]);
    expect(find.byKey(const Key('hatake.bulkProgress')), findsNothing);
  });

  testWidgets('進み具合が見える（何件終わったか）', (tester) async {
    // 1区切りごとに待たせて、途中の姿を見る。
    final gates = <Completer<void>>[];
    await tester.pumpWidget(_harness(_page(batchSize: 2), (ctx) async {
      final gate = Completer<void>();
      gates.add(gate);
      await gate.future;
    }));
    await tester.pumpAndSettle();
    await _pressAll(tester);
    await tester.pump();

    expect(find.byKey(const Key('hatake.bulkProgress')), findsOneWidget);
    expect(find.text('0 / 5 件'), findsOneWidget);

    gates[0].complete();
    await tester.pump();
    await tester.pump();
    expect(find.text('2 / 5 件'), findsOneWidget);

    gates[1].complete();
    await tester.pump();
    await tester.pump();
    expect(find.text('4 / 5 件'), findsOneWidget);

    gates[2].complete();
    await tester.pumpAndSettle();
    // 終わったら閉じる（閉じるボタンは出さない）。
    expect(find.byKey(const Key('hatake.bulkProgress')), findsNothing);
  });

  testWidgets('中断すると、まだ送っていない分を送らない（送った分は動いている）',
      (tester) async {
    final gates = <Completer<void>>[];
    final batches = <int>[];
    await tester.pumpWidget(_harness(_page(batchSize: 2), (ctx) async {
      batches.add(ctx.records.length);
      final gate = Completer<void>();
      gates.add(gate);
      await gate.future;
    }));
    await tester.pumpAndSettle();
    await _pressAll(tester);
    await tester.pump();

    // 1区切り目が走っている間に中断。
    await tester.tap(find.byKey(const Key('hatake.bulkProgress.cancel')));
    await tester.pump();
    gates[0].complete();
    await tester.pumpAndSettle();

    // 送ったのは1区切りだけ（残りは送らない）。
    expect(batches, [2]);
    // 「実行した」と「実行していない」を分けて言う（失敗とは別）。
    expect(_snack(tester), '2 件を実行しました（3 件は実行していません）');
  });

  testWidgets('止めた実行では onSuccess を動かさない（一部は動いていないので）',
      (tester) async {
    final gates = <Completer<void>>[];
    const page = SearchPageDefinition(
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
          batchSize: 2,
          onSuccess: ActionSuccessDefinition(message: '全部承認しました'),
        ),
      ],
    );
    await tester.pumpWidget(_harness(page, (ctx) async {
      final gate = Completer<void>();
      gates.add(gate);
      await gate.future;
    }));
    await tester.pumpAndSettle();
    await _pressAll(tester);
    await tester.pump();
    await tester.tap(find.byKey(const Key('hatake.bulkProgress.cancel')));
    await tester.pump();
    gates[0].complete();
    await tester.pumpAndSettle();

    expect(find.text('全部承認しました'), findsNothing);
  });

  testWidgets('区切りごとの報告は足し合わせる（押した人が見るのは1回ぶん）',
      (tester) async {
    await tester.pumpWidget(_harness(
      _page(
        batchSize: 2,
        onError: '{count} 件を承認（{failed} 件だめ: {failedKeys}）',
      ),
      (ctx) async {
        // 区切りごとに1件だめ、と報告する。
        final first = ctx.records.first;
        ctx.report(ActionOutcome.rejected(
          succeeded: ctx.records.length - 1,
          rows: [FailedRow(first['orderNo'], reason: '出荷済')],
        ));
      },
    ));
    await tester.pumpAndSettle();
    await _pressAll(tester);
    await tester.pumpAndSettle();

    // 3回ぶんを合算（成功 1+1+0、失敗 3、名指しも3件）。
    expect(_snack(tester), '2 件を承認（3 件だめ: SO-1, SO-3, SO-5）');
  });

  testWidgets('区切りが失敗したら、残りは送らない（同じ理由で失敗し続けない）',
      (tester) async {
    final batches = <int>[];
    await tester.pumpWidget(_harness(_page(batchSize: 2), (ctx) async {
      batches.add(ctx.records.length);
      if (batches.length == 2) throw StateError('締め済み');
    }));
    await tester.pumpAndSettle();
    await _pressAll(tester);
    await tester.pumpAndSettle();

    expect(batches, [2, 2]);
    expect(_snack(tester), contains('締め済み'));
    // 進み具合のダイアログは閉じる（裏で走っているように見せない）。
    expect(find.byKey(const Key('hatake.bulkProgress')), findsNothing);
  });
}
