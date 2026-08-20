import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_print/hatake_print.dart';
import 'package:test/test.dart';

void main() {
  group('文字の幅', () {
    test('半角は ASCII と半角形だけ、あとは全角', () {
      expect(emWidth('あ'), 1.0);
      expect(emWidth('A'), 0.5);
      expect(emWidth('売上明細表'), 5.0);
      expect(emWidth('SO-1001'), 3.5);
      // 全角の記号・全角英数。
      expect(emWidth('￥Ａ、'), 3.0);
      // 半角カナは半角。
      expect(emWidth('ｶﾀｶﾅ'), 2.0);
    });

    test('半角に見えて全角に組まれる文字（実機で確かめた組）', () {
      // 円記号・節記号・度・プラスマイナス・丸数字・度C は、日本語フォントでは
      // 全角で組まれる。半角と数えると次の文字に重なる。
      for (final char in ['¥', '§', '°', '±', '×', '①', '℃', '−']) {
        expect(emWidth(char), 1.0, reason: char);
      }
      // 金額は「全角の記号 + 半角の数字7つ」。
      expect(emWidth('¥128,000'), 4.5);
    });

    test('数字はすべて同じ幅（金額の右端が揃う理由）', () {
      expect(emWidth('1,234'), emWidth('9,876'));
      expect(textWidth('100', 10), 15.0);
    });

    test('空文字は 0', () {
      expect(emWidth(''), 0.0);
    });
  });

  group('列に収める', () {
    test('収まるものはそのまま', () {
      expect(clipToWidth('あい', 10, 20), 'あい');
    });

    test('溢れたら切って … を付ける', () {
      // … も全角なので、25pt には「1文字 + …」しか入らない。
      final clipped = clipToWidth('あいうえお', 10, 25);
      expect(clipped, 'あ…');
      expect(textWidth(clipped, 10), lessThanOrEqualTo(25));
    });

    test('… すら入らない幅なら … だけ', () {
      expect(clipToWidth('あいうえお', 10, 5), '…');
    });

    test('幅が無ければ空', () {
      expect(clipToWidth('あ', 10, 0), '');
    });
  });

  group('用紙の実寸', () {
    test('組み込みの紙（ポイント）', () {
      expect(paperOf(const PaperDefinition()).width, 595.28);
      expect(paperOf(const PaperDefinition()).height, 841.89);
      expect(paperOf(const PaperDefinition(size: PaperSizes.letter)).width, 612);
      expect(paperOf(const PaperDefinition(size: PaperSizes.b5)).height, 728.5);
    });

    test('横は縦横が入れ替わる', () {
      final landscape = paperOf(const PaperDefinition(
        size: PaperSizes.a3,
        orientation: Orientations.landscape,
      ));
      expect(landscape.width, PrintPapers.a3.height);
      expect(landscape.height, PrintPapers.a3.width);
    });

    test('知らない紙は A4 として刷る（刷らないより、いちばん多い紙で刷る）', () {
      expect(paperOf(const PaperDefinition(size: 'ハトロン判')).width, 595.28);
    });
  });
}
