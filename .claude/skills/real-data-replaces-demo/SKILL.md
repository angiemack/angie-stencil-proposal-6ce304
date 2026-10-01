---
name: real-data-replaces-demo
description: >
  Connecting a screen to a real data source — wiring payments/Stripe or a
  subscription into a billing page, auth into an account screen, or the app's
  own tables into a list, dashboard, or detail view — especially a screen that
  began as a design export, mockup, or demo. Also for fixes like "my billing
  page still shows sample invoices", a "Visa ·· 4242" card that isn't the app
  user's, or a button that toasts "coming soon" though the feature now works.
metadata:
  agents: [builder]
---

# Real data replaces demo data

When a screen is connected to a real source — payments, auth, the app's own
tables — every placeholder it carried is removed **in the same build**, not in a
later cleanup. Design exports and first drafts ship with mock content so the
layout reads well; once the screen has a data source, that content is a lie the
app user will see next to their real data.

Placeholders to hunt in the screens the build touches:

- Sample rows hardcoded in the component — mock invoices, orders, contacts,
  stats — usually a literal array near the top of the file.
- Test card numbers ("Visa ·· 4242"), fake amounts, fake dates, fake names.
- "Coming soon" / "not available yet" toasts or copy on controls that now work.
- Stale messages written for an earlier state of the app — a "reload your
  browser" notice, an explanation of a bug that has since been fixed.

After the build, everything on the screen is either real data from the source or
an honest empty state (see the `empty-states` skill). If the source can return
nothing, render the empty state — never keep demo rows so the page "doesn't look
bare."
