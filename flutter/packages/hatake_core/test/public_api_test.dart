import 'dart:convert';
import 'dart:io';

import 'package:analyzer/dart/analysis/utilities.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

/// **配る Dart パッケージの公開面が、気づかないうちに広がっていないか。**
///
/// [1.0 の約束](../../../../docs/compat.ja.md) は3版に掛かっているが、面を固めて
/// 見張る仕掛けは TypeScript にしか無かった（0.9.14）。Dart は
/// 「`export` した分だけが約束」と書いてあるだけなので、**`src/` の中に
/// class を1つ足して `export` すれば、約束が1つ増える**。しかも誰も気づけない。
/// 分ける前の TypeScript とまったく同じ形（`export *` で 8日に 2つ増えていた）。
///
/// この試験は**是非を判定しない**（何を約束すべきかは人が決める）。やるのは1つで、
/// **約束の面が変わったら必ず目に入る**ようにすること。
///
/// 台帳を書き直すとき（名前を足す・消すと決めたとき）:
///
/// ```
/// HATAKE_WRITE_PUBLIC_API=1 dart test test/public_api_test.dart
/// ```
///
/// **この試験がリポジトリ全部を見るのに hatake_core に置いてあるのは**、
/// CI の Pure-Dart の段でいちばん先に回るのがここだから（Flutter の版も
/// 字を読んで解析するだけなので、Flutter は要らない）。
///
/// 見ているのは**名前**で、形（引数・戻り値）ではない。形は conformance が縛る。
void main() {
  // 配るもの全部。`hatake_example` はデモなので約束しない。
  const packages = <String>[
    'hatake',
    'hatake_core',
    'hatake_dsl',
    'hatake_encoding',
    'hatake_http',
    'hatake_material',
    'hatake_print',
    'hatake_test',
    'hatake_yaml',
  ];

  final root = p.normalize(p.join(Directory.current.path, '..', '..', '..'));
  final ledger = File(p.join(root, 'spec', 'public-api.dart.json'));

  test('配る Dart パッケージの公開面が、台帳と完全に一致する', () {
    final found = <String, List<String>>{};
    for (final name in packages) {
      final entry = File(p.join(root, 'flutter', 'packages', name, 'lib', '$name.dart'));
      expect(entry.existsSync(), isTrue, reason: '${entry.path} が在りません');
      found[name] = publicNamesOf(entry).toList()..sort();
    }

    final total = found.values.fold<int>(0, (sum, one) => sum + one.length);

    if (Platform.environment['HATAKE_WRITE_PUBLIC_API'] != null) {
      ledger.writeAsStringSync('${const JsonEncoder.withIndent('  ').convert({
            r'$comment': '**約束する面**（Dart）。1.0 のあとは、ここから消さない・'
                '名前を変えない・形を変えない。数えているのは配るパッケージの公開'
                'エントリ（lib/<名前>.dart）から辿れる名前で、hatake_example は'
                '入れていない（デモなので約束しない）。作り直し方は '
                'flutter/packages/hatake_core/test/public_api_test.dart の頭。',
            'count': total,
            'packages': found,
          })}\n');
      return;
    }

    expect(ledger.existsSync(), isTrue,
        reason: '${ledger.path} が在りません（HATAKE_WRITE_PUBLIC_API=1 で作れます）');
    final committed = jsonDecode(ledger.readAsStringSync()) as Map<String, dynamic>;
    final promised = (committed['packages'] as Map<String, dynamic>)
        .map((key, value) => MapEntry(key, (value as List).cast<String>()));

    // パッケージごとに比べる（丸ごと比べると、どこが増えたのか読めない）。
    for (final name in packages) {
      expect(found[name], promised[name],
          reason: '$name の公開面が台帳と違います。足すと決めたなら '
              'HATAKE_WRITE_PUBLIC_API=1 で台帳を書き直してください');
    }
    expect(committed['count'], total, reason: '台帳の count が中身と合っていません');

    // **数えられていること自体**も見る（解析が空振りしたら、この試験は黙って通る）。
    expect(total, greaterThan(100));
  });
}

/// 公開エントリから辿れる公開の名前を全部集める。
///
/// 追うのは3つ:
///   ・`export '…'`  … 再公開。`show` / `hide` も効かせる
///   ・`part '…'`    … **同じライブラリの続き**なので、そこの宣言も公開面に入る
///   ・その場の宣言
///
/// 字を読むだけ（構文解析のみ・型は解決しない）。`part` を自分で数えないと
/// hatake_material の Renderer が丸ごと抜ける（1枚を part で割ってあるため）。
Set<String> publicNamesOf(File entry, {Set<String>? seen}) {
  seen ??= <String>{};
  final path = p.normalize(entry.path);
  if (!seen.add(path) || !entry.existsSync()) return <String>{};

  final unit = parseString(content: entry.readAsStringSync(), throwIfDiagnostics: false).unit;
  final names = <String>{};

  for (final one in unit.directives) {
    if (one is ExportDirective) {
      final uri = one.uri.stringValue;
      if (uri == null || uri.startsWith('dart:') || uri.startsWith('package:')) continue;
      final from = File(p.normalize(p.join(p.dirname(path), uri)));
      var taken = publicNamesOf(from, seen: seen);
      for (final combinator in one.combinators) {
        if (combinator is ShowCombinator) {
          final shown = combinator.shownNames.map((n) => n.name).toSet();
          taken = taken.where(shown.contains).toSet();
        } else if (combinator is HideCombinator) {
          final hidden = combinator.hiddenNames.map((n) => n.name).toSet();
          taken = taken.where((n) => !hidden.contains(n)).toSet();
        }
      }
      names.addAll(taken);
    } else if (one is PartDirective) {
      final uri = one.uri.stringValue;
      if (uri == null) continue;
      names.addAll(publicNamesOf(File(p.normalize(p.join(p.dirname(path), uri))), seen: seen));
    }
  }

  for (final one in unit.declarations) {
    names.addAll(declaredNames(one));
  }
  return names..removeWhere((one) => one.startsWith('_'));
}

/// トップレベルの宣言が名乗る名前（無名の extension は名前が無いので出ない）。
Iterable<String> declaredNames(CompilationUnitMember one) sync* {
  if (one is NamedCompilationUnitMember) {
    yield one.name.lexeme;
  } else if (one is TopLevelVariableDeclaration) {
    for (final each in one.variables.variables) {
      yield each.name.lexeme;
    }
  }
}
