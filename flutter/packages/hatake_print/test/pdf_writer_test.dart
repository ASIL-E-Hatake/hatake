import 'dart:convert';
import 'dart:typed_data';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_print/hatake_print.dart';
import 'package:test/test.dart';

ReportPageDefinition page({String title = '売上明細表'}) =>
    ReportPageDefinition(
      id: 'sales_report',
      title: title,
      repository: 'orderRepository',
      table: const TableDefinition(
        columns: [
          ColumnDefinition(field: 'orderNo', label: '受注番号'),
          ColumnDefinition(
            field: 'amount',
            label: '金額',
            type: ColumnTypes.number,
          ),
        ],
      ),
      report: const ReportDefinition(rowsPerPage: 2),
    );

const List<Map<String, Object?>> rows = [
  {'orderNo': 'SO-1', 'amount': 100},
  {'orderNo': 'SO-2', 'amount': 200},
  {'orderNo': 'SO-3', 'amount': 300},
];

/// PDF は（圧縮していないので）そのまま読める。
String asText(Uint8List bytes) => latin1.decode(bytes);

void main() {
  final bytes = reportPdf(page(), rows);
  final text = asText(bytes);

  group('PDF として成り立っている', () {
    test('版と、バイナリを含む印から始まる', () {
      expect(text, startsWith('%PDF-1.7\n%'));
      expect(bytes.sublist(10, 14), [0xE2, 0xE3, 0xCF, 0xD3]);
    });

    test('%%EOF で終わる', () {
      expect(text.trimRight(), endsWith('%%EOF'));
    });

    test('相互参照表のバイト位置が、実際の object の位置と合っている', () {
      // ここがずれた PDF は、ビューアが「壊れている」と言う。作った直後に
      // 自分で確かめられる唯一の構造。
      final startxref =
          int.parse(RegExp(r'startxref\n(\d+)').firstMatch(text)!.group(1)!);
      expect(text.substring(startxref, startxref + 4), 'xref');

      final table = text.substring(startxref);
      final entries = RegExp(r'^(\d{10}) 00000 n $', multiLine: true)
          .allMatches(table)
          .map((m) => int.parse(m.group(1)!))
          .toList();
      expect(entries, isNotEmpty);
      for (var i = 0; i < entries.length; i++) {
        expect(
          text.substring(entries[i], entries[i] + '${i + 1} 0 obj'.length),
          '${i + 1} 0 obj',
          reason: 'object ${i + 1} の位置',
        );
      }
      // 表の大きさが object の数と合っている。
      expect(text, contains('/Size ${entries.length + 1}'));
    });

    test('紙の数と MediaBox が定義どおり', () {
      expect(text, contains('/Count 2'));
      expect(text, contains('/MediaBox [0 0 595.28 841.89]'));
      expect(RegExp(r'/Type /Page[^s]').allMatches(text), hasLength(2));
    });

    test('宣言した長さと、実際の内容の長さが合っている', () {
      for (final match
          in RegExp(r'<< /Length (\d+) >>\nstream\n').allMatches(text)) {
        final declared = int.parse(match.group(1)!);
        final start = match.end;
        expect(text.substring(start + declared, start + declared + 10),
            '\nendstream');
      }
    });
  });

  group('日本語', () {
    test('本文は UTF-16BE の16進で書く（売上明細表）', () {
      expect(text, contains('<58F24E0A660E7D308868> Tj'));
    });

    test('非埋め込みの CID フォントを名前で指定する', () {
      expect(text, contains('/Subtype /Type0'));
      expect(text, contains('/BaseFont /GothicBBB-Medium'));
      expect(text, contains('/Encoding /UniJIS-UCS2-H'));
      expect(text, contains('/Ordering (Japan1)'));
      // 英数の字送りは半角（[emWidth] の数え方と揃える）。
      expect(text, contains('/DW 1000 /W [1 94 500 231 632 500]'));
    });

    test('生の UTF-8 は1バイトも出さない', () {
      // 16進で書いているので、先頭の印以外はすべて ASCII になる。
      final stray = <int>[];
      for (var i = 14; i < bytes.length; i++) {
        if (bytes[i] > 0x7F) stray.add(bytes[i]);
      }
      expect(stray, isEmpty);
    });

    test('ビューアのタブに出る題には BOM を付ける', () {
      expect(text, contains('/Title <FEFF58F24E0A660E7D308868>'));
    });

    test('英数だけのフォントを選ぶと、そのまま括弧で書く', () {
      final latin = asText(reportPdf(page(title: 'Sales'), rows,
          font: PdfFont.helvetica));
      expect(latin, contains('/Subtype /Type1'));
      expect(latin, contains('/BaseFont /Helvetica'));
      expect(latin, contains('(SO-1) Tj'));
      // 書けない文字は消さずに ? にする。
      final japanese = asText(reportPdf(page(), rows, font: PdfFont.helvetica));
      expect(japanese, contains('(?????) Tj'));
    });
  });

  group('描画', () {
    test('表題は縁取りで太らせる（標準の日本語フォントに太字は無い）', () {
      expect(text, contains('2 Tr'));
    });

    test('罫線は細い長方形の塗り', () {
      expect(text, contains(' re f'));
    });

    test('y は上下が反転する（PDF は左下原点）', () {
      // 表題のベースラインは上から 48pt = 下から 841.89 - 48。
      expect(text, contains('1 0 0 1 36 793.89 Tm'));
    });
  });

  group('毎回同じバイト列', () {
    test('同じ定義と同じ行なら、1バイトも変わらない', () {
      expect(reportPdf(page(), rows), reportPdf(page(), rows));
    });

    test('日付を勝手に入れない（入れる人が footer に渡す）', () {
      expect(text, isNot(contains('/CreationDate')));
      expect(text, contains('/Producer (hatake_print)'));
    });
  });

  test('紙が0枚なら投げる（0枚の PDF は PDF ではない）', () {
    final empty = layoutReport(page(), ReportDocument.empty);
    expect(() => writePdf(empty), throwsArgumentError);
  });
}
