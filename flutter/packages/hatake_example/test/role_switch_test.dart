import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_example/main.dart';
import 'package:hatake_example/role_switcher.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

/// デモで役割を切り替える。
///
/// 権限は**見えないことが正しい**機能なので、切り替えて見せないと伝わらない。そして
/// 「切り替えたのに何も変わらない」ことは、画面を見ても気づけない（出ていない列が、
/// 隠れているのか書き忘れなのか分からない）。だから試験で縛る。
///
/// **1つの試験の中で切り替えていく**（アプリを何度も出し直さない）。デモのアプリを
/// 同じ試験ファイルで2回出すと、2回目の `pumpWidget` が返ってこない（原因未特定。
/// ロードマップの「道具の信頼」に残した）。切り替えて戻すところまで1本で見るのは、
/// 試験としてもそのほうが強い。
Future<void> _switchTo(WidgetTester tester, String id) async {
  await tester.tap(find.byKey(const Key('demo.roleSwitcher')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(Key('demo.role.$id')));
  await tester.pumpAndSettle();
}

String _who(WidgetTester tester) =>
    tester.widget<Text>(find.byKey(const Key('demo.roleSwitcher.label'))).data!;

void main() {
  testWidgets('役割を切り替えると、隠れる列と出ないボタンが変わる', (tester) async {
    final yaml = await rootBundle.loadString('assets/sales_app.yaml');
    await tester.pumpWidget(
      HatakeExampleApp(
        definition: parseAppYaml(yaml, strict: true),
        source: yaml,
      ),
    );
    await tester.pumpAndSettle();

    // 既定は担当。デモを開いた人が普通に触れる状態から始める（誰でもない状態で
    // 始めると、見えるものが減った画面を最初に見せてしまう）。
    expect(_who(tester), '見ている人: 担当');
    // 承認者だけの入口は、メニューに出ていない。
    expect(find.byKey(const Key('hatake.menu.costs')), findsNothing);

    await tester.tap(find.byKey(const Key('hatake.menu.orders')));
    await tester.pumpAndSettle();
    expect(find.text('SO-1001'), findsOneWidget);

    // 担当に見えないもの: 粗利の列と、却下のボタン。
    expect(find.text('粗利'), findsNothing);
    expect(find.byKey(const Key('hatake.action.rejectSelected')), findsNothing);
    // 見えるもの: 持ち出し（ログインした人だけ）。
    expect(find.byKey(const Key('hatake.action.csv')), findsOneWidget);

    // ── 承認者にする ────────────────────────────────────────────────
    await _switchTo(tester, 'manager');

    expect(_who(tester), '見ている人: 承認者');
    // 開いている画面はそのまま（切り替えるたびに入口へ戻ると、何が変わったのかを
    // 見比べられない）。
    expect(find.text('SO-1001'), findsOneWidget);
    expect(find.text('粗利'), findsOneWidget);
    expect(
      find.byKey(const Key('hatake.action.rejectSelected')),
      findsOneWidget,
    );
    expect(find.byKey(const Key('hatake.menu.costs')), findsOneWidget);
    // 承認者は担当の仕事もできる（役割は足し算）＝持ち出しは消えない。
    expect(find.byKey(const Key('hatake.action.csv')), findsOneWidget);

    // ── 誰でもない（未ログイン）にする ──────────────────────────────
    await _switchTo(tester, 'anon');

    expect(_who(tester), '見ている人: 誰でもない（未ログイン）');
    // 持ち出しは出ない。読むことは誰でもできる、が定義に書いてある。
    expect(find.byKey(const Key('hatake.action.csv')), findsNothing);
    expect(find.text('SO-1001'), findsOneWidget);
    expect(find.text('粗利'), findsNothing);

    // ── 担当に戻す（戻せることも確かめる） ────────────────────────────
    await _switchTo(tester, 'staff');

    expect(_who(tester), '見ている人: 担当');
    expect(find.byKey(const Key('hatake.action.csv')), findsOneWidget);
  });

  test('札が配る役割は、アプリが宣言した語彙の中にある', () {
    // 語彙に無い役割を配ると、画面は出るのに誰にも見えない所ができる
    // （`HatakeScope` の assert が落とすが、札の側でも縛る）。
    const known = {'staff', 'manager'};
    for (final one in demoRoles) {
      expect(known.containsAll(one.roles), isTrue, reason: one.id);
    }
  });

  test('札の言葉は、役割の識別子そのままではない', () {
    // `manager` を画面にそのまま出しても業務の人には読めない。定義に画面の言葉を
    // 書く場所はまだ無いので（ロードマップの「役割に画面の言葉を付ける」）、
    // デモ側に持っている。
    for (final one in demoRoles) {
      expect(one.label, isNotEmpty);
      expect(one.roles.contains(one.label), isFalse);
      expect(one.note, isNotEmpty);
    }
  });
}
