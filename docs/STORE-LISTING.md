# Store listing — Wannabe Cup

Everything to paste into App Store Connect and Play Console, plus the shot list
for the screenshots. Companion to `APP-STORE-SUBMISSION.md`, which covers the
process; this is the content.

Two rules run through all of it:

- **The listing describes a tournament scoring app.** It does not lead with the
  side games. That is accurate — scoring and history are what the app mostly
  is — and it keeps the automated gambling-keyword filters out of a review that
  has enough to think about. The side games are disclosed properly in Review
  Notes and in the age rating, which is where disclosure belongs.
- **Nothing here claims a feature the app does not have.** Notifications in
  particular: they work on the web app and not in the native shells, so they
  are absent from both descriptions.

---

## Names and short fields

| Field | Value | Limit |
| --- | --- | --- |
| App name (both stores) | `Wannabe Cup` | 30 |
| Apple subtitle | `Golf tournament scoring` | 30 |
| Play short description | `Live scoring, pairings and side games for a private golf tournament.` | 80 |
| Home-screen name | `WBC` — unchanged, `CFBundleDisplayName` / `strings.xml` | — |

Not "WBC" as the store name: it collides with the World Baseball Classic and
the World Boxing Council, and a 5.2.1 trademark rejection is not worth the
eight characters. The listing name and the home-screen name are independent
fields and nothing in the repo changes.

Subtitle alternates, if `Golf tournament scoring` reads too flat:
`Scorecards, skins and history` (29) · `One tournament, every year` (26)

### Apple keywords (100 chars, comma-separated, no spaces)

```
golf,tournament,scorecard,leaderboard,handicap,pairings,skins,net,gross,outing,cup,league,scoring
```

97 characters. Do not repeat the app name or subtitle words — Apple already
indexes those, and a duplicate wastes the field.

### Categories

- **Apple:** Primary `Sports`, Secondary `Utilities`
- **Play:** `Sports`

### URLs

| Field | Value |
| --- | --- |
| Privacy policy | `https://wannabecup.com/privacy` |
| Support URL | `https://wannabecup.com` |
| Marketing URL | leave blank |
| Play account deletion | `https://wannabecup.com/account-deletion` |

---

## Description

Same body for both stores. Apple's limit is 4000 and Play's is 4000; this is
well under both.

```
Wannabe Cup runs one golf tournament: the WBC, played by the same group of
friends every year since 2010.

It is not a general-purpose golf app. It runs one event — the draw, the
scoring, the leaderboards and seventeen years of history behind them.

SCORING BUILT FOR A PHONE IN A GLOVE
Enter the group's scores hole by hole, with strokes shown where they actually
fall. The card advances itself when everyone is in. Signatures and attestation
work the way they do on paper: your group signs its own card, and the round is
final when every group has.

LEADERBOARDS THAT ANSWER THE QUESTION
Net or gross, to par or total strokes, this round or the whole event. Thru
counts holes while the round is live and tee times before it starts, so the
board reads the same way it would on a wall at the turn.

THE DRAW AND THE TEE SHEET
The director sets pairings and tee times, or draws them automatically from the
standings. Nobody standing on the first tee has to be told which group they are
in, and a round with no draw lets a group build its own.

THE SIDE GAMES, SCORED FROM THE CARDS
Skins, closest to the pin and low net are worked out from the scores already
posted rather than tracked separately, so the card and the game can never
disagree. A collection sheet shows the organizer who has settled up.

SEVENTEEN YEARS OF IT
Every edition since 2010 — leaderboards, full scorecards, champions and photos
— in the same app as this year's. Handicap indexes carry forward from the
rounds actually played.

Wannabe Cup is for the players of one private event. Signing in requires the
tournament password and a place on the roster. Anyone can open the app without
an account to read the live leaderboard.
```

### Apple promotional text (170 chars, editable without a review)

```
Round 1 tees off soon. Live net and gross leaderboards, hole-by-hole scoring
and every edition since 2010, in one app.
```

Handy during the event — it updates without resubmitting.

---

## Screenshots

### Sizes, and why you need two sets

| Store | Size | Notes |
| --- | --- | --- |
| Apple 6.9" iPhone | **1290 × 2796** | The only required size. `TARGETED_DEVICE_FAMILY = 1`, so **no iPad set is needed.** |
| Play phone | **1080 × 1920** | Recommended 9:16 |

**One set cannot serve both.** Play rejects any image whose longer side is more
than twice the shorter one, and 1290 × 2796 is 2.17 : 1. Apple's required size
is outside Play's rules.

**Play also rejects PNGs with an alpha channel.** Export 24-bit PNG without
transparency, or JPEG. A screenshot straight out of a browser or a simulator
often carries alpha — flatten it or the upload fails with a message that does
not mention transparency.

Play needs 2–8 phone screenshots; Apple needs 1–10. Six is plenty for both.

### Do NOT shoot in guest mode

Guest mode puts an amber strip across the top of every screen —
`GUEST PREVIEW — NOTHING YOU TAP IS SAVED`. Correct behaviour, and wrong for a
listing. Sign in as yourself.

### Which edition to shoot

**2025, not 2026.** A finished edition has full leaderboards, complete cards
and settled side games; 2026 has not been played yet and every board in it is
empty. Switch to 2025 in More → Tournaments, take the shots, switch back.

Do not shoot the DEMO sandbox — the header says DEMO Sandbox, which is exactly
what it is for and exactly wrong on a store page.

### The shot list, in order

Order matters: the first two are all most people see.

