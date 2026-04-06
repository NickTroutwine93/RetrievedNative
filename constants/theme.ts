/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0B5CAB';
const tintColorDark = '#8DBBFF';

export const Colors = {
  light: {
    text: '#13283B',
    textSecondary: '#3F5568',
    textMuted: '#607789',
    background: '#F4F7FB',
    surface: '#FFFFFF',
    surfaceMuted: '#EAF1F8',
    border: '#C6D4E3',
    primary: '#0B5CAB',
    primaryStrong: '#094A89',
    onPrimary: '#FFFFFF',
    success: '#1F7A3E',
    warning: '#8A5A00',
    danger: '#8F2D2D',
    overlay: 'rgba(8, 20, 33, 0.36)',
    tint: tintColorLight,
    icon: '#5A6E81',
    tabIconDefault: '#5A6E81',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#EAF2FB',
    textSecondary: '#B2C5DA',
    textMuted: '#90A5BC',
    background: '#0D1520',
    surface: '#132231',
    surfaceMuted: '#1A2D40',
    border: '#28415A',
    primary: '#8DBBFF',
    primaryStrong: '#6AA4F7',
    onPrimary: '#071523',
    success: '#67D28F',
    warning: '#F0B768',
    danger: '#F28D8D',
    overlay: 'rgba(2, 8, 14, 0.6)',
    tint: tintColorDark,
    icon: '#9CB2C8',
    tabIconDefault: '#9CB2C8',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
