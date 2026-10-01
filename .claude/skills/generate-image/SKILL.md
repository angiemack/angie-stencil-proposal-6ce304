---
name: generate-image
description: How to write prompts and ship a coherent image set with the `generateImage` tool — heroes, products, backgrounds, illustrations, and rendered logos. Load before generating any bitmap asset.
allowed-tools: generateImage
metadata:
  agents: [builder]
---

# Image Generation

`generateImage` takes your prompt and draws it. The whole prompt you pass is the whole prompt the model sees — there is no purpose flag, no style preset, no automatic constraint injection. Everything that should appear in the image needs to be in your sentence.

Three decisions come with every call, and only the first is craft:

- **The prompt.** Most of this page.
- **Where it goes.** An image the app displays has to be *served*, which is what `public` does; it comes back as `/assets/<name>.png` and that is the path you write into the component. Nothing copies it there for you afterwards. An image you are only holding for a later build stays private.
- **Which model draws it.** Use `gemini` for anything a visitor will see. Every craft rule below assumes it: the negative directives, the style-sentence coherence, the typography warning. The Workers AI models are cheaper and fine for a throwaway placeholder, and they will not honour any of it.

Its input schema is in your tool list; read the field names there.

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

List every image slot you need *before writing components*, then generate them in one pass so the page composes against real assets rather than gray rectangles. A landing page usually means a hero at 16:9, a square logo mark, and a background texture — three calls, all public, named for what they are, before the first component exists.

Then reference them by the paths you got back:

```tsx
<img src="/assets/hero.png" alt="Coffee bar interior" />
<img src="/assets/logo.png" alt="Brand mark" />
<div style={{ backgroundImage: "url('/assets/bg-texture.png')" }} />
```

A name is yours to choose and you will type it into code, so keep it short, descriptive and kebab-case: `hero`, `hero-mobile`, `logo`, `logo-dark`, `bg-texture`, `product-shot`, `feature-1`.

## Style coherence across a set

When multiple images share a page, they must look like they belong together. Pick a *style sentence* once and reuse it across every prompt in the batch.

Example shared style: *"editorial photograph, warm natural light, muted earth tones, shallow depth of field, soft film grain"*

Then vary only subject + composition between images. Mixing *editorial photograph* and *3D render* and *flat illustration* in the same product is the most common way image sets feel slop.

## Slot-specific guidance

These aren't enforced by the tool — they're craft rules to bake into your prompts.

**Hero (16:9)** — needs negative space on one side for overlay copy. Always say so explicitly: *"generous negative space on the right, low-contrast in that region for overlay readability."* Avoid centered subjects; they fight headlines.

**Background (1:1 or 16:9)** — must not compete with foreground content. Add: *"uniform density, low contrast in the upper third, safe to crop from any edge, no focal subject."* Textures (linen, paper, concrete, plaster) and blurred bokeh work better than detailed scenes.

**Product (16:9 or 4:3)** — clean studio context. Add: *"even studio lighting, subtle contact shadow, true-to-life colors, no surrounding clutter."* Don't ask for text or labels on the product itself — Gemini renders typography poorly; use SVG overlays instead.

**Poster (9:16 or 4:3)** — bold graphic frame for a title. Add: *"bold silhouette, confident limited palette, breathing room at the top for a headline."*

**Illustration (1:1 or 4:3)** — lean on a named style: *"isometric illustration, flat shapes, pastel palette, clean line-weight, subtle paper grain."* Specify *"no text in the illustration."*

**Logo mark (1:1)** — for a stylized or photoreal mark only; this won't give you vector. Add: *"centered, clean silhouette, limited palette, neutral background, no surrounding context, no text."* For wordmarks, use inline SVG with a font instead — don't generate text-bearing logos.

### Which shape for which slot

| Slot | Shape |
|---|---|
| Hero / banner / wide section | 16:9 |
| Portrait / poster / mobile cover | 9:16 |
| Square thumbnail / logo / icon-style mark | 1:1 |
| Standard card / product | 4:3 |
| Tall card / portrait crop | 3:4 |

Leave the shape unset only when the prompt is genuinely shape-agnostic.

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
