import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_example/order_repository.dart';
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

/// The demo's multi-condition search, checked without driving the UI: the
/// filter widgets themselves are covered by hatake_material's widget tests.
void main() {
  final app = parseAppYaml(File('assets/sales_app.yaml').readAsStringSync());
  final page = app.pageById('order_search') as SearchPageDefinition;
  final filters = page.search!.filters;

  FilterDefinition filterOf(String field) =>
      filters.firstWhere((f) => f.field == field);

  test('the demo declares a multi-condition search in two columns', () {
    expect(page.search!.layout.columns, 2);
    expect(filters.map((f) => f.field),
        ['customer', 'status', 'shipped', 'orderDate']);

    expect(filterOf('customer').operator, FilterOperators.contains);

    final status = filterOf('status');
    expect(status.type, FieldTypes.select);
    expect(status.operator, FilterOperators.equals);
    expect(status.options.map((o) => o.label), ['未出荷', '出荷済']);

    expect(filterOf('shipped').type, FieldTypes.checkbox);

    final orderDate = filterOf('orderDate');
    expect(orderDate.type, FieldTypes.date);
    expect(orderDate.operator, FilterOperators.between);
  });

  group('OrderRepository applies every filter', () {
    Future<List<String>> found(Map<String, Object?> filters) async {
      final result = await OrderRepository.seeded()
          .search(RepositoryQuery(filters: filters));
      return result.items.map((r) => r['orderNo'] as String).toList();
    }

    test('no filters returns everything', () async {
      expect(await found(const {}), hasLength(4));
    });

    test('text filter matches partially', () async {
      expect(await found(const {'customer': '山田'}), ['SO-1001', 'SO-1004']);
    });

    test('select filter matches exactly', () async {
      expect(await found(const {'status': '出荷済'}), ['SO-1002', 'SO-1004']);
    });

    test('checkbox filter matches both true and false', () async {
      expect(await found(const {'shipped': true}), ['SO-1002', 'SO-1004']);
      expect(await found(const {'shipped': false}), ['SO-1001', 'SO-1003']);
    });

    test('between date filter is inclusive on both ends', () async {
      expect(
        await found(const {'orderDate': ['2026-07-14', '2026-07-28']}),
        ['SO-1001', 'SO-1002'],
      );
      // Open-ended: only one bound given.
      expect(await found(const {'orderDate': [null, '2026-06-30']}),
          ['SO-1004']);
      expect(await found(const {'orderDate': ['2026-08-01', null]}),
          ['SO-1003']);
    });

    test('conditions combine', () async {
      expect(
        await found(const {
          'customer': '山田',
          'status': '出荷済',
          'shipped': true,
          'orderDate': ['2026-01-01', '2026-12-31'],
        }),
        ['SO-1004'],
      );
    });
  });
}
