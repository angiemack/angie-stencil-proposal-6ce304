---
name: generate-image
description: How to write prompts and ship a coherent image set with `dev-tools generate-image` — heroes, products, backgrounds, illustrations, and rendered logos. Load before generating any bitmap asset.
---

# Image Generation

`dev-tools generate-image` calls Gemini 3 Pro Image. The whole prompt you pass is the whole prompt the model sees — there is no purpose flag, no style preset, no automatic constraint injection. Everything that should appear in the image needs to be in your sentence.

```bash
dev-tools generate-image "<prompt>" --name <slug> [--aspect-ratio <ratio>]
```

The result lands at `/assets/<slug>.png` and is referenced as `src="/assets/<slug>.png"`.

## Prompt anatomy

A strong prompt names six things in roughly this order:

1. **Subject** — what's in frame, concretely. "Two designers reviewing wireframes," not "people working."
2. **Setting** — where it lives. "At a light wood desk by a tall window," not "in an office."
3. **Lighting** — the single biggest quality lever. Examples: *golden-hour side light*, *soft diffused overcast*, *hard studio key from above*, *cool blue rim light*, *warm tungsten interior*.
4. **Style / medium** — *editorial photograph*, *isometric illustration*, *3D render with matte materials*, *risograph print*, *pen-and-ink illustration*. Pick one — don't mix.
5. **Composition** — *centered subject*, *negative space on the right for overlay copy*, *low-angle three-quarter view*, *overhead flat lay*, *full-bleed*.
6. **Palette + mood** — *muted earth tones*, *high-contrast monochrome*, *warm cream and terracotta*, *cold steel and graphite*.

Two extras worth adding when relevant:
- **Lens / depth** — *shallow depth of field, 50mm*, *sharp focus throughout*, *macro detail*.
- **Negative directives** — *no text, no logos, no people in frame*. Gemini honors these.

### Before / after

❌ `"hero image for a coffee app"`  
✅ `"editorial photograph of an artisan coffee bar interior, warm afternoon sun through tall windows, espresso machine on a reclaimed wood counter, shallow depth of field, muted earth tones, generous negative space on the left for overlay copy, no visible text or signage"`

❌ `"product shot of a mug"`  
✅ `"minimalist white ceramic mug on a grey concrete surface, overhead studio shot, soft diffused key light, subtle contact shadow, true-to-life colors, centered with even margins"`

## Batch the inventory before writing UI

List every image slot you need *before writing components*. Generate them in one pass so the page composes against real assets, not gray rectangles.

```bash
dev-tools generate-image "editorial photograph of an artisan coffee bar interior, warm afternoon sun, shallow depth of field, generous negative space on the left for overlay copy, no text" --name hero --aspect-ratio 16:9
dev-tools generate-image "minimalist line-art coffee cup mark, single-weight stroke, deep espresso brown on warm cream, centered, square composition, no text" --name logo --aspect-ratio 1:1
dev-tools generate-image "dark linen texture, fine matte grain, uniform density, no hard vignettes" --name bg-texture --aspect-ratio 1:1
```

Then reference them:

```tsx
<img src="/assets/hero.png" alt="Coffee bar interior" />
<img src="/assets/logo.png" alt="Brand mark" />
<div style={{ backgroundImage: "url('/assets/bg-texture.png')" }} />
```

## Style coherence across a set

When multiple images share a page, they must look like they belong together. Pick a *style sentence* once and reuse it across every prompt in the batch.

Example shared style: *"editorial photograph, warm natural light, muted earth tones, shallow depth of field, soft film grain"*

Then vary only subject + composition between images. Mixing *editorial photograph* and *3D render* and *flat illustration* in the same product is the most common way image sets feel slop.

## Slot-specific guidance

These aren't enforced by the tool — they're craft rules to bake into your prompts.

**Hero (`16:9`)** — needs negative space on one side for overlay copy. Always say so explicitly: *"generous negative space on the right, low-contrast in that region for overlay readability."* Avoid centered subjects; they fight headlines.

**Background (`1:1` or `16:9`)** — must not compete with foreground content. Add: *"uniform density, low contrast in the upper third, safe to crop from any edge, no focal subject."* Textures (linen, paper, concrete, plaster) and blurred bokeh work better than detailed scenes.

**Product (`16:9` or `4:3`)** — clean studio context. Add: *"even studio lighting, subtle contact shadow, true-to-life colors, no surrounding clutter."* Don't ask for text or labels on the product itself — Gemini renders typography poorly; use SVG overlays instead.

**Poster (`9:16` or `4:3`)** — bold graphic frame for a title. Add: *"bold silhouette, confident limited palette, breathing room at the top for a headline."*

**Illustration (`1:1` or `4:3`)** — lean on a named style: *"isometric illustration, flat shapes, pastel palette, clean line-weight, subtle paper grain."* Specify *"no text in the illustration."*

**Logo mark (`1:1`)** — for a stylized or photoreal mark only; this won't give you vector. Add: *"centered, clean silhouette, limited palette, neutral background, no surrounding context, no text."* For wordmarks, use inline SVG with a font instead — don't generate text-bearing logos.

## Aspect ratios

| Slot | Ratio |
|---|---|
| Hero / banner / wide section | `16:9` |
| Portrait / poster / mobile cover | `9:16` |
| Square thumbnail / logo / icon-style mark | `1:1` |
| Standard card / product | `4:3` |
| Tall card / portrait crop | `3:4` |

Omit `--aspect-ratio` only if the prompt is genuinely shape-agnostic.

## Naming

`--name` becomes the filename slug. Keep it short, descriptive, kebab-case.

- `hero`, `hero-mobile`, `hero-features`
- `logo`, `logo-dark`, `logo-mark`
- `bg-texture`, `bg-mesh`, `bg-blur`
- `product-shot`, `team-photo`, `feature-1`

## Iterating when output isn't right

The model is deterministic per-prompt-shape, so vague prompts won't improve by re-running them. If the result misses, change the prompt — don't retry. Common fixes:

- **Wrong mood** → tighten the lighting and palette clauses; those carry mood more than subject.
- **Subject not prominent enough** → lead with the subject, then say *"centered, dominant in frame."*
- **Cluttered / busy** → add *"minimal, generous negative space, no background props."*
- **Looks like stock photography** → name the medium explicitly (*"editorial photograph"*, *"large-format film, 80mm"*) and add a specific lighting time-of-day.
- **Text appeared but is garbled** → add *"no text, no signage, no labels."*
- **Wrong style for the set** → reuse your shared style sentence verbatim across all prompts.

## When to skip generation

Generate images for slots where a real photo or illustration replaces what would otherwise be a placeholder. **Don't** generate when CSS or SVG handles it cleanly:

- Icons → Lucide or inline SVG
- Charts / data viz → Recharts or inline SVG (`chart-rendering` skill)
- Gradients, solid fills, decorative shapes → CSS / Tailwind
- Wordmarks with legible text → font-based SVG, not generation

Never hotlink third-party images (`unsplash.com`, `picsum.photos`, `placeholder.com`, etc.) — every bitmap on the page should be either generated through this tool or already shipped under `/assets/`.
