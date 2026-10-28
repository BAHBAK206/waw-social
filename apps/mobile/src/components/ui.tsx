import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { fileUrl } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { type FONT, useTheme } from '@/lib/theme';

type Weight = keyof typeof FONT;

export function Text({
  weight = 'regular',
  size = 15,
  color,
  muted,
  style,
  ...rest
}: TextProps & { weight?: Weight; size?: number; color?: string; muted?: boolean }) {
  const t = useTheme();
  const px = size * t.textScale;
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: t.fonts[weight],
          fontSize: px,
          color: color ?? (muted ? (t.highContrast ? t.text2 : t.text3) : t.text),
          writingDirection: 'auto',
        },
        t.dyslexic ? { lineHeight: Math.round(px * 1.65), letterSpacing: t.latin ? px * 0.04 : 0 } : null,
        style,
      ]}
    />
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.cardSolid,
    borderRadius: t.radiusCard,
    borderWidth: t.highContrast ? 2 : StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [base, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'soft' | 'outline' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const t = useTheme();
  const off = disabled || loading;
  const bg = variant === 'primary' ? t.primary : variant === 'danger' ? t.errFill : variant === 'soft' ? t.primarySoft : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? t.onPrimary : variant === 'ghost' ? t.text2 : t.primaryInk;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        {
          minHeight: small ? 36 : 48,
          paddingHorizontal: small ? 12 : 18,
          borderRadius: t.radiusControl,
          backgroundColor: bg,
          borderWidth: variant === 'outline' ? 1.5 : 0,
          borderColor: t.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: off ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text weight="bold" color={fg} size={small ? 13 : 15}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Input({ label, error, style, ...rest }: TextInputProps & { label?: string; error?: string | null }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text weight="bold" size={13} muted>
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={t.text3}
        accessibilityLabel={label}
        {...rest}
        style={[
          {
            minHeight: 48,
            borderRadius: t.radiusControl,
            borderWidth: t.highContrast ? 2 : 1.5,
            borderColor: error ? t.err : t.border,
            backgroundColor: t.bg2,
            paddingHorizontal: 14,
            paddingVertical: 10,
            color: t.text,
            fontFamily: t.fonts.regular,
            fontSize: 15 * t.textScale,
            textAlign: 'auto',
          },
          style,
        ]}
      />
      {error ? (
        <Text size={12} color={t.err} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const t = useTheme();
  const parts = name.trim().split(/\s+/);
  const initials = (parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '');
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  if (url)
    return (
      <Image
        source={{ uri: fileUrl(url) }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg3 }}
        accessibilityIgnoresInvertColors
      />
    );
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${h}, 55%, 42%)`, alignItems: 'center', justifyContent: 'center' }}>
      <Text weight="bold" size={size * 0.36} color="#fff">
        {initials.toUpperCase()}
      </Text>
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={{
        paddingHorizontal: 14,
        minHeight: 36,
        borderRadius: 18,
        justifyContent: 'center',
        backgroundColor: active ? t.primary : t.bg3,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? t.primary : t.border,
      }}
    >
      <Text weight="bold" size={13} color={active ? t.onPrimary : t.text2}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Loading() {
  const t = useTheme();
  const tr = useT();
  return (
    <View style={{ padding: 40, alignItems: 'center' }} accessibilityLabel={tr.t('common.loading')}>
      <ActivityIndicator color={t.primary} size="large" />
    </View>
  );
}

export function Empty({ title, body, icon = 'file-tray-outline' }: { title: string; body?: string; icon?: ComponentProps<typeof Ionicons>['name'] }) {
  const t = useTheme();
  return (
    <View style={{ padding: 40, alignItems: 'center', gap: 8 }}>
      <Ionicons name={icon} size={44} color={t.text3} />
      <Text weight="bold" size={17} style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {body ? (
        <Text muted style={{ textAlign: 'center' }}>
          {body}
        </Text>
      ) : null}
    </View>
  );
}

export function ErrorView({ onRetry }: { error?: unknown; onRetry?: () => void }) {
  const tr = useT();
  return (
    <View style={{ padding: 32, alignItems: 'center', gap: 12 }}>
      <Ionicons name="cloud-offline-outline" size={44} color="#888" />
      <Text style={{ textAlign: 'center' }} muted>
        {tr.t('errors.network')}
      </Text>
      {onRetry ? <Button title={tr.t('common.retry')} variant="soft" small onPress={onRetry} /> : null}
    </View>
  );
}

export function GradientHeader({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <LinearGradient
      colors={t.mode === 'dark' ? t.gradientDark : t.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ padding: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }, style]}
    >
      {children}
    </LinearGradient>
  );
}

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 8 }}>
      <Text weight="black" size={18}>
        {children}
      </Text>
      {action}
    </View>
  );
}

export type { TextStyle };
