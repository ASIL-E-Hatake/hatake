import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_example/definition_source.dart';

void main() {
  // The shipped asset is the source of truth for the demo.
  final source = File('assets/sales_app.yaml').readAsStringSync();

  test('extracts the page block, de-indented and copy-pasteable', () {
    final yaml = extractPageYaml(source, 'order_search')!;

    // Starts at column 0 as a standalone page definition.
    expect(yaml.startsWith('type: search'), isTrue);
    expect(yaml, contains('id: order_search'));
    expect(yaml, contains('rowActions: [detail, openEntry, openEntryPaged]'));
    // Nested structure keeps its relative indentation.
    expect(yaml, contains('  columns:'));
    // Stops before the next page.
    expect(yaml, isNot(contains('id: order_detail')));
  });

  test('a dashboard block extracts like any other page', () {
    final yaml = extractPageYaml(source, 'sales_dashboard')!;

    expect(yaml.startsWith('type: dashboard'), isTrue);
    expect(yaml, contains('items:'));
    // Cards keep their relative indentation and stop before the next page.
    expect(yaml, contains('  - { id: orderCount'));
    expect(yaml, isNot(contains('id: customer_master')));
  });

  test('picks the right page among several', () {
    expect(extractPageYaml(source, 'customer_master'),
        startsWith('type: master'));
    expect(extractPageYaml(source, 'order_detail')!, contains('id: order_detail'));
  });

  test('menu entries are not mistaken for pages', () {
    // `customers` is a menu item id, not a page id.
    expect(extractPageYaml(source, 'customers'), isNull);
  });

  test('unknown id returns null', () {
    expect(extractPageYaml(source, 'nope'), isNull);
  });
}
