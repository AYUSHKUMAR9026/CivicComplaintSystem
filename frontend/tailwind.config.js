/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sky mint: the main interactive color on the dark interface.
        primary: {
          50: '#effffc',
          100: '#d3faf3',
          200: '#b0f3e8',
          300: '#88e9dc',
          400: '#65dece',
          500: '#3bc7ba',
          600: '#29a99f',
          700: '#20877f',
          800: '#1c6763',
          900: '#184d4b',
          950: '#0c302f',
        },
        // Cool sky for supporting graphics; gold is reserved for highlights.
        accent: {
          50: '#effaff',
          100: '#daf3fd',
          200: '#b9e8f9',
          300: '#94d8f0',
          400: '#75c9e7',
          500: '#4aadd5',
          600: '#358eb6',
          700: '#2c7292',
          800: '#285c75',
          900: '#244b5e',
        },
        // Warm gold for highlights and warning states.
        warm: {
          50: '#fffaf0',
          100: '#f9edce',
          200: '#efd99d',
          300: '#e8c879',
          400: '#dfb65c',
          500: '#c99a40',
          600: '#ab7f31',
          700: '#856327',
          800: '#654d23',
          900: '#4a3a20',
        },
        // Priority Colors
        priority: {
          high: {
            bg: 'rgba(239, 68, 68, 0.1)',
            border: 'rgba(239, 68, 68, 0.25)',
            text: '#ef4444',
            icon: '#f87171',
          },
          medium: {
            bg: 'rgba(245, 158, 11, 0.1)',
            border: 'rgba(245, 158, 11, 0.25)',
            text: '#f59e0b',
            icon: '#fbbf24',
          },
          low: {
            bg: 'rgba(16, 185, 129, 0.1)',
            border: 'rgba(16, 185, 129, 0.25)',
            text: '#10b981',
            icon: '#34d399',
          },
        },
        // Status Colors
        status: {
          submitted: { bg: 'rgba(245, 158, 11, 0.1)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.25)' },
          prioritized: { bg: 'rgba(251, 146, 60, 0.1)', text: '#fb923c', border: 'rgba(251, 146, 60, 0.25)' },
          assigned: { bg: 'rgba(101, 222, 206, 0.1)', text: '#88e9dc', border: 'rgba(101, 222, 206, 0.25)' },
          in_progress: { bg: 'rgba(117, 201, 231, 0.1)', text: '#94d8f0', border: 'rgba(117, 201, 231, 0.25)' },
          resolved: { bg: 'rgba(16, 185, 129, 0.1)', text: '#34d399', border: 'rgba(16, 185, 129, 0.25)' },
          rejected: { bg: 'rgba(239, 68, 68, 0.1)', text: '#f87171', border: 'rgba(239, 68, 68, 0.25)' },
        },
        // Near-black surfaces with subtle green-neutral elevation.
        surface: {
          DEFAULT: '#0b1011',
          elevated: '#080c0d',
          hover: '#1b2627',
          card: '#11191a',
          paper: '#192324',
          glass: 'rgba(17, 25, 26, 0.86)',
        },
        border: {
          DEFAULT: 'rgba(180, 220, 213, 0.10)',
          strong: 'rgba(180, 220, 213, 0.19)',
          subtle: 'rgba(180, 220, 213, 0.06)',
          glow: 'rgba(101, 222, 206, 0.28)',
        },
        text: {
          primary: '#eef8f5',
          secondary: '#a9beb9',
          muted: '#78908a',
          inverse: '#0b1011',
        },
      },
      fontFamily: {
        sans: ['"Inter"', '"Space Grotesk"', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['"Space Grotesk"', '"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'heading-xl': ['2.5rem', { lineHeight: '1.15', letterSpacing: '-0.03em', fontWeight: '700' }],
        'heading-lg': ['2rem', { lineHeight: '1.2', letterSpacing: '-0.025em', fontWeight: '700' }],
        'heading-md': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.02em', fontWeight: '600' }],
        'heading-sm': ['1.25rem', { lineHeight: '1.35', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body-lg': ['1.125rem', { lineHeight: '1.6' }],
        'body': ['1rem', { lineHeight: '1.6' }],
        'body-sm': ['0.875rem', { lineHeight: '1.5' }],
        'caption': ['0.75rem', { lineHeight: '1.5', letterSpacing: '0.03em' }],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      boxShadow: {
        'card': '0 12px 30px -20px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(238, 248, 245, 0.025)',
        'card-hover': '0 18px 42px -20px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(101, 222, 206, 0.14)',
        'elevated': '0 22px 60px -24px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(180, 220, 213, 0.08)',
        'glow-primary': '0 8px 28px -12px rgba(101, 222, 206, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.22)',
        'glow-accent': '0 8px 28px -12px rgba(117, 201, 231, 0.32)',
        'glow-warm': '0 8px 28px -12px rgba(223, 182, 92, 0.3)',
        'inner-glow': 'inset 0 1px 0 rgba(238, 248, 245, 0.04)',
      },
      borderRadius: {
        'card': '16px',
        'button': '10px',
        'input': '10px',
        'badge': '7px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-soft': 'pulseSoft 2s infinite',
        'glow': 'glowPulse 3s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
        'gradient-x': 'gradientX 15s ease infinite',
        'indeterminate-bar': 'indeterminateBar 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(101, 222, 206, 0.1)' },
          '50%': { boxShadow: '0 0 40px rgba(101, 222, 206, 0.25)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        gradientX: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        indeterminateBar: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(300%)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'mesh-gradient': 'radial-gradient(at 10% 0%, rgba(101, 222, 206, 0.09) 0px, transparent 40%), radial-gradient(at 90% 0%, rgba(117, 201, 231, 0.06) 0px, transparent 44%), radial-gradient(at 70% 100%, rgba(223, 182, 92, 0.04) 0px, transparent 40%)',
      },
    },
  },
  plugins: [],
}
