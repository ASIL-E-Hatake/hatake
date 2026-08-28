import 'package:flutter_test/flutter_test.dart';
import 'package:hatake/hatake.dart';

/// 並べて開く（`app.navigation: tabs`）ときの、開き方の決めごと。
///
/// ここで守るのは5つ。**既定はいままで通り**（`single` なら1本のスタック＝タブの話は
/// 何も起きない）・**同じ画面は2枚開かない**（ページ id ＋ params が同じなら前に出す）・
/// **params が違えば別のタブ**（受注 SO-1 と SO-2 は別物）・**上限に達したら開かない**
/// （古いタブを勝手に閉じない）・**最後の1枚は閉じられない**（画面が無くなる）。
void main() {
  group('single（既定）', () {
    test('メニューは入れ替え、遷移は重なる（いままでの動き）', () {
      final router = HatakeRouter(const AppRoute('a'));
      expect(router.tabsOpen, isFalse);
      expect(router.tabCount, 1);

      router.select('b');
      expect(router.current.pageId, 'b');
      expect(router.canPop, isFalse); // 入れ替えたので戻る先は無い
      expect(router.tabCount, 1);

      router.navigate('c');
      expect(router.current.pageId, 'c');
      expect(router.canPop, isTrue); // 重なったので戻れる
      expect(router.tabCount, 1);
    });

    test('open: tab は無視される（並べる場所が無い）', () {
      final router = HatakeRouter(const AppRoute('a'));
      router.navigate('b', newTab: true);
      expect(router.tabCount, 1);
      expect(router.current.pageId, 'b');
      expect(router.canPop, isTrue); // 重なっただけ
    });
  });

  group('tabs', () {
    HatakeRouter tabs() => HatakeRouter(
          const AppRoute('a'),
          navigation: AppNavigation.tabs,
        );

    test('メニューで選ぶと新しいタブ。同じ画面をもう一度選んでも増えない', () {
      final router = tabs();
      router.select('b');
      expect(router.tabCount, 2);
      expect(router.frontTab, 1);
      expect(router.current.pageId, 'b');

      // 1枚目に戻る（増やさない）。
      router.select('a');
      expect(router.tabCount, 2);
      expect(router.frontTab, 0);
      expect(router.current.pageId, 'a');
    });

    test('params が違えば別のタブ（同じ画面の別のレコード）', () {
      final router = tabs();
      router.navigate('detail', params: {'id': 'SO-1'}, newTab: true);
      router.navigate('detail', params: {'id': 'SO-2'}, newTab: true);
      expect(router.tabCount, 3);
      // 同じ SO-1 をもう一度開いたら、開いているタブが前に出る。
      router.navigate('detail', params: {'id': 'SO-1'}, newTab: true);
      expect(router.tabCount, 3);
      expect(router.current.params['id'], 'SO-1');
    });

    test('遷移の既定は同じタブの中で進む（戻れる）', () {
      final router = tabs();
      router.navigate('b');
      expect(router.tabCount, 1);
      expect(router.canPop, isTrue);
      router.pop();
      expect(router.current.pageId, 'a');
    });

    test('タブごとにスタックが別（片方で進んでも、もう片方は動かない）', () {
      final router = tabs();
      router.select('b');
      router.navigate('b_detail'); // 2枚目の中で進む
      expect(router.depth, 2);

      router.selectTab(0);
      expect(router.current.pageId, 'a');
      expect(router.depth, 1); // 1枚目は進んでいない

      router.selectTab(1);
      expect(router.current.pageId, 'b_detail');
      expect(router.depth, 2);
    });

    test('上限に達したら開かない（勝手に閉じない）', () {
      final router = tabs();
      for (var i = 1; i < HatakeRouter.maxTabs; i++) {
        expect(router.select('p$i'), isTrue);
      }
      expect(router.tabCount, HatakeRouter.maxTabs);
      // ここから先は**開かずに false**。開いているタブはそのまま。
      expect(router.select('over'), isFalse);
      expect(router.tabCount, HatakeRouter.maxTabs);
      expect(router.current.pageId, 'p${HatakeRouter.maxTabs - 1}');
      // 既に開いているものは、上限に達していても前に出せる。
      expect(router.select('p1'), isTrue);
      expect(router.current.pageId, 'p1');
    });

    test('閉じると隣が前に出る。最後の1枚は閉じられない', () {
      final router = tabs();
      router.select('b');
      router.select('c');
      expect(router.frontTab, 2);

      expect(router.closeTab(2), isTrue);
      expect(router.tabCount, 2);
      expect(router.current.pageId, 'b'); // 左が前に出る

      expect(router.closeTab(0), isTrue);
      expect(router.tabCount, 1);
      expect(router.current.pageId, 'b'); // 前面は付いて回る

      expect(router.closeTab(0), isFalse); // 画面が無くなるので閉じない
      expect(router.tabCount, 1);
    });

    test('タブの id は閉じても詰めない（中身が付いて回る）', () {
      final router = tabs();
      router.select('b');
      router.select('c');
      final before = router.tabs.map((t) => t.id).toList();
      router.closeTab(1); // 真ん中を閉じる
      final after = router.tabs.map((t) => t.id).toList();
      expect(after, [before.first, before.last]);
    });
  });
}
