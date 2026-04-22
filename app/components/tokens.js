// Design tokens — lifted from existing styles.css so the hi-fi prototype
// matches the implementation 1:1.
const TOKENS = {
  color: {
    bg: '#0a0a0f',
    bgGrad1: '#0b0b12',
    bgGrad2: '#07070c',
    card: 'rgba(255,255,255,0.04)',
    cardHover: 'rgba(255,255,255,0.06)',
    cardBorder: 'rgba(255,255,255,0.07)',
    cardBorderStrong: 'rgba(255,255,255,0.12)',
    text: '#ecedf3',
    textDim: '#8a8c99',
    textMute: '#5d6070',
    accent: '#7c5cff',
    accentHover: '#8d72ff',
    accent2: '#22d3ee',
    green: '#34d399',
    red: '#f87171',
    amber: '#fbbf24',
    providers: {
      'claude-code': ['#ef9f6d', '#d97757'],
      'codex': ['#22c9a0', '#10a37f'],
      'gemini-cli': ['#4285f4', '#7c5cff'],
      'gemini': ['#4285f4', '#7c5cff'],
      openai: ['#10a37f', '#0d8a6a'],
      anthropic: ['#d97757', '#b85f3f'],
      deepseek: ['#4d6bfe', '#3552d8'],
      openrouter: ['#8a7fff', '#5d4bff'],
    },
  },
  radii: [7, 8, 10, 14, 16],
  space: [4, 6, 8, 10, 12, 14, 16, 18, 24, 32, 48],
  type: {
    family: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
    sizes: { xxs: 9.5, xs: 10, xs2: 10.5, sm: 11, sm2: 11.5, base: 12, base2: 12.5, md: 13, lg: 14 },
  },
};
window.TOKENS = TOKENS;
