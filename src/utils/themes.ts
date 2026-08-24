import { ThemeId } from '../types';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  hint: string;
  /** Mini palette preview: [page, surface, accent, text]. */
  swatch: [string, string, string, string];
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'midnight',
    label: 'Midnight',
    hint: 'The original Geist dark',
    swatch: ['#000000', '#141414', '#3291ff', '#ededed']
  },
  {
    id: 'daylight',
    label: 'Daylight',
    hint: 'Paper light mode',
    swatch: ['#f7f7f8', '#ffffff', '#0069db', '#1b1b1f']
  },
  {
    id: 'nord',
    label: 'Nord',
    hint: 'Polar-night blues',
    swatch: ['#2e3440', '#3b4252', '#88c0d0', '#eceff4']
  },
  {
    id: 'dracula',
    label: 'Dracula',
    hint: 'Purple night, neon accents',
    swatch: ['#21222c', '#2f3141', '#bd93f9', '#f8f8f2']
  }
];

/** Status-bar / browser chrome color per theme (PWA <meta name="theme-color">). */
export const THEME_CHROME_COLOR: Record<ThemeId, string> = {
  midnight: '#000000',
  daylight: '#f7f7f8',
  nord: '#2e3440',
  dracula: '#21222c'
};

export function isThemeId(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}
