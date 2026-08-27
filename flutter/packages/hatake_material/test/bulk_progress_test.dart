import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 一括を**区切って実行する**（`batchSize`）＝進み具合を出して、途中で止められる。
///
/// ここで守るのは6つ。**区切りごとに呼ぶ**（枠組みが回す）・**進み具合が見える**
/// （何件終わったか）・**残り時間は実測から出す**（言えないうちは言わない）・
/// **中断は「まだ送っていない分を送らない」だけ**（送った分は動いている＝取り消しでは
/// ない）・**終わっていない行は選んだまま**（もう一度押せば続く）・**報告は1回ぶんに
/// まとめる**（何回に分けたかは枠組みの都合）。
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
SearchPageDefinition _page({BatchSize? batchSize, String? onError}) =>
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

Widget _harness(
  SearchPageDefinition page,
  ActionHandler handler, {
  Set<String> roles = const {},
}) =>
    MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'orderRepository': _Orders()}),
          renderer: const MaterialRenderer(),
          actions: ActionRegistry({'approveOrders': handler}),
          roles: roles,
          child: HatakePageView(definition: page),
        ),
      ),
    );

/// 行のチェックの状態（先頭は全選択なので落とす）。
List<bool> _checked(WidgetTester tester) => [
      for (final box in tester.widgetList<Checkbox>(find.byType(Checkbox)).skip(1))
        box.value ?? false,
    ];

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
      _page(batchSize: const BatchSize.of(2)),
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
      _page(batchSize: const BatchSize.of(20)),
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
    await tester.pumpWidget(_harness(_page(batchSize: const BatchSize.of(2)), (ctx) async {
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
    await tester.pumpWidget(_harness(_page(batchSize: const BatchSize.of(2)), (ctx) async {
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
    expect(
        _snack(tester),
        '2 件を実行しました（3 件は実行していません。'
        '残りは選んだままなので、もう一度押せば続きます）');
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
          batchSize: BatchSize.of(2),
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
        batchSize: const BatchSize.of(2),
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
    await tester.pumpWidget(_harness(_page(batchSize: const BatchSize.of(2)), (ctx) async {
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

  testWidgets('残り時間は実測から出す（1区切りも終わらないうちは言わない）',
      (tester) async {
    final gates = <Completer<void>>[];
    await tester.pumpWidget(
        _harness(_page(batchSize: const BatchSize.of(2)), (ctx) async {
      final gate = Completer<void>();
      gates.add(gate);
      await gate.future;
    }));
    await tester.pumpAndSettle();
    await _pressAll(tester);
    await tester.pump();

    // まだ1区切りも終わっていない＝出す根拠が無いので何も言わない。
    expect(find.textContaining('あと'), findsNothing);

    // 1区切り（2件）に4秒かかった＝残り3件はおよそ6秒。多めに言う（10秒単位）。
    await tester.pump(const Duration(seconds: 4));
    gates[0].complete();
    await tester.pump();
    await tester.pump();
    expect(find.text('2 / 5 件'), findsOneWidget);
    expect(find.text('あと 10 秒くらい'), findsOneWidget);

    gates[1].complete();
    await tester.pump();
    await tester.pump();
    gates[2].complete();
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('hatake.bulkProgress')), findsNothing);
  });

  testWidgets('中断したところから続けられる（終わっていない行だけが選ばれたまま）',
      (tester) async {
    final gates = <Completer<void>>[];
    final sent = <String>[];
    await tester.pumpWidget(
        _harness(_page(batchSize: const BatchSize.of(2)), (ctx) async {
      sent.addAll([for (final r in ctx.records) '${r['orderNo']}']);
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

    expect(sent, ['SO-1', 'SO-2']);
    // 送った2件の選択は外れ、残り3件は選ばれたまま（全選択のチェックも半端になる）。
    expect(_checked(tester), [false, false, true, true, true]);
    // もう一度押すと、続きだけが渡る（同じ行に二度実行しない）。
    sent.clear();
    await tester.tap(find.byKey(const Key('hatake.action.approve')));
    await tester.pump();
    gates[1].complete();
    await tester.pump();
    await tester.pump();
    gates[2].complete();
    await tester.pumpAndSettle();

    expect(sent, ['SO-3', 'SO-4', 'SO-5']);
    // 全部終わったので選択は解ける（同じ行に二度実行するのは、まず事故）。
    expect(_checked(tester), [false, false, false, false, false]);
  });

  testWidgets('区切りが失敗したときも、終わっていない行は選んだまま（失敗した区切りも含む）',
      (tester) async {
    final batches = <int>[];
    await tester.pumpWidget(
        _harness(_page(batchSize: const BatchSize.of(2)), (ctx) async {
      batches.add(ctx.records.length);
      if (batches.length == 2) throw StateError('締め済み');
    }));
    await tester.pumpAndSettle();
    await _pressAll(tester);
    await tester.pumpAndSettle();

    // 1区切り目は終わった（2件）。失敗した区切り（3・4件目）は「動いたのか
    // 分からない」側なので、5件目と一緒に選んだままにする。
    expect(_checked(tester), [false, false, true, true, true]);
  });

  testWidgets('区切りの件数は役割で決まる（当てはまる役割が複数なら一番小さい方）',
      (tester) async {
    final batches = <int>[];
    // 既定は4件ずつだが、branch は2件ずつ（回線の細い拠点は小さく）。
    final page = _page(
      batchSize: const BatchSize(rows: 4, byRole: {'branch': 2, 'manager': 3}),
    );
    await tester.pumpWidget(_harness(
      page,
      (ctx) async => batches.add(ctx.records.length),
      roles: const {'branch', 'manager'},
    ));
    await tester.pumpAndSettle();
    await _pressAll(tester);
    await tester.pumpAndSettle();

    expect(batches, [2, 2, 1]);
  });

  testWidgets('役割が当てはまらなければ既定の件数（4件ずつ）', (tester) async {
    final batches = <int>[];
    await tester.pumpWidget(_harness(
      _page(batchSize: const BatchSize(rows: 4, byRole: {'branch': 2})),
      (ctx) async => batches.add(ctx.records.length),
      roles: const {'staff'},
    ));
    await tester.pumpAndSettle();
    await _pressAll(tester);
    await tester.pumpAndSettle();

    expect(batches, [4, 1]);
  });
}

