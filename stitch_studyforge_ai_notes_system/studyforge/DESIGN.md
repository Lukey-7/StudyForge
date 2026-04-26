---
name: StudyForge
colors:
  surface: '#131315'
  surface-dim: '#131315'
  surface-bright: '#39393b'
  surface-container-lowest: '#0e0e10'
  surface-container-low: '#1c1b1d'
  surface-container: '#201f22'
  surface-container-high: '#2a2a2c'
  surface-container-highest: '#353437'
  on-surface: '#e5e1e4'
  on-surface-variant: '#cbc3d7'
  inverse-surface: '#e5e1e4'
  inverse-on-surface: '#313032'
  outline: '#958ea0'
  outline-variant: '#494454'
  surface-tint: '#d0bcff'
  primary: '#d0bcff'
  on-primary: '#3c0091'
  primary-container: '#a078ff'
  on-primary-container: '#340080'
  inverse-primary: '#6d3bd7'
  secondary: '#cdc0ed'
  on-secondary: '#342b4f'
  secondary-container: '#4d4369'
  on-secondary-container: '#bfb2de'
  tertiary: '#c3d000'
  on-tertiary: '#2f3300'
  tertiary-container: '#8e9800'
  on-tertiary-container: '#292c00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#d0bcff'
  on-primary-fixed: '#23005c'
  on-primary-fixed-variant: '#5516be'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#cdc0ed'
  on-secondary-fixed: '#1f1538'
  on-secondary-fixed-variant: '#4b4166'
  tertiary-fixed: '#dfed1a'
  tertiary-fixed-dim: '#c3d000'
  on-tertiary-fixed: '#1b1d00'
  on-tertiary-fixed-variant: '#454a00'
  background: '#131315'
  on-background: '#e5e1e4'
  surface-variant: '#353437'
typography:
  display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  h1:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  h3:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: '0'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: '0'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: '0'
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: '0'
  mono-label:
    fontFamily: monospace
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  xs: 0.25rem
  sm: 0.5rem
  md: 1rem
  lg: 1.5rem
  xl: 2rem
  gutter: 1.5rem
  margin: 2rem
---

## Brand & Style

The design system is engineered for high-focus academic productivity. It utilizes a sophisticated blend of **Minimalism** and **Glassmorphism**, emphasizing high-precision interface elements that disappear to let content lead. The aesthetic is inspired by professional developer tools, favoring density and clarity over decorative elements. 

The emotional response is one of "calm authority"—a dark, focused environment that reduces eye strain during long study sessions. By combining deep zinc tones with frosted glass layers and sharp violet accents, the interface feels both premium and utilitarian.

## Colors

The palette is anchored by a near-black foundation to provide maximum contrast for the glass layers. 

- **Primary Accent:** Violet (#8B5CF6) is reserved for primary actions, progress indicators, and active states. 
- **Secondary/Tertiary:** High-fidelity tones from the brand palette (#DFD1FF and #E4F222) are used sparingly for categorization, badges, and success states.
- **Glass Surfaces:** Surfaces are constructed using a semi-transparent Zinc base with a 1px internal border (stroke) to simulate light catching the edge of the glass.
- **Typography:** Text follows a strict hierarchy of #FAFAFA for headers and #A1A1AA for supporting metadata.

## Typography

This design system relies on **Inter** for all UI and body text, utilizing its variable weights to create hierarchy without color shifts. 

For technical metadata, code snippets, or study session timers, a secondary **Monospace** font (inspired by Berkeley Mono) is employed to provide a "technical" and "precise" feel. 

- **Headlines:** Should use tighter letter spacing and heavier weights to maintain impact against the dark background.
- **Body Text:** Uses a slightly increased line height (1.6) to improve readability in a dark-mode environment.
- **Labels:** Small caps or monospaced labels are used for metadata such as timestamps or tags.

## Layout & Spacing

The layout philosophy follows a **Fixed Grid** model for the main content area (max-width: 1200px) to maintain focus, centered within a fluid viewport. 

- **Grid:** A 12-column grid system is used for dashboard layouts.
- **Rhythm:** An 8px base unit (4px for micro-adjustments) ensures consistent alignment.
- **Density:** High information density is preferred. Components should utilize minimal padding to maximize screen real estate for notes and resources.

## Elevation & Depth

Depth is communicated through **Backdrop Blurs** and **Tonal Layering** rather than traditional drop shadows.

- **The Base:** The #09090B background is the lowest level.
- **Glass Cards:** Elements sit on the background with a `backdrop-filter: blur(12px)` and a 60% opaque Zinc surface.
- **Floating Elements:** Modals or tooltips use a higher blur (20px) and a slightly lighter surface color to appear closer to the user.
- **Borders:** Every glass element must have a 1px solid border at 8% opacity (White) to define the shape against the dark background.

## Shapes

The shape language is "Soft" yet geometric. Large corner radii are avoided to maintain the professional, high-precision aesthetic.

- **Standard Elements:** Buttons, inputs, and small cards use a 4px (0.25rem) radius.
- **Large Containers:** Main content cards use an 8px (0.5rem) radius.
- **Pill Elements:** Only used for status indicators or specific "Tag" components to differentiate them from interactive buttons.

## Components

- **Cards:** The signature component. Constructed with `background: rgba(24, 24, 27, 0.6)`, `backdrop-filter: blur(12px)`, and a `1px solid rgba(255, 255, 255, 0.08)` border. No outer shadows.
- **Buttons:** 
  - *Primary:* Solid #8B5CF6 with #FAFAFA text. 
  - *Secondary:* Ghost style with the 1px glass border and #FAFAFA text.
- **Input Fields:** Darker than the card background, subtle 1px border that glows violet on focus. Text should be #FAFAFA.
- **Chips/Tags:** Small, monospaced text. Background is a desaturated version of the accent color at 10% opacity.
- **Lists:** Rows separated by 1px borders (#FFFFFF at 4% opacity). Hover states should use a subtle highlight: `rgba(255, 255, 255, 0.03)`.
- **Navigation:** Vertical sidebar using secondary text (#A1A1AA) with active states highlighted by a small 2px vertical violet bar and primary text color.