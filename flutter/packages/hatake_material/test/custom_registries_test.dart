import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// アプリが足した集約と計算の op が、実際に効くこと。
///
/// `validate` は知らない集約に対して「`AggregateRegistry` に登録するか」と言うが、
/// **アプリから登録する口が無かった**（コントローラが既定のレジストリを自分で作って
/// いた）。道具が「できる」と言うことをできるようにする、が趣旨。
class _Orders implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async => const PageResult(
        items: [
          {'amount': 100},
          {'amount': 300},
          {'amount': 200},
        ],
        totalCount: 3,
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

/// 中央値。組み込みには無い（あえて業務でよく要るものを選んだ）。
num? _median(List<Map<String, Object?>> rows, String? field) {
  final values = [
    for (final row in rows)
      if (row[field] is num) row[field]! as num,
  ]..sort();
  if (values.isEmpty) return null;
  final middle = values.length ~/ 2;
  return values.length.isOdd
      ? values[middle]
      : (values[middle - 1] + values[middle]) / 2;
}

void main() {
  testWidgets('独自の集約（median）がダッシュボードで効く', (tester) async {
    const page = DashboardPageDefinition(
      id: 'sales_dashboard',
      title: '売上ダッシュボード',
      repository: 'orderRepository',
      items: [
        DashboardItemDefinition(
          id: 'middle',
          type: DashboardItemTypes.metric,
          title: '中央値',
          value: DashboardValueDefinition(aggregate: 'median', field: 'amount'),
        ),
      ],
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'orderRepository': _Orders()}),
          renderer: const MaterialRenderer(),
          aggregates: AggregateRegistry({'median': _median}),
          child: const HatakePageView(definition: page),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('hatake.dashboard.middle.value')),
      findsOneWidget,
    );
    expect(find.text('200'), findsOneWidget);
  });

  testWidgets('独自の計算 op（discount）がフォームで効く', (tester) async {
    const page = FormPageDefinition(
      id: 'order_entry',
      title: '受注入力',
      repository: 'orderRepository',
      form: FormDefinition(
        sections: [
          SectionDefinition(
            fields: [
              FieldDefinition(
                field: 'amount',
                label: '金額',
                type: FieldTypes.number,
              ),
              FieldDefinition(
                field: 'payable',
                label: '請求額',
                type: FieldTypes.number,
                readOnly: true,
                computed: {'op': 'discount', 'field': 'amount'},
              ),
            ],
          ),
        ],
      ),
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'orderRepository': _Orders()}),
          renderer: const MaterialRenderer(),
          computeds: ComputedRegistry({
            // 1割引き。組み込みの op では書けない業務の計算。
            'discount': (computed, record) {
              final value = record[computed['field']];
              return value is num ? (value * 0.9).round() : null;
            },
          }),
          child: const HatakePageView(definition: page),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('hatake.form.amount')),
      '1000',
    );
    await tester.pumpAndSettle();

    expect(find.text('900'), findsOneWidget);
  });
}
