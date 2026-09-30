import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 選んだ選択肢から値を写す（`optionsSource.copy`。0.9.23）。見本の受注入力は、商品を
/// 選んでも単価と税率が入らず、定義のコメントでは「マスタから来る」と書いていた。
class _Orders implements Repository {
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
  Future<DataRecord> update(Object key, DataRecord data) async => data;
  @override
  Future<void> delete(Object key) async {}
}

class _Products implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async => const PageResult(
        items: [
          {'code': 'P-1', 'name': 'りんご', 'price': 120, 'taxRate': 0.08},
          {'code': 'P-2', 'name': '皿', 'price': 900, 'taxRate': 0.1},
        ],
        totalCount: 2,
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

const _page = FormPageDefinition(
  id: 'order_entry',
  title: '受注入力',
  repository: 'orderRepository',
  form: FormDefinition(
    sections: [
      SectionDefinition(
        fields: [
          FieldDefinition(
            field: 'productCode',
            label: '商品',
            type: FieldTypes.select,
            optionsSource: OptionsSource(
              repository: 'productRepository',
              copy: {'unitPrice': 'price', 'taxRate': 'taxRate'},
            ),
          ),
          FieldDefinition(
              field: 'unitPrice', label: '単価', type: FieldTypes.number),
          FieldDefinition(
            field: 'taxRate',
            label: '税率',
            type: FieldTypes.number,
            readOnly: true,
          ),
        ],
      ),
    ],
  ),
);

void main() {
  testWidgets('選ぶと、書いた項目に引いた行の値が入る（読むだけの項目にも）', (tester) async {
    final orders = _Orders();
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({
            'orderRepository': orders,
            'productRepository': _Products(),
          }),
          renderer: const MaterialRenderer(),
          child: const HatakePageView(definition: _page),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.form.productCode')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('皿').last);
    await tester.pumpAndSettle();

    final price =
        tester.widget<TextField>(find.byKey(const Key('hatake.form.unitPrice')));
    expect(price.controller?.text, '900');

    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();
    expect(orders.saved.single['productCode'], 'P-2');
    expect(orders.saved.single['unitPrice'], 900);
    expect(orders.saved.single['taxRate'], 0.1);
  });
}
