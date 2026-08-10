# WBC

Wanna Be Cup — a React + Vite app for running the tournament: editions, rounds,
pairings, live scoring, and leaderboards. Firebase (Auth + Firestore) is the
backend; the web app deploys from `main`, so anything on `main` is what players
see.

## Merging is the default, not something to ask about

**When work on a branch is finished, merge it into `main` and push — without
being asked.** `main` is the live app. Work that only exists on a feature branch
is invisible to everyone, so leaving it there is an unfinished task, not a
completed one.

At the end of any change:

1. Commit the work on the working branch and push it.
2. Merge that branch into `main` and push `main`.
3. Say in the reply that it is live on `main`.

```sh
git checkout <working-branch> && git push -u origin <working-branch>
git checkout main && git pull origin main
git merge --no-ff <working-branch> -m "Merge branch '<working-branch>': <what changed>"
git push -u origin main
```

Keep `--no-ff` and the `Merge branch '<branch>': <summary>` message shape — the
history reads as a series of merges, each one describing what shipped.

Merge without asking. Do not wait for a "yes, merge it", do not park the work on
the branch and mention that it is ready, and do not open a pull request for
routine changes — merge straight to `main`. A pull request is only for when the
user explicitly asks for one.

Before merging, confirm the change actually works: `npm run test:run` and
`npm run lint` should pass, and anything that touches the UI should have been
exercised in the running app.

**Hold off on merging only when:**

- Tests or lint fail, or the change is knowingly half-finished. Fix it, then
  merge.
- The user asked to review it first, or asked for a pull request.
- The change is risky or destructive in a way the user has not signed off on:
  Firestore rules that widen access, data migrations, deleting collections or
  historical edition data, or anything that changes how existing accounts sign
  in.

In those cases push the branch, then say plainly what is blocking the merge and
what would unblock it.

## Commands

```sh
npm run dev        # Vite dev server
npm run build      # production build
npm run test:run   # vitest, single pass (use this in automation)
npm test           # vitest watch mode
npm run lint       # eslint
```

Firestore rules have their own suite in `firestore.rules.test.mjs` — run it when
touching `firestore.rules`.

### Testing something that has to re-render

Most of `src/lib/` is pure and needs no DOM. Where the thing being tested is a
HOOK — where the bug would be "it did not recompute when it should have" — put
`/** @vitest-environment jsdom */` at the top of the file and render it with
`@testing-library/react`. `src/lib/roster.test.js` is the worked example.

Call `afterEach(cleanup)` explicitly. Testing Library only registers its own
cleanup when the test framework's globals are exposed, and this project imports
`describe`/`it` rather than turning `globals` on; without it every render stacks
up in one document.

This exists because of a real outage. The roster is a join of two loads that
arrive in either order, its `useMemo` named only one of them, and every player
vanished from a live tournament for the session — with unit tests, lint and a
build all green, because nothing exercised the order they arrive in. If a value
is derived from two things that load separately, there should be a test that
lands them the slow way round.

## Layout

- `src/App.jsx` — the app shell and most screen routing
- `src/components/` — shared UI (`ui.jsx`, `AppHeader`, `MoreMenu`, `Popup`, …)
- `src/lib/` — logic worth testing on its own: pairings, leaderboards, score
  guards, hole advance, group switching, editions, accounts, notifications.
  Tests live beside their modules as `*.test.js`.
- `src/firebase.js`, `src/theme.js`, `src/constants.js` — config and shared
  constants
- `functions/` — Firebase Cloud Functions
- `api/` — serverless course endpoints
- `data/` — historical tournament spreadsheets and CSVs; see
  `data/DATA-GUIDE.md`
- `android/`, `ios/`, `capacitor.config.json` — Capacitor native wrappers

## Conventions

- Match the surrounding code: same naming, same comment density, same idioms.
  New logic that can be tested without Firebase belongs in `src/lib/` with a
  test next to it.
- Commit messages describe what changed for the player or admin, in plain
  language — "Rounds: one date per round, under its own pill" — not the
  mechanics of the diff.
