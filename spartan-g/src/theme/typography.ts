import { TextStyle } from 'react-native';

export const fontFamily = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
} as const;

export const typography: Record<string, TextStyle> = {
  h1: { fontSize: fontSize['3xl'], fontWeight: '700', lineHeight: fontSize['3xl'] * lineHeight.tight },
  h2: { fontSize: fontSize['2xl'], fontWeight: '700', lineHeight: fontSize['2xl'] * lineHeight.tight },
  h3: { fontSize: fontSize.xl, fontWeight: '600', lineHeight: fontSize.xl * lineHeight.tight },
  body: { fontSize: fontSize.md, fontWeight: '400', lineHeight: fontSize.md * lineHeight.normal },
  bodySmall: { fontSize: fontSize.sm, fontWeight: '400', lineHeight: fontSize.sm * lineHeight.normal },
  caption: { fontSize: fontSize.xs, fontWeight: '400', lineHeight: fontSize.xs * lineHeight.normal },
  label: { fontSize: fontSize.sm, fontWeight: '600', lineHeight: fontSize.sm * lineHeight.normal },
  button: { fontSize: fontSize.md, fontWeight: '600', lineHeight: fontSize.md * lineHeight.tight },
};
