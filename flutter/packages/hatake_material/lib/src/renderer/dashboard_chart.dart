part of '../material_renderer.dart';

/// Draws a dashboard `chart` item from its aggregated points.
///
/// Deliberately dependency-free: a business dashboard needs bar / line / pie of
/// a handful of buckets, and pulling in a charting package would leak into every
/// application. Anything richer is a plugin item type (see
/// [MaterialRenderer.dashboardItemBuilders]).
class _DashboardChart extends StatelessWidget {
  final DashboardItemDefinition item;
  final List<AggregateBucket> buckets;
  final FormatterRegistry formatters;

  const _DashboardChart({
    required this.item,
    required this.buckets,
    required this.formatters,
  });

  String _label(num? value) {
    if (value == null) return '';
    if (item.format != null) {
      return formatters.format(item.format!, value, item.config);
    }
    return value.toString();
  }

  static List<Color> _palette(ColorScheme scheme) => [
        scheme.primary,
        scheme.tertiary,
        scheme.secondary,
        scheme.primaryContainer,
        scheme.tertiaryContainer,
        scheme.secondaryContainer,
      ];

  @override
  Widget build(BuildContext context) {
    final chart = item.chart;
    if (chart == null) {
      // A definition mistake, not a data problem: say so instead of drawing.
      return Text(
        'chart が未指定です',
        key: Key('hatake.dashboard.${item.id}.unsupported'),
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      );
    }
    if (buckets.isEmpty) {
      return Center(
        child: Text(
          'データがありません',
          key: Key('hatake.dashboard.${item.id}.empty'),
        ),
      );
    }
    final theme = Theme.of(context);
    final colors = _palette(theme.colorScheme);
    final labelStyle = theme.textTheme.bodySmall ??
        const TextStyle(fontSize: 12, color: Colors.black);
    final painter = switch (chart.kind) {
      ChartKinds.line => _LineChartPainter(
          buckets: buckets,
          color: colors.first,
          labelStyle: labelStyle,
          gridColor: theme.colorScheme.outlineVariant,
          valueLabel: _label,
        ),
      ChartKinds.pie => _PieChartPainter(buckets: buckets, colors: colors),
      _ => _BarChartPainter(
          buckets: buckets,
          colors: colors,
          labelStyle: labelStyle,
          gridColor: theme.colorScheme.outlineVariant,
          valueLabel: _label,
        ),
    };
    final canvas = CustomPaint(
      key: Key('hatake.dashboard.${item.id}.chart'),
      painter: painter,
      child: const SizedBox.expand(),
    );
    if (chart.kind != ChartKinds.pie) return canvas;
    // A pie is unreadable without a legend, so it gets one instead of axis text.
    return Row(
      children: [
        Expanded(child: canvas),
        Expanded(child: _legend(context, colors, labelStyle)),
      ],
    );
  }

  Widget _legend(BuildContext context, List<Color> colors, TextStyle style) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < buckets.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    color: colors[i % colors.length],
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      '${buckets[i].label} ${_label(buckets[i].value)}',
                      style: style,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Draws [text] centred on [center] (clipped to [maxWidth]).
void _paintLabel(
  Canvas canvas,
  String text,
  Offset center,
  TextStyle style, {
  required double maxWidth,
}) {
  if (text.isEmpty || maxWidth <= 0) return;
  final painter = TextPainter(
    text: TextSpan(text: text, style: style),
    textDirection: TextDirection.ltr,
    maxLines: 1,
    ellipsis: '…',
  )..layout(maxWidth: maxWidth);
  painter.paint(
    canvas,
    Offset(center.dx - painter.width / 2, center.dy - painter.height / 2),
  );
}

/// Value range shared by the bar and line painters: always includes zero so the
/// baseline means the same thing on every chart.
({double min, double max}) _valueRange(List<AggregateBucket> buckets) {
  var min = 0.0;
  var max = 0.0;
  for (final bucket in buckets) {
    final value = bucket.value?.toDouble() ?? 0;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min == max) max = min + 1; // All-zero data still needs a height.
  return (min: min, max: max);
}

class _BarChartPainter extends CustomPainter {
  final List<AggregateBucket> buckets;
  final List<Color> colors;
  final TextStyle labelStyle;
  final Color gridColor;
  final String Function(num?) valueLabel;

  _BarChartPainter({
    required this.buckets,
    required this.colors,
    required this.labelStyle,
    required this.gridColor,
    required this.valueLabel,
  });

  static const double _labelHeight = 16;
  static const double _valueHeight = 14;

