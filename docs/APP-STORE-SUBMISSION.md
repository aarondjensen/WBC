# Submitting WBC to the App Store and Google Play

Written against the state of the repo on the `claude/app-store-submission-prep-j03okf`
branch. It is a runbook, not a summary: the order matters, and three of the steps
have to happen weeks before the others.

Two lessons from the Maize N Que Golf League submission are baked into this
document, in the places where they bite:

- **Apple made MNQ go Unlisted.** WBC has the same shape — a private event for a
  fixed group — so plan for Unlisted from the first submission rather than
  discovering it in a rejection. See [Apple: listed or unlisted](#decision-1-apple-listed-or-unlisted).
- **The MNQ Play testers downloaded the app and never used it, and Google
  refused production access.** Downloads are not what Google measures. See
  [The 12 testers, properly](#the-12-testers-properly) — and read
  [Do you even need production access?](#step-0-do-you-even-need-production-access)
  first, because the cheapest fix is to not need it.

---

## Where the app already stands

Most of the hard compliance work is done. Verified in the code, not assumed:

| Requirement | State |
| --- | --- |
| Sign in with Apple (App Store 4.8, required because Google sign-in is offered) | Done — entitlement in `App.entitlements`, provider in `capacitor.config.json`, button gated by `APPLE_PROVIDER_ENABLED` in `src/firebase.js` |
| In-app account deletion (App Store 5.1.1(v), Play account-deletion policy) | Done — `deleteAccount` in `src/firebase.js:713`, wired to a button in `src/App.jsx:2744` |
| Public privacy policy | Done — `public/privacy/index.html` |
| Public account-deletion page (Play requires a *web* URL as well as the in-app path) | Done — `public/account-deletion/index.html` |
| A way for a reviewer to see the app without credentials | Done — guest mode. This is the single biggest thing WBC has that most gated apps don't. See [The reviewer problem](#the-reviewer-problem-already-solved) |
| Android release signing | Done — `android/app/build.gradle` reads `keystore.properties` or `WBC_KEYSTORE_*` env vars |
| Android `targetSdk` | 36 — clears Play's API 35 floor for new apps |
| App icons and splash screens, both platforms | Generated and committed |
| Tests / lint / build | Green: 1344 tests, 0 lint errors, clean build |

## What this branch changed

Four things that were genuinely going to cost a submission:

1. **`ios/App/App/PrivacyInfo.xcprivacy` (new).** Apple has required a privacy
   manifest since spring 2024. Without one, App Store Connect *accepts* the
   upload and then emails ITMS-91053 hours later — a rejection you find out
   about after telling everyone the build is in. Declares tracking = false, the
   five data types WBC actually collects, and the one required-reason API the
   app target itself uses. Wired into `project.pbxproj` so it ships in the
   bundle; a manifest sitting in the folder but not in Copy Bundle Resources
   does nothing at all.

2. **`ITSAppUsesNonExemptEncryption = false` in `Info.plist`.** WBC's only
   encryption is HTTPS and the platform keychain, both exempt. Without the key,
   App Store Connect stops *every* build at a manual questionnaire before
   TestFlight or review can see it.

3. **`UIRequiredDeviceCapabilities`: `armv7` → `arm64`.** Capacitor's template
   still ships `armv7`, which is 32-bit hardware that died at iOS 11. Declaring
   it *required* on an iOS 15 minimum is a requirement no device that can
   install the app actually meets.

4. **The notification screen no longer lies inside the native apps.**
   `src/components/NotificationSettings.jsx`. Push in WBC is *web* push — a
   service worker and the Push API — and neither Capacitor shell has it: iOS
   WKWebView exposes no Notification API or service worker, Android's WebView
   has no Push API. Both reported `unsupported`, and iOS additionally reported
   "not standalone", so the App Store build matched the Safari branch exactly
   and told users to tap Share → Add to Home Screen *in an app already on their
   home screen*. Android's told them to go and use Chrome. Unfollowable
   instructions are what Guideline 2.1 rejections are made of. Native shells now
   get an honest card pointing at the web app, and no toggle — a switch that
   cannot come on is worse than no switch. Covered by
   `NotificationSettings.test.js` (7 new tests).

Native push is a real feature gap, not a compliance one. If you want it in the
apps, it needs `@capacitor/push-notifications`, an APNs key, the
`aps-environment` entitlement, and a token path registering against the player
id. That is its own piece of work — don't hold the submission for it.

---

## The two decisions to make before anything else

### Decision 1: Apple, listed or unlisted

MNQ went Unlisted, and WBC is the same kind of app: a tournament for a fixed
group of about sixteen people, behind a password. Apple's Guidelines 4.2
(minimum functionality) and 4.3 (spam) are what catch these — not because the
app is bad, but because the public App Store is the wrong shelf for it.

**DECIDED: Unlisted, deliberately, from the first submission.**

What Unlisted means in practice:

- Fully reviewed and approved by Apple, exactly like a public app.
- Not discoverable — no search, no charts, no category browsing. Distributed by
  a direct link you send to the sixteen.
- Available in every App Store region, to anyone with the link. Your in-app
  gate (tournament password + roster claim) is still what keeps strangers out,
  which it already does.
- **It is a one-way door.** Once an app record is converted to Unlisted it
  cannot go back to public. If there is any chance you'd want WBC publicly
  listed later, that's an argument for trying public first.

The process is not "tick a box". Apple requires the app to be *already on the
App Store* or *ready for final distribution and submitted to App Review* —
requests are declined for apps that haven't been submitted, or that are in a
beta state. So:

1. Submit the build to App Review as a normal, publicly-available app.
2. In **Review Notes**, state plainly that the app is intended for unlisted
   distribution.
3. Separately file the request at
   <https://developer.apple.com/contact/request/unlisted-app/>.
   **The Account Holder must submit this form** — requests from other roles get
   rejected.

On approval the distribution method flips to "Unlisted App" in Pricing and
Availability and Apple generates the link. It applies to all future versions.

The Account Holder on this account is **aarondjensen@gmail.com** — the unlisted
request form must be submitted by that identity or it is rejected without being
read.

### Decision 2: Play, production or testing-only

**Decided: INTERNAL TESTING**, for WBC and for The Bourbon Cup both.

Up to 100 testers, live in minutes, exempt from the Data safety form, and no
closed test at all — no twelve testers, no fourteen days, no production-access
application. This is the one that cost you with MNQ, and the answer turned out
to be that you never had to fight it: [Step 0](#step-0-do-you-even-need-production-access)
already suspected as much and it was right.

Play has no Unlisted track — that is an Apple mechanism — but internal testing
is already the shape Unlisted suggests. The opt-in URL goes on the website, a
tester taps it, Play installs the app, and it updates itself from then on.
Nobody searches for anything and the app never appears in the store to be
found. The pairing across both stores is therefore: **Unlisted on iOS,
internal testing on Play.**

Everything below about the twelve testers stays, because it is the right
instructions if WBC ever wants a public listing. Until then it is reference
rather than the plan.

#### The one line the tester message has to contain

The failure mode of internal testing is not a broken app, it is a tester who
never gets one. **The account that opts in must be the account signed into the
Play Store on that phone.** A man with a work Google account on his phone and a
personal one on your list sees "item not found", cannot diagnose it, and
reasonably concludes the app is broken. Collect the addresses first, add them
all at once, and tell everybody to check
**Settings → Google** before replying.

---

## The reviewer problem, already solved

Every gated app fails review the same way: the reviewer opens it, hits a login
wall, has no account, and rejects under Guideline 2.1. A tournament password
plus "pick your name off a roster of sixteen" is worse than a normal login —
you can't hand a reviewer a name that belongs to a real player.

WBC already answers this. The sign-in screen has a **Live Leaderboard /
"No account needed — browse the whole app, read-only"** button that drops
straight into guest mode, and a guest gets every screen a player gets —
pairings, scoring, betting, photos, history — and can write nothing. That's
enforced twice, in `src/lib/guestMode.js` on the client and in `firestore.rules`
on the server, with `src/lib/db.guest.test.js` proving no write is ever handed
to Firestore.

Use it on both stores rather than minting a fake player:

- **Apple** — in App Review Information, leave "Sign-in required" unchecked and
  put the guest path in Review Notes.
- **Play** — in the **App access** section, choose "All functionality is
  available without special access" is *not* right either; choose the restricted
  option and write the same guest instructions in the box.

Draft text for both, adjust to taste:

> WBC is the app for a private, invitation-only golf tournament run by the same
> group of ~16 friends since 2009. Full access requires the event password and a
> claimed roster spot, which we cannot issue for a review account.
>
> Instead, tap **"Live Leaderboard — No account needed"** on the sign-in screen.
> This opens the entire app read-only: leaderboards, pairings, scorecards, the
> side-game and buy-in screens, the photo gallery, and 17 years of tournament
> history. Every screen a player sees is reachable this way. No sign-in needed.

---

## Content risks — say these out loud in Review Notes

Two features in WBC draw review scrutiny. Both are defensible. Neither is
defensible if a reviewer discovers it themselves.

### The side games and the buy-in sheet

`src/components/BettingView.jsx` and `src/components/BuyIns.jsx` run skins,
closest-to-the-pin, low net, and a "market" where players buy shares on who
wins — with dollar pots, per-share payouts, and a collection sheet showing who
still owes what.

Apple Guideline 5.3 (Gaming, Gambling, Lotteries) and Play's Real-Money Gambling
policy both exist for this. What keeps WBC on the right side of them is that
**no money moves through the app and no operator takes a cut** — it is a ledger
of cash agreed and handed over in person in a car park. Skins/nassau trackers
are a well-established category on both stores.

Do three things:

1. **Answer the age-rating questionnaires honestly.** Apple's rating flow and
   Play's IARC questionnaire both ask about gambling and contests. Answer yes
   where yes is true; expect to land at 17+ / Mature 17+. A rating that's too
   low is a policy violation found later; a rating that's too high costs you
   nothing with an audience of sixteen adults.
2. **Do not lead the store listing with it.** The listing describes a tournament
   scoring and history app. That's accurate, and it keeps the automated
   gambling-keyword filters out of it.
3. **Disclose it in Review Notes**, roughly:

   > The app includes a scorekeeping ledger for traditional golf side games
   > (skins, closest-to-the-pin, low net) played among the private group at the
   > in-person event. **No money is transacted, collected, held, or transferred
   > through the app, and there is no payment processing of any kind.** Buy-ins
   > are cash settled in person; the app only records who has paid so the
   > organizer isn't tracking it on paper. There is no house, no rake, and no
   > connection to any gambling operator.

### The photo gallery

`src/components/PhotosView.jsx` lets players upload photos. That is
user-generated content, and Apple Guideline 1.2 asks for four things: a filter
for objectionable material, a way to report it, a way to block abusive users,
and published contact info.

WBC's honest answer is that the threat model doesn't apply: posting requires the
event password *and* a claimed roster spot, so uploaders are sixteen known
people who see each other every year. Guests can view but cannot post. Photos
can be deleted by their uploader and by the director.

**That argument usually works, and "usually" is the problem when you want it
right the first time.** Two options:

- *Cheapest:* put the argument in Review Notes (draft below) and submit.
- *Safest:* add a "Report photo" affordance to the lightbox that flags the
  document and notifies the director. It's a small change and it removes the
  argument entirely. If you want this, say so and I'll build it.

  > The photo gallery is not public UGC. Uploading requires both the private
  > event password and a claimed spot on a fixed 16-person roster; the group
  > has known each other personally for 17 years. Unauthenticated guests can
  > view but cannot upload. Any photo can be removed by its uploader or by the
  > tournament director from within the app. Contact: <your email>.

---

## Apple: the sequence

Weeks before, in the Developer portal and Firebase — do these first, they have
lead times and they break silently:

1. **App ID capabilities.** `com.wannabecup.app` must have **Sign in with Apple**
   enabled in Certificates, Identifiers & Profiles. The entitlement in the repo
   is only half of it.
2. **Firebase Apple provider.** Console → Auth → Sign-in method → Apple, with
   the Service ID, Team ID, Key ID and `.p8` key filled in. `APPLE_PROVIDER_ENABLED`
   and `NATIVE_APPLE_ENABLED` are both already `true` in `src/firebase.js`, so a
   half-configured provider ships as a button that fails.
3. **Authorized domains.** `wannabecup.com` is the `authDomain` when providers
   are on. Confirm it's in Firebase Auth → Settings → Authorized domains.

Then:

4. `npm run build && npx cap sync ios`
5. Open `ios/App/App.xcworkspace`. Set **MARKETING_VERSION** to `1.0.0` and
   **CURRENT_PROJECT_VERSION** to `1`. Confirm `PrivacyInfo.xcprivacy` appears
   under Build Phases → Copy Bundle Resources (this branch added it; verify
   rather than trust).
6. Archive, then Distribute → App Store Connect.
7. **Test the archive through TestFlight on a real iPhone before submitting.**
   Specifically: Sign in with Apple, Sign in with Google, the guest button, and
   the Notifications row in More (it should now say "Not in the app yet", not
   Safari instructions).
8. App Store Connect listing:
   - **Name: "Wannabe Cup"** (DECIDED). Not "WBC" — it collides with the World
     Baseball Classic and the World Boxing Council, a 5.2.1 trademark
     rejection you don't need, on a 30-character field. The home-screen name
     stays "WBC" (`CFBundleDisplayName`, unchanged); the two are independent
     and nothing in the repo needs editing for this.
   - **Screenshots:** 6.9" iPhone (1290×2796 or 1320×2868) is the only required
     size. `TARGETED_DEVICE_FAMILY = 1`, so the app is iPhone-only and **no
     iPad screenshots are needed**. Take them from guest mode against a
     finished edition so the boards have real numbers in them.
   - **Privacy Policy URL:** `https://wannabecup.com/privacy`
   - **App Privacy answers:** must match `PrivacyInfo.xcprivacy` — email, name,
     user ID, photos, other user content; all "linked to user", all "app
     functionality", none used for tracking. Apple compares them.
   - **Age rating:** per the questionnaire, honestly. Expect 17+.
   - **Review Notes:** guest instructions + the betting paragraph + the photo
     paragraph + the unlisted note.
9. File the [unlisted request](https://developer.apple.com/contact/request/unlisted-app/)
   as Account Holder, if going that route.

---

## Google Play: the sequence

### Step 0: do you even need production access?

**Check this before anything else — it may make the whole 12-testers problem
disappear.**

The 12-testers/14-days rule applies to **personal developer accounts created
after 13 November 2023**. Organization accounts and personal accounts older
than that are exempt outright.

**It is re-earned for each app.** This paragraph used to leave the question
open. The answer: the ELIGIBILITY is account-scoped — whether the rule applies
to you at all depends on when the account was created — but the TEST is per
app. A personal account created after 13 November 2023 runs a fresh 12-tester,
14-day closed test for every new app it wants in production, and access earned
by one does not carry to the next.

Worth knowing in both directions. WBC gets no free ride off The Bourbon Cup —
and the two clocks are independent, so both can run at the same time, with the
same twelve people, rather than one queueing behind the other.

The numbers and the scope have both moved more than once, so confirm rather
than trusting this paragraph. Two minutes in your own console beats any blog:

> Create the WBC app record in Play Console (free, no commitment, doesn't
> publish anything) and open its **Dashboard**. If a "Complete testing
> requirements" / "Run a closed test with 12 testers" task card appears for
> WBC, the requirement is per-app for your account and you have your answer.
> If the dashboard goes straight to release tasks, you already have production
> access.

**But check whether you need production at all first**, because it may make the
question moot. WBC has sixteen users. The **internal testing track holds up to
100 testers, installs through the Play Store, has no closed-testing
requirement, no 14-day wait, and pushes updates in minutes instead of days.**
For a private tournament that is arguably a *better* distribution channel than
production.

If the honest answer is "the sixteen guys just need to install it", use internal
testing and skip the rest of this section. Only pursue production — and only
then care about the per-app question — if you want WBC publicly listed on Play.

### Set the testers up first, whichever track you use

A tester needs the event password to exercise anything, and a membership is not
edition-scoped — being in the tournament means being able to write to *every*
year of it. Two controls exist for that, both in **Admin → Tournaments**, and
they take about four taps:

1. **"Create sandbox from 2026"** cuts `wbc_demo` — a permanent edition with no
   year of its own, carrying the roster, handicaps and buy-in amounts but no
   scores, pairings or bets. It opens as a tournament nobody has played. It is
   labelled **DEMO** in the picker rather than a year, so it can never be
   confused with a real tournament, and it never needs replacing when the
   calendar moves on. "Rebuild sandbox" wipes and re-cuts it — do that between
   testing rounds.
2. **"Lock all but …"** freezes every real year against everyone but a
   director. The sandbox is deliberately never swept up by it; testers keep
   full write access to the one edition that does not matter.

Then switch to the sandbox and hand out the link. A tester who wanders into
2026 sees everything and can change nothing — enforced in `firestore.rules`,
not in the UI, so it holds against someone talking to Firestore directly.

### The 12 testers, properly

If you do need production access: **Google does not count downloads.** This is
exactly where MNQ failed. The production-access questionnaire asks how you
recruited testers, what feedback you gathered, and *how you acted on it* — and
Google separately looks at whether tester usage "was consistent with how you
would expect a production user to use your app". Applications are refused for
vague answers, for testers who never genuinely engaged, and for no app updates
showing feedback was acted upon.

What that means concretely:

- **12 testers minimum, opted in continuously for 14 days.** The clock starts
  only once the release is approved *and* 12 testers have opted in. Anyone who
  opts out resets your headroom — recruit **15 or 16**, not exactly 12.
- **Time the test to the tournament.** This is WBC's structural advantage over
  MNQ: during an actual edition your testers will open the app dozens of times
  to enter scores, check pairings, and watch the leaderboard — real production
  usage, generated naturally. A 14-day window that *contains* a tournament
  weekend produces exactly the engagement profile Google wants. A 14-day window
  in the off-season produces the MNQ result.
- **Tell the testers what to do**, don't just send the link. Ask each of them to
  open it on several different days, enter scores for a round, look at the
  history, open the photo gallery, and send you one sentence about anything
  that felt wrong.
- **Collect the feedback somewhere you can quote** — a group text is fine.
- **Ship at least one update during the 14 days that visibly answers
  feedback**, and be able to name it in the questionnaire.
- **Answer the questionnaire with specifics**: number of testers, how you know
  them, which features they used, three concrete pieces of feedback, and the
  change each one produced.

### Everything else on Play

1. `npm run build && npx cap sync android`
2. Signing: `android/keystore.properties` (see the `.example` beside it) or the
   `WBC_KEYSTORE_*` env vars. **Back the keystore up somewhere you will still
   have in five years** — an upload key cannot be casually rotated.
3. `cd android && ./gradlew bundleRelease` → `app/build/outputs/bundle/release/`.
   Watch for the `WBC: no release signing configured` warning; the build gladly
   produces an unsigned bundle Play will refuse.
4. **Add the Play App Signing SHA-1 and SHA-256 to Firebase.** This is the
   classic first-release failure and it is invisible until it isn't: Play
   re-signs your AAB with its own key, so the certificate fingerprint that
   reaches Google Sign-In in production is *not* the one from your local
   release build. Google sign-in works perfectly for you and fails for every
   user. After the first upload, Play Console → Release → Setup → App signing →
   copy both fingerprints → Firebase Console → Project settings → the Android
   app → Add fingerprint → **re-download `google-services.json`** into
   `android/app/` and rebuild.
5. Store listing:
   - **Name:** "Wannabe Cup" (30 chars max), same trademark reasoning as Apple.
   - **Screenshots:** 2–8, phone, 9:16. **Feature graphic 1024×500** (required —
     easy to forget). **Icon 512×512.**
   - **Privacy policy URL:** `https://wannabecup.com/privacy`
   - **Data safety form:** must match what the app does *and* match the Apple
     answers — email, name, user IDs, photos, app activity; collected,
     encrypted in transit, deletable. Point the deletion URL at
     `https://wannabecup.com/account-deletion`.
   - **Content rating:** the IARC questionnaire, honestly, including the
     gambling questions.
   - **App access:** restricted — paste the guest instructions.
   - **Target audience:** 18+. Do not let this app anywhere near the "designed
     for families" flow.

---

## Before you press submit, on either store

Run the checks, then use the app:

```sh
npm run test:run && npm run lint && npm run build
node --test firestore.rules.test.mjs   # if firestore.rules changed
```

Then, on a real device, from a release build, as a guest **and** as a signed-in
player:

- [ ] Sign in with Google works
- [ ] Sign in with Apple works (iOS)
- [ ] Guest button opens the app read-only, and every tab loads
- [ ] Every tab loads for a signed-in player, including the lazy-loaded ones
      (Betting, Admin, Photos — a broken import in a lazy chunk cannot fail
      anywhere before somebody taps the tab)
- [ ] Account deletion completes and the profile becomes re-claimable
- [ ] The Notifications row says "Not in the app yet"
- [ ] The app survives being backgrounded mid-round and reopened

---

## Realistic timeline

| | |
| --- | --- |
| Apple review | 24–48 hours, typically |
| Apple unlisted request | a few days to two weeks, **after** the app is submitted or live |
| Play, if you already have production access | a few days |
| Play, if you don't | 14 days of testing, then up to a week for the production-access decision |

The unlisted request and the Play testing window are the two things that cannot
be compressed. Start both the moment a build is uploadable.