1. **Leaderboard, net, whole event.** The app's answer to "who is winning". A
   full field with real numbers.
2. **Hole-by-hole scoring**, mid-round, with a group's scores part-entered.
   This is the screen the app is actually used on.
3. **A completed scorecard** — the round card with circles and totals, showing
   the app can produce a real card.
4. **Pairings / tee sheet** for a round, groups and times filled in.
5. **Skins card**, mid-round, with a gold circle or two on it. (Check this one
   for stray zeros — it is the screen that had the "00" bug.)
6. **Tournaments** — the year list, seventeen editions deep. This is the one
   that shows the app is not a weekend project.

Optional seventh: the photo gallery, if a year has good photos in it.

### Capturing them

**Apple — Xcode Simulator, iPhone 16 Pro Max.** `Cmd+S` saves a PNG at exactly
1290 × 2796, no cropping and no resizing. Run the release build, or just open
`wannabecup.com` in Safari in the simulator — the UI is the same web build the
native shell wraps.

**Play — resize the same six.** From the Apple set:

```sh
# 1290x2796 → 1080x1920, centre-cropped, alpha flattened
for f in apple/*.png; do
  sips -Z 1920 "$f" --out "play/$(basename "$f")"
done
```

or with ImageMagick, which handles the crop and the alpha in one pass:

```sh
magick apple/01.png -resize 1080x1920^ -gravity center -extent 1080x1920 \
  -background black -alpha remove -alpha off play/01.png
```

Shooting Play natively instead is fine too — an Android phone screenshot is
usually already 1080 × 2400, which is inside Play's rules and needs nothing.

### Or let the script do it

```sh
npm install                 # picks up playwright
npx playwright install chromium
npm run shots -- --edition wbc_2025
```

`scripts/screenshots.mjs`. It opens a real browser, waits while you sign in
once, then writes **both** sets — `store/screenshots/apple` at 1290 x 2796 and
`store/screenshots/play` at 1080 x 1920 with the alpha flattened — and names
the shots that did not land rather than reporting a half set as finished. The
signed-in profile is kept in `.screenshot-profile/`, so later runs go straight
to capturing and can take `--headless`.

Both directories are gitignored: the images are regenerable from the app, and
the profile holds a real Google session.

Look at every image before uploading. The script drives the app; it has no idea
whether the screen it caught was worth catching.

---

## Review notes

### Apple — App Review Information

Leave "Sign-in required" **unchecked**. Paste:

```
Wannabe Cup is the app for a private, invitation-only golf tournament run by
the same group of friends since 2010. Full access requires the event password
and a claimed spot on a fixed roster, which we cannot issue for a review
account.

Instead, tap "Live Leaderboard — No account needed" on the sign-in screen.
This opens the entire app read-only: leaderboards, pairings, scorecards, the
side-game screens, the photo gallery and 17 years of history. Every screen a
player sees is reachable this way, with no sign-in.

SIDE GAMES: the app includes a scorekeeping ledger for traditional golf side
games (skins, closest-to-the-pin, low net) played among the private group at
the in-person event. No money is transacted, collected, held or transferred
through the app, and there is no payment processing of any kind. Buy-ins are
settled in cash in person; the app only records who has paid so the organizer
is not tracking it on paper. There is no house, no rake, and no connection to
any gambling operator.

PHOTO GALLERY: not public user-generated content. Uploading requires both the
private event password and a claimed place on a fixed roster of 13; the group
has known each other personally for 17 years. Unauthenticated visitors can
view but cannot upload. Any photo can be removed by its uploader or by the
tournament director from within the app. Contact: aarondjensen@gmail.com

UNLISTED DISTRIBUTION: this app is intended for unlisted distribution. A
request has been filed separately at
developer.apple.com/contact/request/unlisted-app/
```

### Play — App access

Choose the restricted option and paste the first two paragraphs above.

---

## App Privacy (Apple) and Data safety (Play)

Both must match each other **and** match `ios/App/App/PrivacyInfo.xcprivacy`.
Apple compares them.

| Data | Collected | Linked to user | Tracking | Purpose |
| --- | --- | --- | --- | --- |
| Email address | Yes | Yes | No | App functionality |
| Name | Yes | Yes | No | App functionality |
| User ID | Yes | Yes | No | App functionality |
| Photos | Yes | Yes | No | App functionality |
| Other user content (scores, ledger) | Yes | Yes | No | App functionality |

Everything else is **No**: no location (courses are chosen by name from a
search, never from the device), no contacts, no health, no financial info, no
advertising data, no crash or performance data — there is no analytics or crash
SDK linked.

Play additionally asks:

- **Encrypted in transit:** Yes
- **Can users request deletion:** Yes → `https://wannabecup.com/account-deletion`
- **Is data required or optional:** Required (the app does not function
  without an account, except in read-only guest mode)

---

## Content rating

Answer both questionnaires **honestly**, including the gambling questions.
Expect **17+ (Apple)** and **Mature 17+ (Play)**.

A rating that is too low is a policy violation discovered later; one that is
too high costs nothing with an audience of thirteen adults.

Play's target-audience question: **18+**. Do not let this app anywhere near the
Designed for Families flow.

---

## Feature graphic (Play only, required)

**1024 × 500**, JPEG or 24-bit PNG, no alpha, no transparency.

Easy to forget and it blocks the release. The trophy mark on the app's dark
background (`#080f1a`) with "Wannabe Cup" set in Montserrat is enough — Play
crops it in several places, so keep the mark and the words well inside the
middle.

Also required: **app icon 512 × 512**, 32-bit PNG, no alpha.
