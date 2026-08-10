import 'package:flutter/material.dart';
import 'package:hatake/hatake.dart';

/// Turns a [ThemeDefinition] into a Material `ThemeData`.
///
/// This is the whole of "theme" on the Material side: the definition says what
/// the company looks like, this decides how Material draws it. [HatakeApp]
/// applies it automatically, so an app only needs `app.theme` in its YAML — but
/// it is public so you can also hand it to your own `MaterialApp`, or start from
/// your own base with [from].
///
/// [platformBrightness] is used when the definition says `brightness: system`
/// (pass `MediaQuery.platformBrightnessOf(context)`).
ThemeData materialThemeOf(
  ThemeDefinition theme, {
  Brightness platformBrightness = Brightness.light,
  ThemeData? from,
}) {
  final brightness = switch (theme.brightness) {
    Brightnesses.dark => Brightness.dark,
    Brightnesses.system => platformBrightness,
    _ => Brightness.light,
  };
  final seed = theme.primaryArgb;
  final base = from ??
      ThemeData(
        useMaterial3: true,
        brightness: brightness,
        colorScheme: seed == null
            ? null
            : ColorScheme.fromSeed(
                seedColor: Color(seed),
                brightness: brightness,
                // A declared accent wins over the one derived from the seed.
                secondary: switch (theme.secondaryArgb) {
                  final int argb => Color(argb),
                  null => null,
                },
              ),
      );

  final density = _densityOf(theme.density);
  final radius = theme.radius;
  final corners = radius == null ? null : BorderRadius.circular(radius);

  return base.copyWith(
    visualDensity: density.visual,
    dataTableTheme: base.dataTableTheme.copyWith(
      dataRowMinHeight: density.rowHeight,
      dataRowMaxHeight: density.rowHeight,
    ),
    inputDecorationTheme: base.inputDecorationTheme.copyWith(
      isDense: theme.density == Densities.compact,
      border:
          corners == null ? null : OutlineInputBorder(borderRadius: corners),
    ),
    cardTheme: corners == null
        ? null
        : base.cardTheme.copyWith(
            shape: RoundedRectangleBorder(borderRadius: corners),
          ),
    // The font is applied through the text theme so every text style inherits it
    // (setting only ThemeData.fontFamily misses styles that name their own).
    textTheme: theme.fontFamily == null
        ? base.textTheme
        : base.textTheme.apply(fontFamily: theme.fontFamily),
  );
}

/// Density in the two places a business screen notices it: control padding and
/// list row height.
({VisualDensity visual, double rowHeight}) _densityOf(String density) =>
    switch (density) {
      Densities.compact => (visual: VisualDensity.compact, rowHeight: 40),
      Densities.comfortable => (
          visual: VisualDensity.comfortable,
          rowHeight: 56
        ),
      _ => (visual: VisualDensity.standard, rowHeight: 48),
    };
