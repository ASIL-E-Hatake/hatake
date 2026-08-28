part of '../material_renderer.dart';

/// 並べて開いたタブの列（`app.navigation: tabs`）。
///
/// なぜタブが要るのか: 業務では「受注を見ながらマスタを直す」が普通に来る。1画面ずつの
/// 遷移だと、行き来のたびに検索条件と入力が消える。逆に**タブだけ**にすると、1件ずつ
/// 処理する業務（伝票を上から順に片付ける）では邪魔になるので、どちらかに決め打ちしない
/// ＝定義が既定を言い、アプリが上書きする。
///
/// 決めごと:
///   ・**同じ画面は2枚開かない**（ページ id ＋ `params` が同じなら、開いているタブを
///     前に出す）。同じ受注を2枚開いて別々に編集できると、どちらが正か分からない
///   ・**上限に達したら開かずにそう言う**（古いタブを勝手に閉じない＝入力中かもしれない）
///   ・**最後の1枚は閉じられない**（画面が無くなる）
///   ・タブの札はその中でいま見ている画面の名前（中で遷移したら札も変わる）
class _AppTabBar extends StatelessWidget {
  final AppDefinition app;
  final HatakeRouter router;

  const _AppTabBar({required this.app, required this.router});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tabs = router.tabs;
    return Material(
      color: theme.colorScheme.surfaceContainerLow,
      child: SizedBox(
        height: 44,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          itemCount: tabs.length,
          separatorBuilder: (_, __) => const SizedBox(width: 6),
          itemBuilder: (context, index) => _tab(context, tabs[index], index),
        ),
      ),
    );
  }

  Widget _tab(BuildContext context, AppTab tab, int index) {
    final front = index == router.frontTab;
    // 札は「いま見ている画面」の名前。中で遷移した（`depth` が 2 以上）ことは
    // タブの中のパン屑が言うので、札には出さない（幅を食うだけ）。
    final page = app.pageById(tab.current.pageId);
    return InputChip(
      key: Key('hatake.app.tab.${tab.id}'),
      selected: front,
      showCheckmark: false,
      label: Text(page?.title ?? tab.current.pageId),
      onPressed: () => router.selectTab(index),
      // 最後の1枚には閉じる口を出さない（押せないボタンを出さない）。
      onDeleted: router.tabCount > 1
          ? () => _close(context, tab, index)
          : null,
      deleteIcon: Icon(Icons.close, key: Key('hatake.app.tab.${tab.id}.close')),
      deleteButtonTooltipMessage: '閉じる',
    );
  }

  /// 閉じる。**入力する画面は聞いてから**閉じる。
  ///
  /// タブの中で何を入力したかは、この列からは見えない（画面の中の話）。見えないなら
  /// 「消えるかもしれない」側に倒す＝入力できる画面（フォーム・ウィザード・CRUD）を
  /// 閉じるときだけ確認する。**変わっていなくても聞く**のは、取りこぼしを作らないため。
  Future<void> _close(BuildContext context, AppTab tab, int index) async {
    final page = app.pageById(tab.current.pageId);
    if (page != null && _mayHoldInput(page)) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          key: const Key('hatake.app.tab.confirmClose'),
          title: Text('「${page.title}」を閉じます'),
          content: const Text('入力中のものは消えます。'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('やめる'),
            ),
            TextButton(
              key: const Key('hatake.app.tab.confirmClose.ok'),
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('閉じる'),
            ),
          ],
        ),
      );
      if (ok != true) return;
    }
    router.closeTab(index);
  }

  /// 入力できる画面か（閉じると入力が消える側）。
  static bool _mayHoldInput(PageDefinition page) =>
      page is FormPageDefinition ||
      page is WizardPageDefinition ||
      page is CrudPageDefinition ||
      page is MasterPageDefinition;
}

/// タブを開けなかったときの言い方（上限に達している）。
void _tooManyTabs(BuildContext context) {
  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
    content: Text('タブが多すぎます（${HatakeRouter.maxTabs} 枚まで）。'
        '使い終わったタブを閉じてください。'),
  ));
}
