import 'dart:convert';

import '../widgets/hatake_scope.dart';

/// 「登録済みのもの」の種類。`hatake-registry.json` のキーであり、
/// TypeScript 版の `RefKinds`（`hatake refs` / `hatake validate --registry`）と同じ語彙。
///
/// 一致していることは `spec/conformance/registry_snapshot.json` で両版から確認する。
abstract final class RegistryKinds {
  static const repositories = 'repositories';
  static const plugins = 'plugins';

  /// 出力先（`exportSink` / `printSink`）。名前と値の対応表ではなく**在るか無いか**
  /// なので、申告に出るのは登録した口の名前そのもの。
  static const sinks = 'sinks';
  static const validators = 'validators';
  static const formatters = 'formatters';
  static const converters = 'converters';
  static const computedOps = 'computedOps';
  static const aggregates = 'aggregates';
  static const fieldTypes = 'fieldTypes';
  static const dashboardItemTypes = 'dashboardItemTypes';
}

/// 自分が持っている登録を申告できる、という印。
///
/// Renderer やプラグインは、独自に受け取った登録（`fieldBuilders` など）を
/// [registeredNames] で名乗れる。**実装は任意**（`Renderer` 本体に足すと、既存の
/// Renderer が全部壊れる＝プラグインを fork させることになるので、別の印にしてある）。
///
/// キーは [RegistryKinds]、値はアプリが足した名前（組み込みは含めない）。
abstract interface class RegistryReporter {
  Map<String, List<String>> get registeredNames;
}

/// いま動いているアプリが**実際に登録しているもの**を、種類ごとに返す。
///
/// 静的な走査（`hatake registry`）は、登録している所にその場で書いてある文字列しか
/// 読めない。変数や関数から組み立てている登録は原理的に読めないので、**動いている
/// アプリに聞く**ための口がこれ。返す形は `hatake-registry.json` と同じなので、
/// そのまま書き出して `hatake validate --registry` に渡せる。
///
/// 出すのは**アプリが足したものだけ**（組み込みは突き合わせ側が知っているので、
/// 混ぜると一覧が無駄に太り、組み込みが増えるたびに古くなる）。空の種類は出さない
/// ＝「その種類は何も無い」ではなく「言うことが無い」を意味する。
///
/// 見えるのは渡した [scope] の登録だけ。画面ごとに別の scope を作っているなら、
/// その scope ごとに呼ぶこと。
Map<String, List<String>> registrySnapshot(HatakeScope scope) {
  // Renderer は「申告できる」印を実装していなくてよい（既存の Renderer を壊さない）。
  final renderer = scope.renderer;
  final fromRenderer = renderer is RegistryReporter
      ? (renderer as RegistryReporter).registeredNames
      : const <String, List<String>>{};
  return {
    for (final entry in <String, List<String>>{
      RegistryKinds.repositories: scope.repositories.customKeys,
      RegistryKinds.plugins: scope.actions.customKeys,
      // 出す口は「渡したか」だけが問題（中身は関数なので名前が無い）。
      RegistryKinds.sinks: [
        if (scope.exportSink != null) 'exportSink',
        if (scope.printSink != null) 'printSink',
      ],
      RegistryKinds.validators: scope.validators.customKeys,
      RegistryKinds.converters: scope.converters.customKeys,
      // Renderer が独自に持っているもの（項目型・カードの型・フォーマッタ）。
      ...fromRenderer,
    }.entries)
      if (entry.value.isNotEmpty) entry.key: [...entry.value]..sort(),
  };
}

/// [registrySnapshot] を `hatake-registry.json` としてそのまま書ける文字列にする。
///
/// ```dart
/// File('hatake-registry.json').writeAsStringSync(registrySnapshotJson(scope));
/// ```
String registrySnapshotJson(HatakeScope scope) {
  return const JsonEncoder.withIndent('  ').convert({
    r'$comment': '動いているアプリが申告した「登録済みのもの」の一覧'
        '（registrySnapshot）。hatake validate --registry にそのまま渡せる。',
    ...registrySnapshot(scope),
  });
}
