import 'page_kinds.dart';

/// How a page kind is said in Japanese.
///
/// Two wordings per kind on purpose: [what] is the sentence an explanation uses
/// ("検索して一覧に出し、その場で登録・修正・削除までできる画面"), [short] is the
/// heading word a one-line summary or an index needs ("検索＋一覧＋登録・修正・削除").
/// A sentence does not fit in a table row, and a heading word does not explain.
class PageKindWords {
  const PageKindWords({required this.what, required this.short});

  /// Full wording — what this screen is for.
  final String what;

  /// Heading word — fits one line of a table.
  final String short;
}

/// Page kind → wording, transcribed from `spec/vocabulary.json`.
///
/// The spec file is the source of truth (the TypeScript and Java editions
/// transcribe the same table), so the wording cannot drift between the CLI and
/// what an app shows. `page_kind_words_test.dart` compares this table with the
/// spec key by key, which is why transcribing by hand is safe here.
const Map<String, PageKindWords> pageKindWords = {
  PageKinds.crud: PageKindWords(
    what: '検索して一覧に出し、その場で登録・修正・削除までできる画面',
    short: '検索＋一覧＋登録・修正・削除',
  ),
  PageKinds.master: PageKindWords(
    what: 'マスタをメンテナンスする画面（検索・一覧・登録・修正・削除）',
    short: 'マスタ保守',
  ),
  PageKinds.search: PageKindWords(
    what: '検索して一覧を見るだけの画面',
    short: '照会（読み取り専用）',
  ),
  PageKinds.detail: PageKindWords(
    what: '1件の内容を読むだけの画面',
    short: '1件の照会',
  ),
  PageKinds.form: PageKindWords(
    what: '1件を入力する画面（新規と編集の両方）',
    short: '1件の入力',
  ),
  PageKinds.wizard: PageKindWords(
    what: '入力をステップに分けた画面',
    short: '段階入力',
  ),
  PageKinds.dashboard: PageKindWords(
    what: '数字とグラフのカードを並べて見せる画面',
    short: '数字とグラフ',
  ),
  PageKinds.report: PageKindWords(
    what: '印刷向けの帳票',
    short: '帳票',
  ),
};

/// Heading word for [kind] (the kind itself when a plugin added it).
String shortWordOf(String kind) => pageKindWords[kind]?.short ?? kind;

/// Full wording for [kind] (empty when a plugin added it — there is no honest
/// sentence to invent for a kind this edition does not know).
String whatWordOf(String kind) => pageKindWords[kind]?.what ?? '';
