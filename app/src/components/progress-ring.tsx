// Anillo de progreso multi-segmento (terminado/en progreso/no iniciado) con
// número total al centro, al estilo de los paneles de control operativos.
import { Text, View, ViewStyle } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { fonts } from '../lib/theme';
import { useTheme } from '../lib/theme-context';

export interface RingSegment {
  value: number;
  color: string;
}

export function ProgressRing({
  segments,
  size = 104,
  strokeWidth = 12,
  style,
}: {
  segments: RingSegment[];
  size?: number;
  strokeWidth?: number;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let cumulative = 0;
  const arcs = total === 0
    ? [{ color: colors.hairlineStrong, value: 1 }]
    : segments.filter((seg) => seg.value > 0);
  const arcTotal = total === 0 ? 1 : total;

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${center}, ${center}`}>
          {arcs.map((seg, i) => {
            const length = (seg.value / arcTotal) * circumference;
            const offset = -( (cumulative / arcTotal) * circumference );
            cumulative += seg.value;
            return (
              <Circle
                key={i}
                cx={center}
                cy={center}
                r={radius}
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                fill="none"
              />
            );
          })}
        </G>
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontFamily: fonts.displaySemibold, fontSize: 28, color: colors.ink }}>{total}</Text>
      </View>
    </View>
  );
}

export function RingLegend({ items }: { items: { label: string; value: number; color: string }[] }) {
  return (
    <View style={{ gap: 6 }}>
      {items.map((item) => (
        <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />
          <LegendText label={item.label} value={item.value} />
        </View>
      ))}
    </View>
  );
}

function LegendText({ label, value }: { label: string; value: number }) {
  const { colors } = useTheme();
  return (
    <Text style={{ fontFamily: fonts.uiMedium, fontSize: 12, color: colors.inkSoft }}>
      {label} <Text style={{ fontFamily: fonts.uiBold, color: colors.ink }}>{value}</Text>
    </Text>
  );
}
