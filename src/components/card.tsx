import type { StyleProp, ViewProps, ViewStyle } from 'react-native';

import { GradientCard } from '@/components/gradient-card';

interface CardProps extends ViewProps {
  /** `raised` adds a touch more lift; `brand` fills with the hero gradient. */
  variant?: 'surface' | 'raised' | 'brand';
  glow?: string;
}

/**
 * A padded, rounded, layered surface used to group content. Now a thin wrapper
 * over `GradientCard` so every existing screen inherits the gradient sheen,
 * soft shadow, and depth for free. Passed `style` lands on the content layer
 * (where layout/gap/align is expected), matching the old flat-card behavior.
 */
export function Card({ style, variant = 'surface', glow, ...props }: CardProps) {
  return (
    <GradientCard variant={variant} glow={glow} contentStyle={style as StyleProp<ViewStyle>} {...props} />
  );
}
