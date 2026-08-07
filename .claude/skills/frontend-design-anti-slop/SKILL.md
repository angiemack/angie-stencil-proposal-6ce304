---
name: frontend-design-anti-slop
description: >
  Creates distinctive, production-grade frontend interfaces with exceptional
  design quality. Use when building any UI component, landing page, dashboard,
  prototype, or when styling HTML/CSS. Avoids generic AI aesthetics (Inter font,
  purple gradients, predictable card layouts).
---
name: frontend-design-anti-slop

## Frontend Design Quality Guard

You tend to produce "AI slop" by default: Inter or system fonts, purple-on-white gradients, symmetric card grids, flat white backgrounds. Break this pattern deliberately.

### Typography
Choose unexpected, characterful typefaces. Pair a distinctive display font (e.g. Playfair Display, DM Serif Display, Syne, Bebas Neue, Instrument Serif) with a refined body font. Never use Inter, Roboto, Arial, or Space Grotesk — they signal zero creative investment.

Adjacent heading levels must be visually distinct: step weight down (h1 bold → h2 semibold → h3 medium) and pair with a color step (foreground → muted-foreground). Never same size and weight for two consecutive levels.

Never positive letter-spacing on lowercase headings or body text — only all-caps labels and badges get widened tracking. Never font-weight 300 for body text. Never apply the display/headline font below 18px.

### Color & Theme
Commit fully to one coherent aesthetic. Use CSS custom properties for every color token. Dominant accent colors with sharp contrast outperform timid palettes. Avoid purple gradients on white — they are the single most recognizable AI default. Try: deep navy + warm amber, charcoal + acid green, cream + burgundy + gold, near-black + electric cyan.

Never use default Tailwind blue (#3b82f6) or an all-gray neutral scale as the entire palette. Never pure black (#000) for text — use a near-black with a slight hue cast.

Express colors in `oklch()` where possible — perceptually uniform lightness steps and vivid gamut-P3 hues.

### Layout & Composition
Asymmetry. Overlap. Diagonal rhythm. Grid-breaking hero elements. Resist centering everything — left-aligned, offset, or edge-bleeding layouts feel more crafted. Never center-align body paragraphs.

Never the generic dark-mode dashboard: near-black background end-to-end, one purple accent, a homepage that is just four sparse metric cards. Never six equal 1:1 feature cards each with a 24px icon, two-word title, and one filler sentence. Never circular-avatar testimonials with a name, job title, and a row of five stars.

### Backgrounds
Never solid white or solid grey. Use CSS gradients, noise/grain overlay, geometric SVG patterns, or subtle radial glows. One grain overlay (`opacity: 0.04`) on a colored background immediately elevates perceived quality.

### Motion
Never `transition: all` — it catches unintended properties. Never animate height, width, or font-size directly — use transform: scaleY(), max-height with overflow hidden, or clip-path instead.

CSS-only for web artifacts. One well-orchestrated page-load with staggered `animation-delay` reveals beats scattered micro-interactions. Gate all animations with `@media (prefers-reduced-motion: reduce)`.

### Tone Commitment
Pick **one** tone and execute it fully: brutally minimal / maximalist chaos / retro-futuristic / organic warmth / luxury editorial / bold experimental. Half-committed aesthetics look worse than any single extreme.

### Content & Assets
Never Lorem ipsum, "John Doe", "Acme Corp", or round-number filler like "100%" / "1,234". Use realistic, specific content that fits the domain.

Never hotlink photos from external hosts (placeholder.com, unsplash.com, picsum.photos, randomuser.me). Never a soft-rounded square with a single centered letter as a logo — use a constructed monogram, wordmark, or hatched placeholder instead.

Never the default footer: three nav-link columns plus a social icon row — design it to fit the brand.

Never emoji as UI elements — no emoji icons, section headers, feature bullets, or status indicators.
