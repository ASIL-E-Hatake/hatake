part of '../material_renderer.dart';

/// 一覧の下の件数とページ送り（検索・CRUD・マスタで共通）。
///
/// 出すか・何と書くかは `hatake_core` の [pagerView] が決める。ここは描くだけ。
/// `pagination.enabled: false` のときは送る口を出さず、出しきれていなければ
/// 「120 件中 100 件を表示しています（絞り込んでください）」と書く。
Widget _listPager(
  ThemeData theme,
  ListController controller,
  PaginationDefinition pagination,
) {
  final view = pagerView(
    pagination,
    controller.totalCount,
    controller.items.length,
  );
  final page = controller.page;
  final pageCount = controller.pageCount;
  return Row(
    mainAxisAlignment: MainAxisAlignment.end,
    children: [
      Text(
        view.text,
        key: const Key('hatake.pager.text'),
        style: theme.textTheme.bodySmall,
      ),
      if (view.paged) ...[
        const SizedBox(width: 16),
        IconButton(
          key: const Key('hatake.prev'),
          icon: const Icon(Icons.chevron_left),
          onPressed: page > 0 ? () => controller.setPage(page - 1) : null,
        ),
        Text('${page + 1} / $pageCount'),
        IconButton(
          key: const Key('hatake.next'),
          icon: const Icon(Icons.chevron_right),
          onPressed:
              page < pageCount - 1 ? () => controller.setPage(page + 1) : null,
        ),
      ],
    ],
  );
}
