/// hatake_test — 画面の試験を**定義の言葉で**書くための道具。
///
/// 画面の試験は今までも書けた（枠組み自身の試験はそう書いてある）。けれど
/// **キーの規約が公開された契約ではなかった**ので、書く人は Renderer の中を読み解いて
/// から書くことになっていた（AI は当てずっぽうになる）。それをここで配る。
///
/// ```dart
/// import 'package:flutter_test/flutter_test.dart';
/// import 'package:hatake_test/hatake_test.dart';
///
/// testWidgets('一覧から編集を開いて保存できる', (tester) async {
///   final page = await pumpPage(tester, yaml, rows: [
///     {'id': 1, 'code': 'SO-1'},
///   ]);
///   await tester.tap(HatakeFind.edit(1));
///   await tester.pumpAndSettle();
///   await tester.enterText(HatakeFind.field('code'), 'SO-9');
///   await tester.tap(HatakeFind.formSave);
///   await tester.pumpAndSettle();
///   expect(page.repository.calls, contains('update(1)'));
/// });
/// ```
///
/// 3つだけ:
///
/// * [pumpPage] … 定義をそのまま画面に出す（積み方を間違えない）
/// * [HatakeFind] … 押す・入れる相手を定義の言葉で探す（規約は [HatakeKeys]）
/// * [FakeRepository] … 行を持ち、**聞かれたことを覚えている**偽物
///
/// 値の計算や検証だけを確かめたいなら、画面を出さずに `ScenarioRunner`
/// （`hatake_core`）のほうが速い。画面を出すのは「押せるか・出ているか・保存に
/// 行ったか」を見るときだけでよい。
library;

export 'package:hatake_material/hatake_material.dart';

export 'src/fake_repository.dart';
export 'src/finders.dart';
export 'src/pump_page.dart';