  @override
  void paint(Canvas canvas, Size size) {
    final range = _valueRange(buckets);
    const plotTop = _valueHeight;
    final plotBottom = size.height - _labelHeight;
    if (plotBottom <= plotTop) return;
    final scale = (plotBottom - plotTop) / (range.max - range.min);
    final zeroY = plotBottom - (0 - range.min) * scale;

    canvas.drawLine(
      Offset(0, zeroY),
      Offset(size.width, zeroY),
      Paint()..color = gridColor,
    );

    final slot = size.width / buckets.length;
    final barWidth = slot * 0.6;
    for (var i = 0; i < buckets.length; i++) {
      final value = buckets[i].value?.toDouble() ?? 0;
      final y = plotBottom - (value - range.min) * scale;
      final center = slot * i + slot / 2;
      canvas.drawRect(
        Rect.fromLTRB(
          center - barWidth / 2,
          value < 0 ? zeroY : y,
          center + barWidth / 2,
          value < 0 ? y : zeroY,
        ),
        Paint()..color = colors[i % colors.length],
      );
      _paintLabel(
        canvas,
        valueLabel(buckets[i].value),
        Offset(center, (value < 0 ? y + _valueHeight : y) - _valueHeight / 2),
        labelStyle,
        maxWidth: slot,
      );
      _paintLabel(
        canvas,
        buckets[i].label,
        Offset(center, size.height - _labelHeight / 2),
        labelStyle,
        maxWidth: slot,
      );
    }
  }

  @override
  bool shouldRepaint(_BarChartPainter old) => old.buckets != buckets;
}

class _LineChartPainter extends CustomPainter {
  final List<AggregateBucket> buckets;
  final Color color;
  final TextStyle labelStyle;
  final Color gridColor;
  final String Function(num?) valueLabel;

  _LineChartPainter({
    required this.buckets,
    required this.color,
    required this.labelStyle,
    required this.gridColor,
    required this.valueLabel,
  });

  static const double _labelHeight = 16;
  static const double _valueHeight = 14;

  @override
  void paint(Canvas canvas, Size size) {
    final range = _valueRange(buckets);
    const plotTop = _valueHeight;
    final plotBottom = size.height - _labelHeight;
    if (plotBottom <= plotTop) return;
    final scale = (plotBottom - plotTop) / (range.max - range.min);
    final zeroY = plotBottom - (0 - range.min) * scale;

    canvas.drawLine(
      Offset(0, zeroY),
      Offset(size.width, zeroY),
      Paint()..color = gridColor,
    );

    final slot = size.width / buckets.length;
    final points = <Offset>[];
    for (var i = 0; i < buckets.length; i++) {
      final value = buckets[i].value?.toDouble() ?? 0;
      points.add(Offset(
        slot * i + slot / 2,
        plotBottom - (value - range.min) * scale,
      ));
    }
    final path = Path()..moveTo(points.first.dx, points.first.dy);
    for (final point in points.skip(1)) {
      path.lineTo(point.dx, point.dy);
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke,
    );

    final dot = Paint()..color = color;
    for (var i = 0; i < points.length; i++) {
      canvas.drawCircle(points[i], 3, dot);
      _paintLabel(
        canvas,
        valueLabel(buckets[i].value),
        Offset(points[i].dx, points[i].dy - _valueHeight),
        labelStyle,
        maxWidth: slot,
      );
      _paintLabel(
        canvas,
        buckets[i].label,
        Offset(points[i].dx, size.height - _labelHeight / 2),
        labelStyle,
        maxWidth: slot,
      );
    }
  }

  @override
  bool shouldRepaint(_LineChartPainter old) => old.buckets != buckets;
}

class _PieChartPainter extends CustomPainter {
  final List<AggregateBucket> buckets;
  final List<Color> colors;

  _PieChartPainter({required this.buckets, required this.colors});

  @override
  void paint(Canvas canvas, Size size) {
    // Only positive slices make sense in a pie; negatives are dropped.
    var total = 0.0;
    for (final bucket in buckets) {
      final value = bucket.value?.toDouble() ?? 0;
      if (value > 0) total += value;
    }
    final radius = (size.shortestSide / 2) - 4;
    if (total <= 0 || radius <= 0) return;
    final rect = Rect.fromCircle(
      center: Offset(size.width / 2, size.height / 2),
      radius: radius,
    );
    var start = -math.pi / 2;
    for (var i = 0; i < buckets.length; i++) {
      final value = buckets[i].value?.toDouble() ?? 0;
      if (value <= 0) continue;
      final sweep = (value / total) * math.pi * 2;
      canvas.drawArc(
        rect,
        start,
        sweep,
        true,
        Paint()..color = colors[i % colors.length],
      );
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(_PieChartPainter old) => old.buckets != buckets;
}
