import 'package:equatable/equatable.dart';

import 'field_definition.dart';

/// Asked **before** the action runs: a small form whose values reach the handler.
///
/// 「却下の理由を書いてから却下」は業務でそのまま来る話で、これが無いと**アプリに
/// 手書きのダイアログ**が要る（このフレームワークが無くしたい物がそこで戻ってくる）。
///
/// 決めごと2つ。
///
/// * **項目は普通の [FieldDefinition]。** 型・必須・`validators`・`computed`・
///   `normalize` がフォームと同じに効く＝入力の語彙を2つ持たない。
/// * **確認ダイアログを置き換える**（増やさない）。聞くことがあるなら、その OK が
///   確認そのもの。ダイアログを2枚続けて出すのは、読まずに押す練習をさせるだけ。
class ActionPromptDefinition extends Equatable {
  /// Dialog heading. Null = the action's label.
  final String? title;

  /// Confirming button. Null = `confirm.okLabel`, then the label.
  final String? okLabel;

  /// Cancelling button. Null = `confirm.cancelLabel`.
  final String? cancelLabel;

  /// What to ask. At least one (a prompt with nothing to ask is a confirmation).
  final List<FieldDefinition> fields;

  const ActionPromptDefinition({
    required this.fields,
    this.title,
    this.okLabel,
    this.cancelLabel,
  });

  @override
  List<Object?> get props => [title, okLabel, cancelLabel, fields];
}
