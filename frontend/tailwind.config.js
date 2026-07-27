/**
 * Design tokens — the C.H.A.O.S visual language, taken from the approved mockups.
 *
 * Values live here rather than inline in components so a screen matches the design without
 * anyone eyedropping a PNG, and so a palette change is one edit instead of ninety.
 *
 * ⚠️ TWO TOKEN GROUPS ARE LOAD-BEARING, NOT DECORATIVE:
 *
 * 1. `allocation.*` — the four allocation states. `over` MUST stay visually distinct from `full`
 *    (U1-NFR-U-05). Someone at 100% and someone at 130% reading the same colour is the single
 *    failure this application exists to prevent.
 *
 * 2. `heat.*` — the five-step capacity scale. The steps are BUCKETED, not a continuous gradient,
 *    because the grid is scanned rather than read: a reader needs "free / light / busy / full /
 *    over" at a glance, and forty shades of teal cannot be told apart in a 20px cell.
 *
 * Colour is never the ONLY carrier of either signal — cells print their percentage, AllocationBar
 * breaks its track past 100% — because roughly 1 in 12 men cannot separate teal from red.
 *
 * NAMING: `flag` (not `amber`), `faded` (not `gray`), `good`/`danger` (not `green`/`red`).
 * Overriding a Tailwind default palette with a partial one silently breaks any existing shade the
 * codebase already uses — `text-amber-800` with no `amber-800` defined renders as nothing.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Jost is self-hosted via @fontsource (see index.css) — NOT a Google Fonts <link>. This
        // app is served by Caddy on a LAN with no guaranteed outbound internet, so a CDN font
        // would fall back to Arial on exactly the deployment it ships to.
        sans: ['Jost', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },

      colors: {
        /** Brand teal. The interactive / primary colour. */
        brand: {
          50: '#DFF4F4',
          100: '#A7E2E2',
          200: '#7BD5D6',
          300: '#4FE0E2', // sidebar active text — has to lift off #1F2233
          400: '#26C4C6',
          500: '#00B3B5', // primary
          600: '#00898B', // primary TEXT on white; #00B3B5 alone is too light to read
          700: '#20585A',
          800: '#0E3B3B',
        },

        /** The dark chrome: sidebar, and the deepest text on light surfaces. */
        ink: {
          DEFAULT: '#1F2233',
          soft: '#2A2E42',
          muted: '#5D586C',
        },

        /** Neutrals, warm-violet to match the mockups rather than Tailwind's cool slate. */
        canvas: {
          DEFAULT: '#F4F3F7', // app background
          deep: '#EDEBF2', // outside the app frame
          sunken: '#F8F7FB', // inset rows inside a card
        },
        line: {
          DEFAULT: '#E7E5EE', // card and header borders
          strong: '#E0DEE8', // input borders
          soft: '#F1F0F5', // list dividers
          faint: '#F4F3F7', // the lightest divider
        },
        faded: {
          DEFAULT: '#8B8B8B', // secondary text
          soft: '#A8AAAE', // placeholders, faint labels
          faint: '#B9B6C4', // empty-cell glyphs
          ghost: '#C2BFCC', // past-period labels
        },

        /** Semantic. `flag` is the "needs a decision" tone — never an error. */
        flag: {
          400: '#FECD3D',
          600: '#C9A93A',
          800: '#8A6A00', // the only amber that passes contrast on white
        },
        danger: {
          500: '#E12E2E',
          700: '#C41F1F',
        },
        good: {
          500: '#12B76A',
          700: '#0E8A50',
        },

        /**
         * Allocation state palette. Over-allocation is deliberately distinct from "full" so the
         * two never read the same at a glance (U1-NFR-U-05).
         */
        allocation: {
          free: '#12B76A',
          partial: '#A7E2E2',
          full: '#00B3B5',
          over: '#E12E2E',
        },

        /**
         * The five-step heat scale. Each step pairs a background with the `-fg` that passes
         * contrast ON it — pairing them here is what stops a cell shipping teal-on-teal.
         */
        heat: {
          0: '#F1F0F5',
          '0-fg': '#B9B6C4',
          1: '#DFF4F4',
          '1-fg': '#20585A',
          2: '#A7E2E2',
          '2-fg': '#0E3B3B',
          3: '#00B3B5',
          '3-fg': '#FFFFFF',
          4: '#E12E2E',
          '4-fg': '#FFFFFF',
        },

        /**
         * Categorical colours for avatars and project bars. Ordered for maximum separation
         * between ADJACENT entries, because adjacency is where confusion happens.
         */
        series: {
          1: '#00B3B5',
          2: '#6C5CE7',
          3: '#FECD3D',
          4: '#FF8A48',
          5: '#12B76A',
          6: '#3D8BFD',
          7: '#E0729C',
          8: '#A8AAAE',
        },
      },

      borderRadius: {
        // 6px on cards, 4px on cells — deliberately tighter than Tailwind's default, which reads
        // softer and friendlier than this product should.
        card: '6px',
        cell: '4px',
      },

      boxShadow: {
        card: '0 4px 18px rgba(75,70,92,.1)',
        raised: '0 1px 2px rgba(75,70,92,.14)',
        modal: '0 20px 48px rgba(31,34,51,.28)',
      },

      letterSpacing: {
        label: '.04em',
      },
    },
  },
  plugins: [],
};
