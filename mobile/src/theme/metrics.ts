// Shared layout values stay independent of React Native so gesture geometry can
// use the same touch targets as rendered controls.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radii = { block: 5, control: 8, card: 12 } as const;
export const typeSize = {
  caption: 11,
  secondary: 12,
  label: 13,
  body: 14,
  title: 18,
  time: 24,
} as const;
export const controls = {
  touchTarget: 44,
  timeRow: 48,
  timeWidth: 88,
  icon: 21,
  smallIcon: 16,
  stroke: 1.8,
} as const;
