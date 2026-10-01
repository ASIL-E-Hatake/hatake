// 区切って実行している一括の「あと何分くらいか」（Dart 版 `bulkRemainingText` の転記）。
//
// **null = まだ言えない**（言わない）。根拠は「ここまでの実測」だけなので、1区切りも
// 終わっていないうちと、1秒も経っていないうちは何も言わない。出すときは**多めに**
// （切り上げ・10秒単位）、必ず「くらい」を付ける。Flutter とブラウザ版で同じ言い方に
// するため、共有フィクスチャ `bulk_progress.json` で縛る。

export function bulkRemainingText(done: number, total: number, seconds: number): string | null {
  if (done <= 0 || done >= total || seconds <= 0) return null;
  const left = Math.ceil(((total - done) * seconds) / done);
  if (left < 60) {
    const rounded = Math.floor((left + 9) / 10) * 10;
    return rounded >= 60 ? "あと 1 分くらい" : `あと ${rounded} 秒くらい`;
  }
  if (left < 3600) return `あと ${Math.ceil(left / 60)} 分くらい`;
  return `あと ${Math.ceil(left / 3600)} 時間くらい`;
}
