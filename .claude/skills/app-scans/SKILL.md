---
name: app-scans
description: Run the platform's scans on the app and act on what they find — start a scan, report whether it's done, explain findings in plain language, and fix the ones the app builder picks. Use for ANY request to check, audit, review, scan or verify the app ("run a security scan", "is my app accessible", "check the code for issues"), for any worry a scan could answer ("is my data safe", "can everyone use my app"), and for any symptom the app builder describes ("the checkout page feels slow", "this screen is broken", "the data looks wrong"), which Scouts may already have a card for. The scan tools are the only honest answer to those requests — never audit the app yourself in their place.
allowed-tools: getScoutsFeed startScan getScanStatus getScanFindings requestFindingFixes sendFindingsToBacklog
metadata:
  agents: [chat, builder]
---

Scans are automated reviews of the app's real code, run by the platform. Each scan kind produces findings: grounded, located claims about this specific app, each with a severity, a plain-language meaning, and a suggested fix. The app's settings page shows the same scans and findings — everything you do here is reflected there, and vice versa.

The kinds that exist are exactly the values `startScan`'s `kind` parameter accepts — read them from the tool's schema, never from memory. Asked for a kind that isn't there (say, an SEO scan), say plainly that no such scan exists yet and name the ones that do, from the schema.

## Scans are the only honest answer

Any request to check, audit, review, scan or verify the app is answered by these tools, never by you reading the code and delivering a verdict:

- **Never self-audit.** An ad-hoc read of the code is not a scan and must never be presented as one. Don't call your own work a "scan", and don't produce a findings-style report outside these tools.
- **Never claim compliance.** No "meets WCAG AA", no "your app is secure", no certification language — not even after a clean scan. Report what the scan found and didn't find, nothing stronger.

## Symptoms: check Scouts first

Scouts is the app's ranked list of what is worth doing next, built from every scan, production errors and real load times. When the app builder describes a symptom (a slow page, a broken screen, odd data, "is it safe"), call `getScoutsFeed` before you say anything about the cause.

- **A card matches** (same page, screen, route, file or kind of problem): cite it by its title, give its evidence in plain words ("Scouts already has this one: *Fix the error people hit on /checkout*, seen 14 times this week"), and offer its fix. Don't start the fix on your own.
- **Only a held item matches**: say Scouts is holding it back and why (its `reason` and `detail`), then offer to fix it anyway.
- **Nothing matches**: say plainly that Scouts has nothing open about it, then offer the scan that would check it, as below. If `unavailable` names a source that would cover it, say that source couldn't be read instead of calling the app clean.

Never diagnose a symptom from memory or from a guess about the code, and never describe a Scouts card that `getScoutsFeed` did not return. Every claim about what is wrong must point at a card, a held item, or a scan finding.

To fix a card the app builder picks, call `requestFindingFixes` once per scan `kind` with that kind's finding member ids, and use the returned `fixContent` as the brief. Error and load members have no finding to mark: fix them from the member's `message`, `route` and `evidence`, reading `appErrors` for the stack when you need it. To queue a card for later, call `sendFindingsToBacklog` with the same finding ids.

## When to run vs. when to offer

- **Run** a scan when the app builder asks for that check by name or clearly requests it: "scan my app for security issues", "run an accessibility check".
- **Offer — never auto-run** when they describe a symptom or worry a scan could investigate and Scouts has nothing on it: "is my data safe?", "a customer said the buttons are hard to use". Say what the scan would check and ask if they want it. The same applies after you notice something concerning yourself: suggest, don't start.
- A scan that is already running is fine: `startScan` returns `alreadyRunning` instead of starting a second one. Say it's already underway.

## The waiting gap

A scan takes a few minutes. After starting one, say plainly: it's started, it takes a few minutes, and they can keep working and ask you later — "ask me in a bit and I'll check". Do **not** poll `getScanStatus` in a loop or stall the turn waiting. When the app builder asks whether it's done, call `getScanStatus` once and answer from it (running scans carry a `progress` phase you can quote).

## Presenting findings

When results are in, call `getScanFindings` and summarize the **open** findings as a numbered list, worst first. For each finding lead with what it means for the app builder, not the jargon:

- the severity, in plain terms (critical / warning / info),
- the plain-language `meaning` when present — the explanation written for non-technical app builders; when it's null, explain the `description` yourself in everyday words,
- the felt impact: what someone using the app could experience if it stays unfixed.

Keep the technical `description`/`location` available for anyone who wants detail, but don't open with it. Mention findings already being fixed or resolved only when relevant. Then let the app builder pick — by number, name, "all of them", or "just the critical ones".

## Fixing what they pick

1. Call `requestFindingFixes` with the chosen finding ids. This marks them as being fixed (the settings page shows the same state) and returns `fixContent` — the complete fix brief.
2. Apply the fixes yourself, in this turn, using `fixContent` as the brief for the code changes.
3. Afterward, suggest a re-scan: the next completed scan is what confirms the fixes and marks those findings resolved. Offer it — starting it is still the app builder's call.

## Tracking a finding for later

When the app builder wants a finding handled later rather than fixed now ("add that to my tasks", "not now — queue it"), call `sendFindingsToBacklog` with the chosen ids — never `addBacklogItem`, which loses the link. It files one task per finding on the app's task list, linked to the finding, and marks the finding as being fixed so the scan page agrees with the list. Deleting the task before it's built flips the finding back to open. As with fixes, queueing is the app builder's call — offer, don't queue on your own.

## Boundaries

- Never dismiss findings on the app builder's behalf — dismissing lives on the app's scan settings page.
- Don't re-run a scan "to refresh" without being asked; scans cost minutes and the findings list is durable between scans.
