/// 区切って実行している一括の「あと何分くらいか」（0.9.25 で `hatake_material` から上げた）。
///
/// **null = まだ言えない**（言わない）。出せる根拠は「ここまでの実測」しかない。だから
/// 1区切りも終わっていないうち（[done] が 0）と、1秒も経っていないうち（速すぎて
/// 測れていない）は**何も言わない**＝見当が付かないときに数字を出す方が嘘になる。
///
/// 出すときは**多めに言う**（切り上げ・10秒単位）。少なく言って待たされる方が、多めに
/// 言って早く終わるより悪い。「くらい」を必ず付けるのも同じ理由で、後半の区切りが
/// 重ければ外れる数字だと分かる形にしておく。
///
/// ブラウザ版（`@hatake-fw/runtime`）も同じ言い方をする＝共有フィクスチャ
/// `bulk_progress.json` で縛る。
String? bulkRemainingText({
  required int done,
  required int total,
  required int seconds,
}) {
  if (done <= 0 || done >= total || seconds <= 0) return null;
  final left = ((total - done) * seconds / done).ceil();
  if (left < 60) {
    final rounded = ((left + 9) ~/ 10) * 10;
    return rounded >= 60 ? 'あと 1 分くらい' : 'あと $rounded 秒くらい';
  }
  if (left < 3600) return 'あと ${(left / 60).ceil()} 分くらい';
  return 'あと ${(left / 3600).ceil()} 時間くらい';
}
