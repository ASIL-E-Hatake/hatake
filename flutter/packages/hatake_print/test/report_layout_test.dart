import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_print/hatake_print.dart';
import 'package:test/test.dart';

/// 3列（うち1列は幅の指定なし）の帳票。
ReportPageDefinition page({
  ReportDefinition report = const ReportDefinition(),
  List<ColumnDefinition>? columns,
  String title = '売上明細表',
}) {
  return ReportPageDefinition(
    id: 'sales_report',
    title: title,
    repository: 'orderRepository',
    table: TableDefinition(
      columns: columns ??
          const [
            ColumnDefinition(field: 'orderNo', label: '受注番号', width: 120),
            ColumnDefinition(field: 'customer', label: '顧客'),
            ColumnDefinition(
              field: 'amount',
              label: '金額',
              type: ColumnTypes.number,
              width: 100,
            ),
          ],
    ),
    report: report,
  );
}

List<Map<String, Object?>> rows(int count) => [
      for (var i = 1; i <= count; i++)
        {'orderNo': 'SO-$i', 'customer': '山田商事', 'amount': i * 100},
    ];

PrintLayout layoutOf(
  ReportPageDefinition definition,
  List<Map<String, Object?>> data, {
  PrintStyle style = const PrintStyle(),
  Set<String> roles = const {},
}) {
  return layoutReport(
    definition,
    buildReport(definition.report, data),
    style: style,
    roles: roles,
  );
}

Iterable<PrintText> texts(PrintPage page) => page.items.whereType<PrintText>();

