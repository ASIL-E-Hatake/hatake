import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_example/playground.dart';
import 'package:hatake_example/playground_data.dart';
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

/// 貼ったら描画される、が全部。インストール前に触れる場を作るのが目的。

const _crud = '''
page:
  type: crud
  id: customer_master
  title: 顧客マスタ
  repository: customerRepository
  search:
    filters:
      - { field: name, label: 顧客名 }
  table:
    columns:
      - { field: code, label: コード }
      - { field: name, label: 顧客名 }
  form:
    sections:
      - fields:
          - { field: code, label: コード, required: true }
''';

Widget _host(String source, {Map<String, String> samples = const {}}) =>
    MaterialApp(home: Playground(initialSource: source, samples: samples));

void main() {
  group('プレイグラウンド', () {
    testWidgets('貼った定義がそのまま画面になる', (tester) async {
      await tester.pumpWidget(_host(_crud));
      await tester.pumpAndSettle();

      // 定義のタイトル・列・検索欄が、コードを書かずに出ている。
      expect(find.text('顧客マスタ'), findsWidgets);
      expect(find.text('コード'), findsWidgets);
      expect(find.byKey(const Key('hatake.filter.name')), findsOneWidget);
      expect(find.byKey(const Key('playground.problems')), findsNothing);
    });

    testWidgets('サンプルデータは定義から作られる（Repository を書かなくていい）',
        (tester) async {
      await tester.pumpWidget(_host(_crud));
      await tester.pumpAndSettle();

      // 列に対応する値が入っている（項目名から作っている）。
      expect(find.textContaining('C-1001'), findsWidgets);
      expect(find.textContaining('name 1'), findsWidgets);
    });

    testWidgets('直すとその場で変わる', (tester) async {
      await tester.pumpWidget(_host(_crud));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('playground.source')),
        _crud.replaceAll('顧客マスタ', '取引先マスタ'),
      );
      await tester.pumpAndSettle();

      expect(find.text('取引先マスタ'), findsWidgets);
      expect(find.text('顧客マスタ'), findsNothing);
    });

    testWidgets('任意キーの綴り間違いは、直し方まで出る', (tester) async {
      // 任意キーは黙って捨てられる＝画面を見ても気づけない。ここが strict の価値。
      await tester.pumpWidget(_host(_crud));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('playground.source')),
        _crud.replaceAll(
          '{ field: code, label: コード }',
          '{ field: code, label: コード, sortble: true }',
        ),
      );
      await tester.pumpAndSettle();

      final problems = find.descendant(
        of: find.byKey(const Key('playground.problems')),
        matching: find.byType(Text),
      );
      expect(
        tester.widgetList<Text>(problems).map((t) => t.data).join('\n'),
        allOf(contains('sortble'), contains('sortable の間違い')),
      );
      // 読める定義なので、画面は出たまま。
      expect(find.text('顧客マスタ'), findsWidgets);
    });

    testWidgets('必須キーの綴り間違いは、無いものと直し方の両方が出る', (tester) async {
      await tester.pumpWidget(_host(_crud));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('playground.source')),
        _crud.replaceAll('label: コード', 'lable: コード'),
      );
      await tester.pumpAndSettle();

      final problems = find.descendant(
        of: find.byKey(const Key('playground.problems')),
        matching: find.byType(Text),
      );
      final text = tester.widgetList<Text>(problems).map((t) => t.data).join('\n');
      // 解析は「label が無い」で落ちるが、それだけでは直し方が分からない。
      expect(text, contains('label'));
      expect(text, contains('lable'));
      expect(text, contains('の間違い'));
    });

    testWidgets('読めない間は、前に読めた画面を出しておく', (tester) async {
      await tester.pumpWidget(_host(_crud));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('playground.source')),
        'page: { type: crud',
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('playground.problems')), findsOneWidget);
      // 1文字打つたびに画面が消えると編集できない。
      expect(find.textContaining('前に読めた定義'), findsOneWidget);
      expect(find.text('顧客マスタ'), findsWidgets);
    });

    testWidgets('app: の定義（メニュー付き）も動く', (tester) async {
      await tester.pumpWidget(_host('''
app:
  id: sales
  title: 販売管理
  menu:
    - { id: customers, label: 顧客, page: customer_master }
  pages:
    - type: search
      id: customer_master
      title: 顧客マスタ
      repository: customerRepository
      table:
        columns: [{ field: code, label: コード }]
'''));
      await tester.pumpAndSettle();

      expect(find.text('販売管理'), findsWidgets);
      expect(find.text('顧客マスタ'), findsWidgets);
    });

    testWidgets('例を入れられる', (tester) async {
      await tester.pumpWidget(_host('page: {}', samples: {'顧客マスタ': _crud}));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('playground.samples')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('顧客マスタ').last);
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('playground.problems')), findsNothing);
      expect(find.text('コード'), findsWidgets);
    });
  });

  group('共有リンク', () {
    test('定義を URL に載せて、そこから戻せる', () {
      final url = Playground.shareUrl(
        Uri.parse('https://asil-e-hatake.github.io/hatake/demo/'),
        _crud,
      );
      expect(url.queryParameters['playground'], '1');
      expect(Playground.sourceFromUrl(url), _crud);
    });

    test('壊れたリンクは黙って既定に戻す', () {
      expect(
        Playground.sourceFromUrl(Uri.parse('https://x/?yaml=%%%not-base64')),
        isNull,
      );
      expect(Playground.sourceFromUrl(Uri.parse('https://x/')), isNull);
    });

    test('日本語が入っていても往復する', () {
      const source = 'page: { title: 顧客マスタ }';
      final url = Playground.shareUrl(Uri.parse('https://x/'), source);
      expect(Playground.sourceFromUrl(url), source);
      // URL に直接日本語を置かない（コピペで壊れるので base64）。
      expect(url.query.contains('顧客'), isFalse);
      expect(utf8.decode(base64Url.decode(url.queryParameters['yaml']!)), source);
    });
  });

  group('サンプルデータ', () {
    test('定義が名前を挙げた Repository は全部答える', () {
      final document = decodeDefinitionYaml('''
page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  form:
    sections:
      - fields:
          - field: lines
            label: 明細
            type: subTable
            columns: [{ field: productName, label: 商品 }]
            source: { repository: orderLineRepository, parentKey: orderNo }
''');
      final repositories = sampleRepositories(document);
      expect(repositories.contains('orderRepository'), isTrue);
      expect(repositories.contains('orderLineRepository'), isTrue);
    });

    test('項目名から、それらしい値を作る', () async {
      final document = decodeDefinitionYaml('''
page:
  type: search
  id: s
  title: S
  repository: r
  table:
    columns:
      - { field: orderNo, label: 受注番号 }
      - { field: amount, label: 金額 }
      - { field: orderDate, label: 受注日 }
      - { field: customer, label: 顧客 }
''');
      final result = await sampleRepositories(document)
          .resolve('r')
          .search(const RepositoryQuery());

      final row = result.items.first;
      expect(row['amount'], isA<int>());
      expect(row['orderDate'], startsWith('2026-'));
      expect(row['orderNo'], startsWith('O-'));
      expect(row['customer'], 'customer 1');
      expect(result.totalCount, 12);
    });
  });
}
