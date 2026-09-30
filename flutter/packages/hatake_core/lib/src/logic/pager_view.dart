import '../definition/pagination_definition.dart';

/// 一覧の下に出す件数の字と、ページ送りを出すか（`table.pagination`）。
///
/// 決めるのはここだけで、Renderer は出てきたものを描くだけ。TypeScript 版は
/// `@hatake-fw/api` の `pagerView`。同じ答えになることは
/// `spec/conformance/pagination.json` が見ている。
class PagerView {
  /// ページ送り（‹ 1 / 3 ›）を出すか。`enabled: false` なら出さない。
  final bool paged;

  /// 件数の字（「全 120 件」／「120 件中 100 件を表示しています（絞り込んでください）」）。
  final String text;

  const PagerView({required this.paged, required this.text});
}

/// [totalCount] はサーバが言った全体の件数、[shown] は実際に届いた行数。
///
/// `enabled: false` は**最初の `pageSize` 件だけ**を出す。出しきれないときに黙って
/// 切ると、見えていない行が在ることに誰も気づけないので、そう言う。
PagerView pagerView(
  PaginationDefinition pagination,
  int totalCount,
  int shown,
) {
  if (pagination.enabled) {
    return PagerView(paged: true, text: '全 $totalCount 件');
  }
  if (totalCount <= shown) {
    return PagerView(paged: false, text: '全 $totalCount 件');
  }
  return PagerView(
    paged: false,
    text: '$totalCount 件中 $shown 件を表示しています（絞り込んでください）',
  );
}
