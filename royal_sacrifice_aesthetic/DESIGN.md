---
name: Royal Sacrifice Aesthetic
colors:
  surface: '#121414'
  surface-dim: '#121414'
  surface-bright: '#37393a'
  surface-container-lowest: '#0c0f0f'
  surface-container-low: '#1a1c1c'
  surface-container: '#1e2020'
  surface-container-high: '#282a2b'
  surface-container-highest: '#333535'
  on-surface: '#e2e2e2'
  on-surface-variant: '#d5c4ab'
  inverse-surface: '#e2e2e2'
  inverse-on-surface: '#2f3131'
  outline: '#9e8f78'
  outline-variant: '#514532'
  surface-tint: '#ffba20'
  primary: '#ffdca1'
  on-primary: '#412d00'
  primary-container: '#ffb800'
  on-primary-container: '#6b4c00'
  inverse-primary: '#7c5800'
  secondary: '#c8c6c5'
  on-secondary: '#313030'
  secondary-container: '#474746'
  on-secondary-container: '#b7b5b4'
  tertiary: '#ffd7d5'
  on-tertiary: '#680011'
  tertiary-container: '#ffb0ae'
  on-tertiary-container: '#a60022'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdea8'
  primary-fixed-dim: '#ffba20'
  on-primary-fixed: '#271900'
  on-primary-fixed-variant: '#5e4200'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#ffdad8'
  tertiary-fixed-dim: '#ffb3b1'
  on-tertiary-fixed: '#410007'
  on-tertiary-fixed-variant: '#92001c'
  background: '#121414'
  on-background: '#e2e2e2'
  surface-variant: '#333535'
typography:
  display-lg:
    fontFamily: EB Garamond
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: 0.02em
  headline-lg:
    fontFamily: EB Garamond
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: EB Garamond
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  gutter: 16px
  margin-mobile: 20px
  margin-desktop: 64px
  hud-padding: 12px
---

## Brand & Style
The design system centers on the "Royal Ram" motif, elevating the traditional Eid al-Adha festivities into a premium, high-stakes visual narrative. The brand personality is one of "Sophisticated Vitality"—balancing the reverence of the holiday with the dynamic energy of a chase. 

The design style is a hybrid of **Glassmorphism** and **Corporate Modern**, utilizing deep, translucent layers to create a sense of infinite depth. We evoke an emotional response of "Exclusivity and Urgency," utilizing sharp contrasts between luxurious gold accents and dark, moody surfaces to highlight the interplay between the butcher and the sheep.

## Colors
The palette is rooted in "Luxor Modern" aesthetics. The primary gold (#ffb800) represents royalty and the value of the sacrifice, used exclusively for focal points and active states. The "Butcher vs Sheep" contrast is achieved through a deep charcoal secondary base (#1a1a1a) set against a high-alert tertiary red (#e63946) for critical chase elements. 

Surfaces are treated as premium dark glass, ensuring that gold accents appear to glow from within the UI. Use pure white sparingly for high-readability labels and icons.

## Typography
This design system employs a high-contrast typographic pairing. **EB Garamond** provides the "Royal" serif foundation, used for "EID MUBARAK" headings and major section titles to convey tradition and luxury. **Hanken Grotesk** is utilized for all functional labels, body copy, and HUD data points, providing a contemporary, technical edge that balances the classical serif.

For mobile, display sizes scale down to maintain layout integrity while preserving the tall x-height of the serif headings. All labels should use uppercase styling with increased letter spacing to enhance the premium feel.

## Layout & Spacing
The layout follows a **Fixed Grid** model for content containers, providing a structured, cinematic frame for the visual motifs. On desktop, a 12-column grid is used with generous 64px margins to allow the "Royal Ram" imagery room to breathe. 

The "Minimalist HUD" elements ignore the standard grid, instead anchoring to the viewport corners with consistent "hud-padding" (12px). Spacing follows a strict 8px rhythmic scale to ensure mathematical precision in the glassmorphic card stacks.

## Elevation & Depth
Depth is communicated through **Glassmorphism** and extreme backdrop blurs. Foreground elements (like the "Sheep Chase" HUD) exist on the highest plane, featuring a 25px backdrop-blur and a subtle 1px inner gold border to simulate light catching the edge of the glass.

Lower levels use tonal layering with deep, diffused shadows (0px 20px 40px rgba(0,0,0,0.5)) to create a sense of weight. Surface-container tiers are separated by varying levels of opacity rather than solid color changes, maintaining the "Luxor Modern" premium feel.

## Shapes
The shape language is "Rounded" (0.5rem base), creating a sophisticated balance between the sharp efficiency of the chase and the soft, organic nature of the festive theme. Buttons use a higher radius (rounded-lg) to feel more "touchable" and premium, while glassmorphic containers maintain the standard roundedness to keep the UI grounded and structural.

## Components
- **Premium Glass Cards:** Feature a 25px backdrop-blur and 10% white fill. Must include a 0.5px gold (#ffb800) stroke on the top and left edges to simulate "Royal" lighting.
- **High-Contrast Action Buttons:** Solid Gold (#ffb800) background with black (#000000) Hanken Grotesk bold text. These are the primary interactive elements for the "Butcher vs Sheep" chase.
- **Minimalist HUD Elements:** Floating countdown timers and score counters. These use a transparent background with a heavy blur and white text, positioned in the top-right or top-left corners with no surrounding borders.
- **Royal Lists:** List items are separated by a 1px gradient line (Gold to Transparent) to reinforce the Eid al-Adha luxury context.
- **Input Fields:** Dark, recessed glass with gold focus states. Placeholder text uses "Eid Mubarak to You & Your Loved Ones" as the default contextual prompt where applicable.