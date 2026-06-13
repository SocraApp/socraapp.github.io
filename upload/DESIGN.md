---
name: Socra
colors:
  surface: '#fbf9f9'
  surface-dim: '#dbd9da'
  surface-bright: '#fbf9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f4'
  surface-container: '#efedee'
  surface-container-high: '#e9e8e8'
  surface-container-highest: '#e4e2e3'
  on-surface: '#1b1c1c'
  on-surface-variant: '#43474b'
  inverse-surface: '#303031'
  inverse-on-surface: '#f2f0f1'
  outline: '#73787b'
  outline-variant: '#c3c7cb'
  surface-tint: '#4f616c'
  primary: '#273944'
  on-primary: '#ffffff'
  primary-container: '#3e505b'
  on-primary-container: '#afc2cf'
  inverse-primary: '#b6c9d6'
  secondary: '#5e5e5c'
  on-secondary: '#ffffff'
  secondary-container: '#e1dfdc'
  on-secondary-container: '#636360'
  tertiary: '#47331e'
  on-tertiary: '#ffffff'
  tertiary-container: '#604933'
  on-tertiary-container: '#d9b99d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d2e5f3'
  primary-fixed-dim: '#b6c9d6'
  on-primary-fixed: '#0b1e27'
  on-primary-fixed-variant: '#374954'
  secondary-fixed: '#e4e2de'
  secondary-fixed-dim: '#c8c6c3'
  on-secondary-fixed: '#1b1c1a'
  on-secondary-fixed-variant: '#474744'
  tertiary-fixed: '#fedcbf'
  tertiary-fixed-dim: '#e1c1a4'
  on-tertiary-fixed: '#291806'
  on-tertiary-fixed-variant: '#59422d'
  background: '#fbf9f9'
  on-background: '#1b1c1c'
  surface-variant: '#e4e2e3'
typography:
  h1:
    fontFamily: Inter
    fontSize: 42px
    fontWeight: '650'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  h3:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.8'
    letterSpacing: '0'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: '0'
  label-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.02em
  h1-mobile:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '650'
    lineHeight: '1.2'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  nav_height: 64px
  max_width: 1200px
  split_markdown: 58%
  split_chat: 42%
  gutter: 32px
  container_padding: 40px
---

## Brand & Style
The design system is built on a philosophy of "95% neutral, 5% identity." It prioritizes deep focus, cognitive clarity, and structural rigor. The brand personality is calm, intelligent, and trustworthy—acting as a silent partner to the user's thought process rather than a distraction.

The visual style is **Sophisticated Minimalism**. It avoids the artifice of shadows and gradients in favor of structural integrity, precise borders, and intentional whitespace. The emotional response should be one of "quiet productivity," drawing inspiration from high-end stationery and academic journals. The signature element, the "Active Thought," provides the only significant break from the neutral palette, signaling where the user's attention should reside.

## Colors
The palette is intentionally restrained to prevent visual fatigue during long sessions of thinking and writing.

- **Foundational Neutrals:** Pure White (#FFFFFF) is reserved for the primary writing canvas (Markdown panel) and logo backgrounds. The Chat Background (#FAFAFA) provides a subtle shift in depth to distinguish between "thinking" (chat) and "output" (document).
- **The Socra Accent:** A sophisticated **Sage Indigo (#4A5D4E)**. This is used sparingly: for the primary action button (Send) and the "Active Thought" indicator. It represents growth and stability.
- **Selection & Highlighting:** A subtle beige highlight (#F5F3EF) is used for text selection and hover states, echoing the feel of a physical highlighter on cream paper.
- **Structural Lines:** Borders utilize three specific tiers of gray (#F1F1F1, #E8E8E8) to create hierarchy without using weight.

## Typography
Typography is the primary vehicle for the design system's intelligence. **Inter** is used for its exceptional legibility and systematic feel.

- **Readability First:** The body text is set to 18px with a generous 1.8 line-height. This "airy" vertical rhythm is critical for reducing the cognitive load of dense information.
- **Tight Headers:** Headlines use a tighter tracking (letter-spacing) and a heavier weight (650 for H1) to provide a sturdy anchor for the content that follows.
- **Micro-Copy:** Labels and UI metadata are set in 13px uppercase with increased tracking to ensure they feel distinct from the narrative text.

## Layout & Spacing
The layout follows a **structured split-pane model** optimized for a 1440px desktop viewport.

- **The Workspace:** Content is centered within a 1200px container to prevent excessive line lengths that hinder readability.
- **The 58/42 Split:** The layout is divided asymmetrically. The Markdown panel (the output) occupies 58% of the width, while the Chat panel (the process) occupies 42%. This reinforces the idea that the chat is a support tool for the primary work.
- **Navigation:** A fixed 64px top navigation bar provides global context and breadcrumbs.
- **Mobile Adaptation:** On mobile devices, the split-pane collapses into a tabbed view (Toggle between "Draft" and "Chat"), maintaining the same 18px body font size to ensure accessibility.

## Elevation & Depth
This design system avoids traditional shadows to maintain its minimalist and structured aesthetic. Depth is communicated through **Tonal Layering** and **Line Work**.

- **Level 0 (Base):** The Markdown canvas (#FFFFFF).
- **Level 1 (Inset):** The Chat panel and sidebar (#FAFAFA), creating a subtle "step down" from the main canvas.
- **The "Active Thought" Signature:** This is the primary depth indicator. It consists of a 2px vertical accent line (#4A5D4E) on the left of an element, accompanied by a very faint 2% opacity tint of the accent color across the background of the active block.
- **Outlines:** Low-contrast borders (#F1F1F1) are used to define regions without creating heavy visual boxes.

## Shapes
The shape language is **Soft and Precise**. 

We use a 0.25rem (4px) base radius for buttons and input fields to maintain a professional, slightly architectural feel. Larger components like the "Composer" or "Cards" utilize 0.5rem (8px). This small degree of rounding prevents the UI from feeling "sharp" or "hostile" while remaining much more disciplined than a pill-shaped or highly rounded design.

## Components
- **Buttons:** Primary buttons use the Socra Accent color (#4A5D4E) with white text. Secondary buttons are ghost-style with an #E8E8E8 border and charcoal text. 
- **The Composer:** The main input area for thoughts. It features an #E8E8E8 border that darkens slightly on focus. No shadows are used on focus; instead, the border weight increases or the color shifts to the Socra Accent.
- **Active Thought Indicator:** A block-level component with a 2px left-border (Accent color) and a subtle beige background tint (#F5F3EF). This is used to highlight the specific paragraph or chat message the AI/User is currently focused on.
- **Chips:** Small, #F1F1F1 background with 13px Inter Medium text. Used for tags or status indicators (e.g., "Synthesizing", "Refining").
- **Lists:** Unordered lists use a simple dash (—) rather than a bullet point to maintain the minimalist, editorial feel.
- **Markdown Canvas:** Features generous margins and no visible borders, making the text feel like a clean sheet of paper.