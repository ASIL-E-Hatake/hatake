// 一覧に出す字を、**同じ画面に書いてある選択肢**から引く。
//
// 業務のマスタはコードで持って名前で見せる（`active` → 在籍、`corp` → 法人）。
// 入力欄では `options` に書いたラベルが出るのに、**一覧ではコードがそのまま出ていた**
// ＝同じ画面の中で同じ項目が2つの顔を持つ。見本の取引先マスタで `corp` / `active` が
// 並んで、それが納品用のスクリーンショットに残って気づいた。
//
// 直し方は2つあった:
//   ・列に `options` を書けるようにする（DSL のキーを増やす）
//   ・**同じ画面に書いてある選択肢を引く**（増やさない）… こちら
//
// 増やさない方を採ったのは、**同じことを2か所に書かせない**ため。`employmentStatus` の
// 選択肢は入力欄か検索条件にもう書いてあるので、列にもう一度書かせると片方だけ直した
// ときに食い違う（しかも一覧と入力で違う字が出るので、直すまで誰も気づかない）。
//
// 引けなかったら**値をそのまま出す**（勝手に作らない）。選択肢を Repository から引く
// もの（`optionsSource`）はここでは分からないので、そのまま出る。

import '../definition/options_owner.dart';
import '../definition/page_definition.dart';

/// その画面に書いてある、選択肢を持つものの全部（入力項目と検索条件）。
///
/// 並びは**入力項目が先**。同じ項目名が両方に在るときは入力側の言い方を採る
/// （入力欄に出ている字と一覧の字を合わせたいので）。
List<OptionsOwner> optionOwnersOf(PageDefinition page) {
  final owners = <OptionsOwner>[];
  switch (page) {
    // 入力と検索の両方を持つ画面（crud / master）。
    case final CrudLike crud:
      owners.addAll(optionOwnersOfCrud(crud));
    case SearchPageDefinition(:final search):
      if (search != null) owners.addAll(search.filters);
    case FormPageDefinition(:final form):
      owners.addAll(form.fields);
    case DetailPageDefinition(:final form):
      owners.addAll(form.fields);
    // ウィザードは全ステップを畳んだ form を持っている。
    case WizardPageDefinition():
      owners.addAll(page.form.fields);
    default:
      break;
  }
  return owners;
}

/// crud / master のぶん。
///
/// [CrudLike] は画面の種類ではなく**同じ形をしていること**を言う約束なので、
/// `PageDefinition` としては受け取れない（Renderer はこちらを使う）。
List<OptionsOwner> optionOwnersOfCrud(CrudLike page) => [
      ...page.form.fields,
      ...?page.search?.filters,
    ];

/// [field] の [value] を、渡された選択肢のラベルにする。
///
/// 引けなければ null（呼ぶ側が値をそのまま出す）。**1行ごとに集め直さない**よう、
/// 画面を組むときに1度だけ [optionOwnersOf] を呼んで、その結果を渡す。
String? optionLabelIn(List<OptionsOwner> owners, String field, Object? value) {
  if (value == null) return null;
  for (final owner in owners) {
    if (owner.field != field) continue;
    for (final option in owner.options) {
      // 型をまたいで比べる（YAML の `10` と REST の `"10"` が同じものを指すことがある）。
      if (option.value == value || '${option.value}' == '$value') {
        return option.label;
      }
    }
  }
  return null;
}

/// [field] の [value] を、画面に書いてある選択肢のラベルにする。
String? optionLabelOf(PageDefinition page, String field, Object? value) =>
    optionLabelIn(optionOwnersOf(page), field, value);
