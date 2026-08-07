---
name: general-card
description: >
  Content panels for pipeline summaries, activity feeds, event lists, list
  breakdowns, and any grouped content that isn't a single KPI metric. Section
  heading lives outside the card. Card uses border only — no shadow.
---
name: general-card

Reference implementation — copy and adapt, do not reinvent.

## Hard rules

- **SectionHeading is always external to the card.** Never put a title inside the card with a `border-b` separator — that's admin UI, not editorial.
- **Card = border only.** No `shadow-*` classes.
- **SectionHeading MUST use `font-display`** — creates visual continuity with page headings.
- Action link in SectionHeading is `text-muted-foreground hover:text-foreground` — never `text-primary`. Quiet nav cue, not a CTA.
- Two-column layouts: main content column wider than the rail (`grid-cols-[1.4fr_1fr]`).
- NEVER put a MetricCard inside a GeneralCard body.

```jsx
// when_to_use: Content panels — pipeline summaries, activity feeds, event lists,
// KV breakdowns, donut+legend combos. Not for standalone KPI metrics.

// SectionHeading — lives OUTSIDE and ABOVE the card
function SectionHeading({ title, action, onAction }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-display text-xl font-normal tracking-[-0.005em] text-foreground leading-tight">
        {title}
      </h3>
      {action && (
        <button
          onClick={onAction}
          className="text-[12.5px] text-muted-foreground hover:text-foreground transition-colors bg-transparent border-0 p-0 cursor-pointer"
        >
          {action}
        </button>
      )}
    </div>
  );
}

// Card shell — border only, no shadow
function GeneralCard({ children, padded = false, className = '' }) {
  return (
    <div className={`bg-card border border-border rounded-xl overflow-hidden ${className}`}>
      {padded ? <div className="p-6">{children}</div> : children}
    </div>
  );
}

// CardRow — dot + label + value. For pipeline legend rows and KV breakdowns.
function CardRow({ dot, label, labelMeta, value, last = false }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-3 ${last ? '' : 'border-b border-border'}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {dot && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />}
        <div className="min-w-0">
          <p className="text-[13px] text-foreground truncate">{label}</p>
          {labelMeta && <p className="text-[11px] text-muted-foreground mt-0.5">{labelMeta}</p>}
        </div>
      </div>
      {value !== undefined && (
        <span className="text-[13px] font-medium text-foreground-secondary flex-shrink-0 [font-variant-numeric:tabular-nums] [font-feature-settings:'tnum']">
          {value}
        </span>
      )}
    </div>
  );
}

// ActivityRow — fixed-width time column + body. For logs and attention items.
function ActivityRow({ time, children, last = false }) {
  return (
    <li className={`flex gap-3 py-3 text-[13px] ${last ? '' : 'border-b border-border'}`}>
      <span className="font-mono text-[11.5px] text-muted-foreground min-w-[56px] flex-shrink-0 pt-px [font-variant-numeric:tabular-nums] [font-feature-settings:'tnum']">
        {time}
      </span>
      <span className="text-foreground-secondary">{children}</span>
    </li>
  );
}

// EventRow — for upcoming calendar events
function EventRow({ when, title, subtitle, last = false }) {
  return (
    <div className={`px-[18px] py-4 flex flex-col gap-0.5 ${last ? '' : 'border-b border-border'}`}>
      <p className="font-mono text-[11px] text-muted-foreground tracking-[0.02em]">{when}</p>
      <p className="text-[13.5px] text-foreground">{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

// --- Usage example (mirrors Pipeline + This week from the reference) ---

function GeneralCardDemo() {
  const pipeline = [
    { dot: 'var(--muted-foreground)',  label: 'Lead',           value: 3 },
    { dot: 'var(--warning)',           label: 'Discovery call', value: 2 },
    { dot: 'var(--foreground-secondary)', label: 'Proposal sent', value: 3 },
  ];

  const events = [
    { when: 'TUE  10:00', title: 'Discovery call',    subtitle: 'Folio Press' },
    { when: 'TUE  15:30', title: 'Press check',       subtitle: 'Roastery, inc.' },
    { when: 'WED  09:00', title: 'Internal review',   subtitle: 'Honeycutt Real Estate' },
  ];

  return (
    <div className="grid grid-cols-[1.4fr_1fr] gap-7 p-6 bg-background">
      {/* Pipeline */}
      <section>
        <SectionHeading title="Pipeline" action="Open board →" />
        <GeneralCard padded>
          <div className="flex items-center gap-5 mb-4">
            {/* swap in your real Donut component */}
            <div className="w-[120px] h-[120px] flex-shrink-0 rounded-full bg-border-subtle" />
            <div className="flex-1">
              {pipeline.map((r, i) => (
                <CardRow key={r.label} {...r} last={i === pipeline.length - 1} />
              ))}
            </div>
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-border text-[13px]">
            <span className="text-muted-foreground">Potential value</span>
            <span className="font-semibold [font-variant-numeric:tabular-nums] [font-feature-settings:'tnum']">$95,000</span>
          </div>
        </GeneralCard>
      </section>

      {/* This week */}
      <section>
        <SectionHeading title="This week" action="Calendar →" />
        <GeneralCard>
          {events.map((e, i) => (
            <EventRow key={e.when} {...e} last={i === events.length - 1} />
          ))}
        </GeneralCard>
      </section>
    </div>
  );
}

Object.assign(window, { SectionHeading, GeneralCard, CardRow, ActivityRow, EventRow, GeneralCardDemo });
ReactDOM.createRoot(document.getElementById('root')).render(<GeneralCardDemo />);
```
