// DSL の版（`dsl_version`）の受け取り方。**3版で同じ**
// （`spec/conformance/dsl_version.json` が正）。
//
// ここは**公開すると直せなくなる**決めごとなので、公開の前に決める。いちばん怖いのは
// 「知らない版を黙って今の版として読む」ことで、将来 2.0 を出したとき、世に出た 1.x の
// 道具が 2.0 の定義を**画面は出るのに意味が違う**形で読む。しかも読めてしまうので、
// 誰も気づけない。だから知らない major は**落とす**（警告にしない＝警告は読まれない）。
//
// 決めごと4つ:
//   ・**知らない major は落とす。** 通すと黙って別の意味で読む
//   ・**同じ major の新しい minor は読む。** minor は「足すだけ」と決めているので、
//     読める所までは読める。読めないキーは strict の担当（二重に言わない）
//   ・**形が違うものは推し量らない。** `1` を `1.0` と読むと、次に `1` の意味を
//     決められなくなる。前後の空白も削らない
//   ・**書いていないのは通す。** 既定は現在の版

import 'page_definition.dart' show kDslVersion;

/// 判定の印。文面は版ごとの言葉でよいが、**印は3版で一致する**。
enum DslVersionKind { defaulted, same, olderMinor, newerMinor, unknownMajor, malformed }

/// 共有フィクスチャに書いてある印の字（`kind`）。
extension DslVersionKindName on DslVersionKind {
  String get wireName => switch (this) {
        DslVersionKind.defaulted => 'default',
        DslVersionKind.same => 'same',
        DslVersionKind.olderMinor => 'older-minor',
        DslVersionKind.newerMinor => 'newer-minor',
        DslVersionKind.unknownMajor => 'unknown-major',
        DslVersionKind.malformed => 'malformed',
      };
}

/// 判定1つ。
class DslVersionVerdict {
  /// 読んだ結果の版（落とすときも、書いてあった字をそのまま持つ）。
  final String version;
  final DslVersionKind kind;

  const DslVersionVerdict(this.version, this.kind);

  /// 解析を落とすか。
  bool get fatal =>
      kind == DslVersionKind.unknownMajor || kind == DslVersionKind.malformed;

  /// 通すが1件言うか（`dsl-version-newer`）。
  bool get warn => kind == DslVersionKind.newerMinor;
}

final RegExp _form = RegExp(r'^[0-9]+\.[0-9]+$');

List<int> _parts(String v) => v.split('.').map(int.parse).toList();

/// この実装が読める版。
final int kDslMajor = _parts(kDslVersion)[0];

/// この実装が読める版の minor。
final int kDslMinor = _parts(kDslVersion)[1];

/// `dsl_version` に書いてあった字（無ければ `null`）を判定する。
///
/// **落とすかどうかは呼び出し側が決める**（解析は例外、検証は警告、という形が違うだけで
/// 判定は1つ）。
DslVersionVerdict checkDslVersion(String? raw) {
  if (raw == null) {
    return const DslVersionVerdict(kDslVersion, DslVersionKind.defaulted);
  }
  if (!_form.hasMatch(raw)) {
    return DslVersionVerdict(raw, DslVersionKind.malformed);
  }
  final parts = _parts(raw);
  if (parts[0] != kDslMajor) {
    return DslVersionVerdict(raw, DslVersionKind.unknownMajor);
  }
  if (parts[1] > kDslMinor) {
    return DslVersionVerdict(raw, DslVersionKind.newerMinor);
  }
  return DslVersionVerdict(
    raw,
    parts[1] == kDslMinor ? DslVersionKind.same : DslVersionKind.olderMinor,
  );
}

/// 落とすときの文（3版で同じことを言う）。
String dslVersionMessage(DslVersionVerdict verdict) {
  if (verdict.kind == DslVersionKind.unknownMajor) {
    return 'dsl_version "${verdict.version}" はこの版では読めません'
        '（読めるのは $kDslMajor.x）。'
        '別の版の定義を今の版として読むと、画面は出るのに意味が変わります。';
  }
  return 'dsl_version "${verdict.version}" の書き方が違います'
      '（"$kDslMajor.$kDslMinor" のように <major>.<minor> で書いてください）。';
}
