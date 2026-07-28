export const spacing = {
  px4: 4,
  px8: 8,
  px12: 12,
  px16: 16,
  px24: 24,
  px32: 32,
  px40: 40,
  px48: 48,
  px64: 64
} as const;

export type LeviSpacingToken = keyof typeof spacing;