void main() {
  group('紙の枚数', () {
    test('ReportSheet 1枚 = 紙1枚（分け直さない）', () {
      final definition = page(report: const ReportDefinition(rowsPerPage: 2));
      final document = buildReport(definition.report, rows(5));
      final layout = layoutReport(definition, document);

      expect(document.totalPages, 3);
      expect(layout.pages.length, 3);
      expect(layout.pages.map((p) => p.number), [1, 2, 3]);
    });

    test('行が無ければ紙も無い（空の PDF を作らない）', () {
      final layout = layoutOf(page(), const []);
      expect(layout.isEmpty, isTrue);
      expect(layout.pages, isEmpty);
    });

    test('用紙は定義どおり（横は縦横が入れ替わる）', () {
      final portrait = layoutOf(page(), rows(1));
      expect(portrait.paper.width, PrintPapers.a4.width);

      final landscape = layoutOf(
        page(
          report: const ReportDefinition(
            paper: PaperDefinition(orientation: Orientations.landscape),
          ),
        ),
        rows(1),
      );
      expect(landscape.paper.width, PrintPapers.a4.height);
      expect(landscape.paper.height, PrintPapers.a4.width);
    });
  });

  group('紙から溢れない', () {
    test('1枚に 200 行でも、最後の行が紙の中に収まる', () {
      final definition = page(report: const ReportDefinition(rowsPerPage: 200));
      final layout = layoutOf(definition, rows(200));
      const style = PrintStyle();

      expect(layout.pages.length, 1);
      final last = texts(layout.pages.first).last;
      expect(last.y, lessThanOrEqualTo(layout.paper.height - style.margin));
      // 詰めた分だけ字も小さくなる。
      expect(last.size, lessThan(style.bodySize));
    });

    test('行数が少なければ、既定の行高より広げはしない', () {
      final layout = layoutOf(page(), rows(3));
      final baselines = texts(layout.pages.first)
          .where((t) => t.text.startsWith('SO-'))
          .map((t) => t.y)
          .toList();
      expect(baselines[1] - baselines[0], const PrintStyle().rowHeight);
    });
  });

  group('列', () {
    test('幅の指定はポイント、指定の無い列が残りを分ける', () {
      final layout = layoutOf(page(), rows(1));
      final heading = texts(layout.pages.first).toList();
      final orderNo = heading.firstWhere((t) => t.text == '受注番号');
      final customer = heading.firstWhere((t) => t.text == '顧客');
      final amount = heading.firstWhere((t) => t.text == '金額');

      expect(orderNo.width, 120);
      expect(amount.width, 100);
      // A4 の紙幅 - 余白 - 固定の2列 - 列間2つ。
      const usable = 595.28 - 36 * 2;
      expect(customer.width, closeTo(usable - 120 - 100 - 6 * 2, 0.01));
      // 左端から順に並ぶ。
      expect(orderNo.x, 36);
      expect(customer.x, closeTo(36 + 120 + 6, 0.01));
    });

    test('幅の合計が紙より広い定義は、全体を縮めて収める', () {
      final layout = layoutOf(
        page(
          columns: const [
            ColumnDefinition(field: 'a', label: 'あ', width: 400),
            ColumnDefinition(field: 'b', label: 'い', width: 400),
          ],
        ),
        [
          {'a': '1', 'b': '2'}
        ],
      );
      final heading = texts(layout.pages.first).toList();
      final a = heading.firstWhere((t) => t.text == 'あ');
      final b = heading.firstWhere((t) => t.text == 'い');

      expect(a.width, lessThan(400));
      expect(a.width, b.width);
      // 右端が紙の余白を超えない。
      expect(b.x + b.width, lessThanOrEqualTo(595.28 - 36 + 0.01));
    });

    test('数の列は右寄せ、それ以外は左寄せ', () {
      final layout = layoutOf(page(), rows(1));
      final cells = texts(layout.pages.first).toList();
      expect(cells.firstWhere((t) => t.text == '金額').align, PrintAligns.right);
      expect(cells.firstWhere((t) => t.text == '100').align, PrintAligns.right);
      expect(cells.firstWhere((t) => t.text == 'SO-1').align, PrintAligns.left);
    });

    test('見えない列は刷らない（画面で隠した列が紙で漏れない）', () {
      final definition = page(
        columns: const [
          ColumnDefinition(field: 'orderNo', label: '受注番号'),
          ColumnDefinition(field: 'cost', label: '原価', roles: ['manager']),
        ],
      );
      final data = [
        {'orderNo': 'SO-1', 'cost': 12345}
      ];

      final staff = layoutOf(definition, data, roles: {'staff'});
      expect(texts(staff.pages.first).map((t) => t.text), isNot(contains('原価')));
      expect(
        texts(staff.pages.first).map((t) => t.text),
        isNot(contains('12345')),
      );

      final manager = layoutOf(definition, data, roles: {'manager'});
      expect(texts(manager.pages.first).map((t) => t.text), contains('原価'));
      expect(texts(manager.pages.first).map((t) => t.text), contains('12345'));
    });

    test('列に収まらない文字は切って … にする（隣の列に重ねない）', () {
      final layout = layoutOf(
        page(
          columns: const [
            ColumnDefinition(field: 'note', label: '備考', width: 60),
          ],
        ),
        [
          {'note': 'とても長い備考がここに入っていて列には収まらない'}
        ],
      );
      final cell = texts(layout.pages.first).last;
      expect(cell.text, endsWith('…'));
      expect(textWidth(cell.text, cell.size), lessThanOrEqualTo(60));
    });
  });

  group('書式', () {
    test('列の format は画面と同じものが使われる', () {
      final layout = layoutOf(
        page(
          columns: const [
            ColumnDefinition(
              field: 'amount',
              label: '金額',
              type: ColumnTypes.number,
              format: 'currency',
              config: {'symbol': '¥'},
            ),
          ],
        ),
        [
          {'amount': 1234567}
        ],
      );
      expect(
        texts(layout.pages.first).map((t) => t.text),
        contains('¥1,234,567'),
      );
    });
  });

  group('グループと合計', () {
    final definition = page(
      report: const ReportDefinition(
        rowsPerPage: 30,
        groups: [ReportGroup(field: 'customer', label: '顧客')],
        totals: [
          ReportTotal(field: 'amount'),
          ReportTotal(field: 'amount', aggregate: AggregateOps.count),
        ],
      ),
    );
    final data = [
      {'orderNo': 'SO-1', 'customer': '山田商事', 'amount': 100},
      {'orderNo': 'SO-2', 'customer': '佐藤物産', 'amount': 250},
    ];

    test('グループ見出しは行いっぱいに1つ', () {
      final layout = layoutOf(definition, data);
      final heading = texts(layout.pages.first)
          .firstWhere((t) => t.text.startsWith('顧客: '));
      expect(heading.text, '顧客: 山田商事');
      expect(heading.bold, isTrue);
      expect(heading.width, closeTo(595.28 - 36 * 2, 0.01));
    });

    test('内側のグループは字下げする', () {
      final nested = page(
        report: const ReportDefinition(
          groups: [
            ReportGroup(field: 'area', label: '地区'),
            ReportGroup(field: 'customer', label: '顧客'),
          ],
        ),
      );
      final layout = layoutOf(nested, [
        {'area': '東京', 'customer': '山田商事', 'orderNo': 'SO-1', 'amount': 1}
      ]);
      final headings = texts(layout.pages.first)
          .where((t) => t.text.contains(': '))
          .toList();
      expect(headings[0].text, '地区: 東京');
      expect(headings[1].text, '顧客: 山田商事');
      expect(headings[1].x, greaterThan(headings[0].x));
    });

    test('小計・総計は1列目が見出し、数字は自分の列の下', () {
      final layout = layoutOf(definition, data);
      final cells = texts(layout.pages.first).toList();
      final amountHeading = cells.firstWhere((t) => t.text == '金額');

      final subtotal = cells.firstWhere((t) => t.text == '小計');
      expect(subtotal.x, 36);
      // 同じ列に sum と count があれば並べる（件数は書式を通さない）。
      final sums = cells.where((t) => t.text == '100 / 1 件').toList();
      expect(sums, hasLength(1));
      expect(sums.first.x, amountHeading.x);

      expect(cells.map((t) => t.text), contains('合計'));
      expect(cells.map((t) => t.text), contains('350 / 2 件'));
    });

    test('総計の上は二重線', () {
      final layout = layoutOf(definition, data);
      final rules = layout.pages.first.items.whereType<PrintRule>().toList();
      final grandTotal =
          texts(layout.pages.first).firstWhere((t) => t.text == '合計');
      // 総計の行の上に、近い位置で2本。
      final above = rules
          .where((r) => r.y < grandTotal.y && r.y > grandTotal.y - 12)
          .toList();
      expect(above, hasLength(2));
      expect(above[1].y - above[0].y, closeTo(1.6, 0.01));
    });
  });

  group('ヘッダとフッタ', () {
    test('表題とページ番号はどの紙にも出る', () {
      final definition = page(report: const ReportDefinition(rowsPerPage: 1));
      final layout = layoutOf(definition, rows(2));

      for (final sheet in layout.pages) {
        expect(texts(sheet).map((t) => t.text), contains('売上明細表'));
      }
      expect(texts(layout.pages[0]).map((t) => t.text), contains('1 / 2'));
      expect(texts(layout.pages[1]).map((t) => t.text), contains('2 / 2'));
      // ページ番号は右端。
      final number =
          texts(layout.pages[0]).firstWhere((t) => t.text == '1 / 2');
      expect(number.align, PrintAligns.right);
    });

    test('ページ番号は消せる', () {
      final layout =
          layoutOf(page(), rows(1), style: const PrintStyle(pageNumber: ''));
      expect(
        texts(layout.pages.first).map((t) => t.text),
        isNot(contains('1 / 1')),
      );
    });

    test('脚注は {page} / {pages} が埋まり、本文より下に出る', () {
      final definition = page(report: const ReportDefinition(rowsPerPage: 1));
      final layout = layoutOf(
        definition,
        rows(2),
        style: const PrintStyle(footer: '営業部 - {page}/{pages} 枚'),
      );
      final footer = texts(layout.pages[1])
          .firstWhere((t) => t.text.startsWith('営業部'));
      expect(footer.text, '営業部 - 2/2 枚');
      expect(footer.y, greaterThan(layout.paper.height - 36));
      expect(footer.y, lessThan(layout.paper.height));
    });

    test('小計・総計・件数の言葉は差し替えられる', () {
      final definition = page(
        report: const ReportDefinition(
          groups: [ReportGroup(field: 'customer', label: '顧客')],
          totals: [ReportTotal(field: 'amount', aggregate: AggregateOps.count)],
        ),
      );
      final layout = layoutOf(
        definition,
        rows(1),
        style: const PrintStyle(
          subtotalLabel: 'Subtotal',
          grandTotalLabel: 'Total',
          countSuffix: 'items',
        ),
      );
      final words = texts(layout.pages.first).map((t) => t.text);
      expect(words, contains('Subtotal'));
      expect(words, contains('Total'));
      expect(words, contains('1 items'));
    });
  });
}
