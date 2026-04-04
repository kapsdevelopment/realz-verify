# AGENTS.md

This file is a short working guide for coding agents collaborating on
`realz-verify`.

It is meant to keep changes aligned with the repo's actual role in the Realz
system.

## Product Shape

`realz-verify` is the public verification website for Realz.

This repo currently contains:

- a static site under `docs/`
- GitHub Pages hosting for `getrealz.app`
- route handling for `/v/{proof_id}`
- UI for rendering the public verification result

The main product/backend repo is the sibling repo:

- `../realz`

If you are unsure whether something belongs here or in the backend repo:

- `realz-verify` owns public presentation
- `../realz` owns proof creation, sharing, storage, public verification API,
  entitlements, and billing

## Current Architecture

The current site is intentionally thin.

Today it:

- parses `/v/{proof_id}`
- calls the Supabase Edge Function `public_verify`
- renders the returned trust state, timestamps, and public thumbnail

Important:

- it does not access the database directly
- it does not require login
- it does not access original images
- it should only ever show public-safe data

## Current Trust Model

Be technically honest about what this site does.

Today the site is a public presentation layer over the backend verification
result.

That means:

- it trusts the `public_verify` response from `../realz`
- it does not currently perform full client-side cryptographic verification of
  the proof on its own
- it does not currently fetch `public_keys` and independently verify Ed25519
  signatures in the browser

Do not describe the site as a stronger verifier than it actually is.

## External Services And Docs

When working with external services or APIs, prefer fresh documentation over
memory.

Especially verify current docs when touching:

- GitHub Pages behavior
- browser history / 404 rewrite patterns
- Supabase Edge Function fetch behavior
- any future client-side crypto libraries

## Repo Conventions

This repo is intentionally simple.

Key files:

- `README.md`
- `docs/index.html`
- `docs/app.js`
- `docs/styles.css`
- `docs/404.html`
- `docs/CNAME`

Important current implementation details:

- `docs/app.js` currently hardcodes the Supabase project URL
- `/v/{proof_id}` deep links depend on the GitHub Pages 404 rewrite flow
- the site should remain static-hosting friendly

## UX Expectations

The verifier page should feel:

- clear
- calm
- trustworthy
- easy to understand for non-technical people

When editing the UI:

- keep success and failure states obvious
- avoid vague wording when a state is actually unknown or backend-derived
- do not expose raw technical detail as the primary experience
- keep debugging output secondary to the user-facing verdict

## Safety And Scope

Avoid adding behavior here that should live in the backend repo.

Examples of things that normally belong in `../realz`, not here:

- proof creation
- share/publication rules
- auth/session logic
- storage access
- billing/entitlements
- database policy changes

If a change needs new public verification fields, the backend API contract in
`../realz` should usually change first.

## Documentation Hygiene

When making meaningful changes, update the narrowest relevant doc.

Usually that means:

- `README.md` for onboarding-level project shape
- code comments only where the static routing or verification UI would otherwise
  be confusing

## Formatting And Editing

- Prefer small, targeted edits
- Do not rewrite the static site unnecessarily
- Keep ASCII by default unless the file already uses non-ASCII and it clearly
  improves the text

## Testing Expectations

If you touch route handling, verify flow, or status rendering, test at least:

- valid `/v/{proof_id}` path
- invalid/malformed path
- verified proof state
- not-verified proof state
- deleted/tombstone state
- direct load and 404-rewrite load

If you change API fields or assumptions, check the backend contract in
`../realz` before finalizing the frontend change.

## If Unsure

When in doubt:

1. inspect `docs/app.js`
2. inspect `README.md`
3. inspect the corresponding public verification logic in `../realz`
4. keep the site thin unless there is a strong reason to move logic here
