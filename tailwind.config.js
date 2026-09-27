/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bgMain:    '#FBFAF6', // Warm luxury linen surface
        cardBg:    '#FFFFFF',
        brand: {
          // Live theme color — reads from --brand-black-rgb, set at runtime by
          // src/lib/theme.ts (from the picked shade in Settings > Appearance).
          black:      'rgb(var(--brand-black-rgb) / <alpha-value>)',
          dark:       '#223126',
          gold:       '#7daa8f', // Sage green accent (was gold — this token name is legacy, the color is not actually gold)
          goldHover:  '#5e8c72',
          goldLight:  '#f7f4ed',
          goldBorder: '#ead7b7',
          // Text/icon color for content that sits directly on a brand-black
          // surface — sage (`brand.gold` above) is too close in luminance to
          // the bottle-green background to read clearly there.
          onDark: '#FFFFFF', // buttons, badges & sidebar nav text on a dark background
        },
        gold: {
          DEFAULT: '#7daa8f',
          dark:    '#5f6d59',
          light:   '#f7f4ed',
          border:  '#ead7b7',
        },
        maroon: {
          DEFAULT: '#7daa8f', // Remapped to sage green accent
          dark:    'rgb(var(--brand-black-rgb) / <alpha-value>)', // Remapped to bottle green (live)
          light:   '#f7f4ed',
        },
        // Boutique bottle-green palette (used across storefront components) — live theme color
        forestDark: 'rgb(var(--brand-black-rgb) / <alpha-value>)',
        sage: {
          DEFAULT: '#7daa8f',
          dark:    '#5f6d59',
          deep:    '#1e2817',
        },
        sageDark: '#5f6d59',
        sageDeep: '#1e2817',
        sand: '#ead7b7',
        textMain:  '#111111',
        textMuted: '#6B7280',
        borderLight: '#E5E7EB', // Neutral clean border
      },
      fontFamily: {
        sans:      ['"DM Sans"', '"Outfit"', '"Noto Sans Tamil"', 'system-ui', '-apple-system', 'sans-serif'],
        dmsans:    ['"DM Sans"', 'sans-serif'],
        'dm-sans': ['"DM Sans"', 'sans-serif'],
        outfit:    ['"Outfit"', 'sans-serif'],
        brand:     ['"Cinzel"', '"DM Sans"', '"Outfit"', '"Noto Sans Tamil"', 'serif'],
        headline:  ['"DM Sans"', '"Outfit"', '"Noto Sans Tamil"', 'sans-serif'],
      },
      boxShadow: {
        soft:   '0 1px 3px rgba(0,0,0,0.05)',
        gold:   '0 4px 20px -2px rgba(212, 175, 55, 0.25)',
      },
      borderRadius: {
        'card': '12px',
        'btn': '10px',
        'input': '10px',
        'table': '12px',
      },
      animation: {
        'float': 'float 4s ease-in-out infinite',
        'floatDelay': 'float 4s ease-in-out 1.5s infinite',
        'slideUp': 'slideUp 0.6s ease forwards',
        'fadeIn': 'fadeIn 0.5s ease forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(30px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
