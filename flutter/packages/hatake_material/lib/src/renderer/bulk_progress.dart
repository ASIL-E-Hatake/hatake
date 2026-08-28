part of '../material_renderer.dart';

/// 一括を**区切って実行する**（`batchSize`）。進み具合を出して、区切りで止められる。
///
/// なぜ枠組みが回すのか: 1回で全部渡してしまうと、**枠組みには途中の状態が分からない**
/// （何件終わったのかを知っているのはハンドラの中だけ）。だから「進み具合を出す」も
/// 「途中で止める」も、区切りが在るときだけできる機能になる。逆に区切りを枠組みが持つと、
/// 進み具合・中断・区切りごとの報告の合算が**ハンドラの手間ゼロ**で付いてくる。
///
/// 嘘をつかないための決めごと:
///   ・**中断は「まだ送っていない分を送らない」だけ。** 既に送った区切りは動いている
///     （取り消しではない）。だから報告では「実行した」と「送っていない」を別に数える。
///   ・**区切りが失敗したら、残りは送らない。** 同じ理由で失敗し続ける可能性が高く、
///     現場が止める手段が無いまま100件ぶん失敗し続けるのが一番まずい。
///   ・**押した人が見るのは1回ぶんの結果。** 何回に分けて送ったかは枠組みの都合なので、
///     報告には出さない（区切りごとの報告は足し合わせる）。
///   ・**閉じるボタンは出さない。** 消えたダイアログの裏で走り続けるのが分からないので、
///     終わるか、止めるか、のどちらかでしか閉じない。
///   ・**残り時間は「くらい」でしか言わない。** 実測から出す見当なので、後半の区切りが
///     重ければ外れる。だから多めに言う（少なく言って待たされる方が悪い）。

/// 区切りごとの実行を、押した人に見せながら進める。
class _BulkRunner {
  final BuildContext context;
  final ActionDefinition action;
  final List<DataRecord> records;
  final int batchSize;

  /// 1区切りぶんを実行して、その区切りの報告を返す（例外はそのまま投げる）。
  final Future<ActionOutcome> Function(List<DataRecord> batch) runBatch;

  _BulkRunner({
    required this.context,
    required this.action,
    required this.records,
    required this.batchSize,
    required this.runBatch,
  });

  /// 終わった区切りまでの件数。
  final ValueNotifier<int> _done = ValueNotifier<int>(0);

  /// ここまでの報告（区切りごとの合算）。
  ///
  /// **投げて終わったときにも残る**ようにしてある。区切りが投げると合算した報告は
  /// 呼んだ側に返らないので、ここに持っていないと「3区切り目で落ちたら、2区切り目が
  /// 名指しした失敗も消える」＝残りを持ち出す紙から行が抜ける。
  ActionOutcome get reported => _reported;
  ActionOutcome _reported = const ActionOutcome();
  bool _cancelled = false;

  /// 走り始めてからの秒数（**見当を出すためだけ**に数える）。
  ///
  /// 時計を1秒ごとに進めるが、画面を描き直すのは**区切りが終わったとき**だけ
  /// （毎秒描き直すと、待っている人には数字が揺れるだけで何も増えない）。
  int _seconds = 0;
  Timer? _clock;

  /// **まだ終わっていない行**（最後に終わった区切りより後ろ）。
  ///
  /// 送っていない行と、失敗した区切りの行が入る。失敗した区切りは「動いたのかどうか
  /// 枠組みには分からない」側なので、終わっていない扱いにする（画面がこれを選び直す
  /// ので、もう一度押せば続きから動く）。
  List<DataRecord> get unfinished => records.sublist(_done.value);

  /// 区切りに割る（最後の区切りは端数）。
  List<List<DataRecord>> get _batches {
    final out = <List<DataRecord>>[];
    for (var at = 0; at < records.length; at += batchSize) {
      out.add(records.sublist(at, math.min(at + batchSize, records.length)));
    }
    return out;
  }

  /// 実行する。返すのは**合算した報告**（送らなかったぶんは `skipped`）。
  Future<ActionOutcome> run() async {
    final dialog = _show();
    _clock = Timer.periodic(const Duration(seconds: 1), (_) => _seconds++);
    try {
      for (final batch in _batches) {
        if (_cancelled) break;
        // 区切りが投げたら、この for を抜けて外に出る＝**残りは送らない**
        // （同じ理由で失敗し続ける方が悪い）。文言は呼んだ側が出す。
        _reported = _reported.merge(await runBatch(batch));
        _done.value += batch.length;
      }
    } finally {
      _clock?.cancel();
      _close(dialog);
    }
    return _reported.withSkipped(records.length - _done.value);
  }

  /// 進み具合のダイアログ。**閉じるボタンは出さない**（終わるか、止めるか）。
  Future<void>? _show() {
    if (!context.mounted) return null;
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        key: const Key('hatake.bulkProgress'),
        title: Text(action.label),
        content: ValueListenableBuilder<int>(
          valueListenable: _done,
          builder: (context, done, _) {
            final left = _remainingText(
              done: done,
              total: records.length,
              seconds: _seconds,
            );
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 件数を先に出す（棒だけでは「あと何件か」が読めない）。
                Text('$done / ${records.length} 件'),
                if (left != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      left,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                const SizedBox(height: 12),
                LinearProgressIndicator(
                  value: records.isEmpty ? 0 : done / records.length,
                ),
              ],
            );
          },
        ),
        actions: [
          TextButton(
            key: const Key('hatake.bulkProgress.cancel'),
            onPressed: () {
              // 送った分は動いている＝取り消しではない、と分かる言い方にする。
              _cancelled = true;
            },
            child: const Text('中断（ここまでは実行されます）'),
          ),
        ],
      ),
    );
  }

  void _close(Future<void>? dialog) {
    if (dialog == null) return;
    final navigator = Navigator.maybeOf(context);
    if (navigator != null && navigator.canPop()) navigator.pop();
  }
}

/// 「あと何分くらいか」。**null = まだ言えない**（言わない）。
///
/// 出せる根拠は「ここまでの実測」しかない。だから1区切りも終わっていないうち
/// （[done] が 0）と、1秒も経っていないうち（速すぎて測れていない）は**何も言わない**
/// ＝見当が付かないときに数字を出す方が嘘になる。
///
/// 出すときは**多めに言う**（切り上げ・10秒単位）。少なく言って待たされる方が、
/// 多めに言って早く終わるより悪い。「くらい」を必ず付けるのも同じ理由で、後半の区切りが
/// 重ければ外れる数字だと分かる形にしておく。
String? _remainingText({
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
