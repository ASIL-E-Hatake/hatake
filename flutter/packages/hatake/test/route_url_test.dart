import 'package:flutter_test/flutter_test.dart';
import 'package:hatake/hatake.dart';

/// A screen and its URL, both ways.
///
/// The point of these tests: a link to a screen keeps working (the URL is a flat
/// `/pageId` + params), and a URL that does not name a screen of *this* app is
/// answered with null rather than a blank page.
void main() {
  group('画面 → URL', () {
    test('画面 id が道、params が問い合わせ', () {
      expect(
        routeToUri(const AppRoute('order_detail', params: {'orderNo': 'SO-1'})),
        Uri.parse('/order_detail?orderNo=SO-1'),
      );
    });

    test('params が無ければ ? も付けない', () {
      expect(routeToUri(const AppRoute('dashboard')), Uri.parse('/dashboard'));
    });

    test('null の param は落とす（空文字と区別できないので送らない）', () {
      expect(
        routeToUri(const AppRoute('x', params: {'a': null, 'b': 1})),
        Uri.parse('/x?b=1'),
      );
    });

    test('日本語や記号は URL として書ける形になる', () {
      final uri = routeToUri(
        const AppRoute('customer_detail', params: {'name': '山田 商事'}),
      );
      expect(uri.queryParameters['name'], '山田 商事');
      expect(uri.toString(), contains('%E5%B1%B1')); // 生の日本語は入らない
    });
  });

  group('URL → 画面', () {
    test('往復して同じものになる', () {
      const route = AppRoute('order_detail', params: {'orderNo': 'SO-1001'});
      final back = routeFromUri(routeToUri(route))!;
      expect(back.pageId, route.pageId);
      expect(back.params, route.params);
    });

    test('数は文字で戻る（URL に型は無い。0012 を 12 にしない）', () {
      final route = routeFromUri(Uri.parse('/customer_detail?code=0012'))!;
      expect(route.params['code'], '0012');
    });

    test('知らない画面は null（開く先は呼び出し側が決める）', () {
      bool knows(String id) => id == 'dashboard';
      expect(routeFromUri(Uri.parse('/dashboard'), knows: knows), isNotNull);
      expect(routeFromUri(Uri.parse('/nope'), knows: knows), isNull);
    });

    test('入口（/）と深い道は null', () {
      expect(routeFromUri(Uri.parse('/')), isNull);
      expect(routeFromUri(Uri.parse('/a/b')), isNull);
    });
  });
}
