import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

class _Repo implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async => const PageResult(
        items: [
          {'id': 1, 'name': 'A社', 'amount': 1234567, 'balance': -1234},
        ],
        totalCount: 1,
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

const _definition = CrudPageDefinition(
  id: 'billing',
  title: '請求',
  repository: 'repo',
  keyField: 'id',
  table: TableDefinition(columns: [
    ColumnDefinition(field: 'name', label: '名前'),
    ColumnDefinition(
      field: 'amount',
      label: '金額',
      format: 'currency',
      config: {'symbol': '¥'},
    ),
    ColumnDefinition(
      field: 'balance',
      label: '残高',
      format: 'currency',
      config: {'negative': 'triangle'},
    ),
  ]),
  form: FormDefinition(),
);

void main() {
  testWidgets('column format renders via FormatterRegistry', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'repo': _Repo()}),
          renderer: const MaterialRenderer(),
          child: const HatakeCrudView(definition: _definition),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('¥1,234,567'), findsOneWidget);
    expect(find.text('△1,234'), findsOneWidget);
  });
}
