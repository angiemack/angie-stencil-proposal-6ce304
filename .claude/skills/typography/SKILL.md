---
name: typography
description: >
  Foundational type system rules for any UI surface. Load when choosing fonts,
  defining a type scale, setting line lengths, handling dark mode text, loading
  web fonts, or making hierarchy decisions. Applies universally across product
  UIs, dashboards, marketing pages, and editorial surfaces. Stack with
  editorial-typography for long-form layouts or cjk-typography for CJK scripts
  — they do not overlap, they add specificity on top.
---
name: typography

## When to use

Trigger this skill when:

- Choosing a typeface or font pairing for any new surface.
- Defining a type scale (heading, body, label, caption, micro).
- Debugging cramped, unreadable, or visually flat text.
- Making text legible in dark mode.
- Setting up web font loading without layout shift.
- Deciding between fluid (`clamp()`) and fixed (`rem`) scaling.

> **Stacks with other skills:** `editorial-typography` adds long-form reading layout variants (drop cap, pull quote, column). `cjk-typography` adds Chinese/Japanese/Korean rendering rules. Load any combination — they cover separate concerns.

> **Cross-reference:** Font personality and banned defaults (Inter, Roboto, Arial) are enforced by `frontend-design-anti-slop`. This skill covers the structural and technical layer: scale, rhythm, measure, loading, dark mode, and OpenType.

---

## Rules

### Scale & Hierarchy

1. **5 sizes, not more. Minimum 1.25× ratio between each step.** Define: `display`, `heading`, `body`, `small`, `micro`. A "Major Third" scale (×1.25) is the minimum acceptable contrast between steps; "Perfect Fourth" (×1.333) gives sharper distinction. Never use adjacent sizes that are within 2px of each other — the brain cannot distinguish them and hierarchy collapses.

2. **Weight contrast before size contrast.** The fastest hierarchy signal is font-weight: 400 body → 600 label → 700 heading. Exhaust weight contrast within one family before reaching for a size jump or a second typeface. A single family at 400/500/700 reads cleaner than two families at the same weight.

3. **One family first, two maximum.** A second typeface is justified only when it creates *genuine* optical contrast — typically a serif display + sans body pairing, or a mono for code. Never pair two similar-weight, similar-width sans-serifs: the near-match reads as an error, not a choice.

4. **Never apply the display/headline font below 18px.** Display cuts are optimised for large sizes — stroke contrast and optical spacing break down at small sizes. At 16px and below, use the body or label style.

---

### Rhythm & Measure

5. **Line-height is the vertical spacing unit.** Body at 16px × 1.5 line-height = 24px rhythm unit. All vertical margins, gaps, and padding should be multiples of that unit (24, 48, 72…). This produces automatic vertical rhythm without manual tweaking per component.

6. **Measure: 60–75ch for body prose, enforced with `max-width`.** Lines longer than 75 characters increase tracking effort; lines shorter than 45 fragment thought flow. `max-width: 65ch` is the safe default. Wide-set typefaces (Georgia, Garamond) tolerate 70–75ch; tight-set (DM Sans, Geist) work best at 60–65ch.

7. **Never positive `letter-spacing` on lowercase body or heading text.** Only all-caps labels, eyebrows, and badges get expanded tracking (`0.08–0.15em`). Tracking lowercase text makes it feel airy and cheap. Tighten display sizes instead: large headings (≥ 40px) benefit from `letter-spacing: -0.02em` to `-0.04em`.

---

### Dark Mode

8. **Dark mode requires compensation on three axes, not one.** Flipping surface colors without adjusting type degrades legibility significantly:
   - **Line-height:** increase by 0.05–0.1 (dark backgrounds need more air between lines)
   - **Letter-spacing:** add `0.01–0.02em` to body text
   - **Weight:** step up one level (400 → 450–500 body if variable; 600 → 700 headings) — thin strokes disappear against dark surfaces

---

### Font Loading

9. **`font-display: swap` on every `@font-face`.** Without it, branded fonts block render. Text becomes invisible until the font loads (FOIT), causing layout instability and perceived slowness.

