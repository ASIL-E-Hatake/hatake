part of '../material_renderer.dart';

/// 選択肢の連動（カスケード）の Renderer 側。入力フォームと検索欄で共有する。
///
/// 定義に書いた選択肢の絞り込みは hatake_core（[visibleOptions]）の担当で、ここは
/// **I/O だけ**を持つ。`optionsSource` があれば Repository から引き、結果を
/// 「項目名＋親の値」で覚える＝親が変われば引き直し、同じ親のままなら1回だけ引く。
///
/// Framework は HTTP も SQL も知らないので、一覧画面と同じ契約（`Repository.search`）
/// で頼むだけ。どう絞るかは実装した人の領分。
class _OptionsFetcher {
  /// 引き先。null なら `optionsSource` は空振りする（画面は出る）。
  final RepositoryRegistry? repositories;

  /// 引けたときに呼ぶ。呼び出し側が setState する。
  final VoidCallback onFetched;

  final Map<String, List<OptionItem>> _fetched = {};

  /// いま引いている最中のキー（毎フレーム投げないため）。
  final Set<String> _fetching = {};

  _OptionsFetcher({required this.repositories, required this.onFetched});

  /// [owner]（入力項目 or 検索条件）がいま出すべき選択肢。
  ///
  /// [values] は「いまの値の集まり」＝入力ならレコード、検索なら検索欄の値。
  List<OptionItem> optionsFor(
    OptionsOwner owner,
    Map<String, Object?> values,
  ) {
    final source = owner.optionsSource;
    if (source == null) return visibleOptions(owner, values);
    final parent = owner.optionsFrom;
    final parentValue = parent == null ? null : values[parent];
    final key = '${owner.field}#$parentValue';
    final fetched = _fetched[key];
    if (fetched != null) return fetched;
    _fetch(owner, source, parentValue, key);
    return const []; // 引けるまでは空（選択肢が出ないだけで、画面は出る）
  }

  Future<void> _fetch(
    OptionsOwner owner,
    OptionsSource source,
    Object? parentValue,
    String key,
  ) async {
    if (_fetching.contains(key)) return;
    final registry = repositories;
    if (registry == null || !registry.contains(source.repository)) return;
    // 親を見る指定なのに親が空なら、まだ引かない（全件出すと連動の意味がない）。
    if (source.parentKey != null &&
        owner.optionsFrom != null &&
        (parentValue == null || parentValue.toString().isEmpty)) {
      _fetched[key] = const [];
      return;
    }
    _fetching.add(key);
    try {
      final result = await registry.resolve(source.repository).search(
            RepositoryQuery(
              filters: {
                if (source.parentKey != null && parentValue != null)
                  source.parentKey!: parentValue,
              },
              pageSize: source.limit,
            ),
          );
      _fetched[key] = [
        for (final row in result.items)
          OptionItem(
            value: row[source.value],
            label: row[source.label]?.toString() ?? '',
          ),
      ];
    } catch (_) {
      // 引けなかったことは画面では言わない（選択肢が空になるだけ）。Repository の
      // 失敗は一覧と同じくアプリ側のログの話。
      _fetched[key] = const [];
    } finally {
      _fetching.remove(key);
      onFetched();
    }
  }
}
