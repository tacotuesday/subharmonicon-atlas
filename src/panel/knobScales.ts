export type KnobScale = 'sequencer' | 'division' | 'frequency' | 'dense';

export interface KnobTick { angle: number; major: boolean }

export function knobAngle(normalized: number, scale: KnobScale, reverse = false): number {
  const position = reverse ? 1 - normalized : normalized;
  // There are 16 valid divisors and 17 printed marks. Snap each divisor to
  // its nearest mark; the center mark is the reference between ÷8 and ÷9.
  const stop = scale === 'division' ? Math.round(position * 16) / 16 : position;
  return -135 + stop * 270;
}

export function knobTicks(scale: KnobScale): KnobTick[] {
  const majorCount = scale === 'division' ? 17 : scale === 'frequency' ? 9 : 11;
  const intervals = (majorCount - 1) * (scale === 'dense' ? 5 : 1);
  return Array.from({ length: intervals + 1 }, (_, index) => ({
    angle: -135 + index * 270 / intervals,
    major: scale !== 'dense' || index % 5 === 0,
  }));
}