10. **Match fallback font metrics to prevent CLS.** When the swap happens, mismatched x-height, ascenders, or line-gaps cause a visible text reflow. Use `size-adjust`, `ascent-override`, and `descent-override` on the fallback `@font-face` to match metrics. [Fontaine](https://github.com/unjs/fontaine) automates this. Prioritise for above-the-fold text.

11. **Variable fonts outperform multiple static files at ≥ 3 weights.** One `woff2-variations` file handles the full weight axis at a smaller total transfer than three separate static files. Preload only the body weight (the first-paint critical path); let display weights lazy-load.

---

### Scale Strategy

12. **Product UIs and dashboards: fixed `rem` scale. Marketing/editorial headings: fluid `clamp()`.** Fixed `rem` values at each breakpoint give dashboards and data-dense surfaces spatial predictability — interactive targets don't shift under the cursor. `clamp(min, preferred, max)` suits hero headings and editorial display type where smooth scaling is desirable. Cap `clamp` max at ≤ 2.5× min to prevent illegibly large type.

---

### OpenType & CSS Features

13. **`font-variant-numeric: tabular-nums` on any element showing updating or comparative numbers.** Proportional numerals shift column width as values change (e.g. "1,204" narrower than "9,999"), breaking table alignment and causing jank on live data. Apply to prices, metrics, dates, table cells, leaderboards. Pair with `font-style: normal` — never let numbers go italic.

14. **`text-wrap: balance` on headings, never on body.** Balance prevents orphaned single words on the last line of a heading. On body paragraphs, it causes layout recalculation at scale — apply only to `h1`–`h3` and large display text.

15. **`font-optical-sizing: auto` on variable fonts.** This tells the font to use its optical size axis, tightening spacing at large sizes and loosening it at small sizes automatically.

---

### Accessibility

16. **Minimum 16px body text. `rem`/`em` units only — never `px` for font sizes.** `px` overrides browser zoom and user font-size preferences, failing WCAG 1.4.4. 16px is the browser default; going below it degrades legibility for aging eyes, small screens, and low-contrast environments. Never disable zoom.

17. **Italic descender trap.** When using italic on any text containing `y g j p q f`, set `line-height` to a minimum of 1.1 and add explicit bottom padding to the container. Descenders from italic glyphs clip against the next line or container edge without it — this is a near-invisible bug that passes visual QA easily.

---

## Do / Don't

**Do**
- Define the full type scale as CSS custom properties at `:root` before writing components.
- Use `ch` for prose `max-width`, `rem` for font sizes, `em` for spacing relative to the local type size.
- Apply dark mode compensation on all three axes (line-height, letter-spacing, weight).
- Apply `text-wrap: balance` globally to `h1`–`h3`.
- Use `font-variant-numeric: tabular-nums` on any element that shows numbers that update or compare.
- Preload only the body font weight; let display and bold weights lazy-load.
- Use a variable font when using 3+ weights of the same family.

**Don't**
- Don't reach for a second typeface before exhausting weight contrast within one family.
- Don't use `clamp()` fluid scaling in product UIs or dashboards — fixed `rem` only.
- Don't apply `text-wrap: balance` to body paragraphs.
- Don't use `px` for font sizes.
- Don't let body text drop below 16px.
- Don't load 5 weights of a font that uses 2.
- Don't pair two similar-width, similar-weight sans-serifs — near-matches read as errors.
- Don't apply positive `letter-spacing` to lowercase body or heading text.
- Don't let numbers go italic in data or metric contexts.

---

## Code patterns

Type scale tokens:

```css
:root {
  /* Modular scale — Perfect Fourth (×1.333) */
  --text-micro:    0.579rem;  /*  ~9px  */
  --text-small:    0.75rem;   /*  12px  */
  --text-body:     1rem;      /*  16px  */
  --text-heading:  1.333rem;  /*  ~21px */
  --text-display:  1.777rem;  /*  ~28px */

  /* Rhythm — body-size × line-height */
  --lh-body: 1.5;
  --rhythm:  calc(1rem * 1.5); /* 24px */

  /* Measure */
  --measure: 65ch;
}
```

Dark mode text compensation:

```css
[data-theme='dark'] body,
.dark body {
  line-height: 1.65;           /* +0.15 vs light default */
  letter-spacing: 0.015em;
  font-weight: 450;            /* variable font; use 500 for static */
}

[data-theme='dark'] h1,
[data-theme='dark'] h2,
[data-theme='dark'] h3,
.dark h1, .dark h2, .dark h3 {
  font-weight: 700;            /* step up from 600 */
}
```

Heading global defaults:

```css
h1, h2, h3 {
  text-wrap: balance;
  font-optical-sizing: auto;
  letter-spacing: -0.02em;
}

h1 { font-size: var(--text-display); line-height: 1.1; }
h2 { font-size: var(--text-heading); line-height: 1.2; }
```

Tabular numbers (apply to any data surface):

```css
.numeric,
[data-numeric] {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  font-style: normal;
}
```

Variable font loading with fallback metric matching:

```css
/* 1. Override fallback metrics to prevent CLS on swap */
@font-face {
  font-family: 'GeistFallback';
  src: local('Arial');
  ascent-override: 85%;
  descent-override: 20%;
  line-gap-override: 0%;
  size-adjust: 107%;
}

/* 2. Load variable font */
@font-face {
  font-family: 'Geist';
  src: url('/fonts/geist-variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;
}

/* 3. Stack: branded → matched fallback → generic */
body {
  font-family: 'Geist', 'GeistFallback', system-ui, sans-serif;
}
```

Preload (HTML `<head>`):

```html
<!-- Preload body weight only -->
<link
  rel="preload"
  href="/fonts/geist-variable.woff2"
  as="font"
  type="font/woff2"
  crossorigin
/>
```

Fluid display heading (marketing / editorial only — not dashboards):

```css
.display-heading {
  font-size: clamp(2rem, 4vw + 1rem, 5rem); /* 32px → 80px */
  line-height: 1.05;
  letter-spacing: -0.03em;
  text-wrap: balance;
}
```

Prose container (long-form reading):

```css
.prose {
  font-size: var(--text-body);
  line-height: var(--lh-body);
  max-width: var(--measure);
  /* Italic descender safety */
  padding-bottom: 0.25em;
}
```
