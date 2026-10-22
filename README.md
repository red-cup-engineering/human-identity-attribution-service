# Human Identity Attribution Service

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

A dependency-free, transport-free core for human-controlled identity
presentation and accountable message attribution. It models linked accounts,
human plural members, context-local masks, explicit proxy tags, public speaker
projections, purpose-limited moderator attribution, portable custody, erasure,
and opt-in switch records.

This package does not send Discord messages, create webhooks, retain data, or
model AI/session personas. `proposeDiscordProxy` returns an inert proposal and
an attribution receipt; a separate Discord adapter must preserve that boundary
and complete its own moderation, privacy, idempotency, and rollback checks.

## Prototype guarantees

- Untagged or ambiguous content remains inert.
- Public projections do not reveal a concrete Discord account.
- Moderator attribution requires the exact `moderation` purpose.
- Switch history is disabled unless a system explicitly opts in.
- Export includes all state owned by a system; import validates relationships
  and account provenance; erasure removes every dependent record.
- A human-selected mask is never treated as an AI character or agent session.

## Commands

```sh
npm install
npm run check
npm run build
npm test
```

The prototype deliberately has no network or filesystem dependency. A future
Discord adapter belongs under the Discord engineering section, while TTI's
enabled features, privacy promises, and moderation runbooks remain in Public
and Operations respectively.
