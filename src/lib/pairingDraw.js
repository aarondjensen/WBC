// ══════════════════════════════════════════════════════════════════
//  pairingDraw — how a round's groups get decided.
// ══════════════════════════════════════════════════════════════════
//
// Three methods, one per round, chosen by the director (see PairingsEditor).
// The defaults mirror how the WBC has always been drawn:
//
//   R1   manual         the opening foursomes are somebody's decision, not an
//                       algorithm's — first round of the trip, people want to
//                       play with who they came with
//   R2   avoid_repeats  everybody has now played with three people, and the
//                       point of the week is to play with the others
//   R3+  leaderboard    once there are standings, the draw follows them
//
// Extracted from App.jsx because it is the most ALGORITHMIC thing in this app
// and it had no test. `optimizeAvoidRepeats` in particular is a randomized
// multi-start hill climb — the kind of code that keeps working by luck for a
// long time and then quietly stops finding good answers, with nothing to say
// so. It is also seedable now, which is what makes it testable at all.

// ── PAIRING STRATEGY ──
// Each round can be paired by one of three methods, configurable per-round in the
// director console (see PairingsEditor). Defaults mirror the classic WBC format:
//   R1  → manual        (director sets the opening foursomes by hand)
//   R2  → avoid_repeats (auto: minimize players sharing a group with a prior partner)
//   R3+ → leaderboard   (auto: group by current standings)
export const PAIRING_MODES = ["manual", "avoid_repeats", "leaderboard"];
export const PAIRING_MODE_LABEL = { manual: "Manual", avoid_repeats: "Optimal", leaderboard: "Leaderboard" };
export const defaultPairingMode = (rnd) => rnd === 1 ? "manual" : rnd === 2 ? "avoid_repeats" : "leaderboard";
// Resolve the effective per-round strategy config from stored state, applying defaults.
export const resolvePairingCfg = (pairingStrategy, rnd) => {
  const stored = (pairingStrategy || {})[rnd];
  return {
    mode: stored?.mode || defaultPairingMode(rnd),
    // leadersLast: for leaderboard mode, put the leaders in the LAST group (latest
    // tee time) — the standard "final pairings go off last" convention. Default true.
    leadersLast: stored?.leadersLast != null ? stored.leadersLast : true,
  };
};

// Balanced group sizes: `numGroups` groups whose sizes differ by at most 1 (max 4
// each for a full field). e.g. 12/3 → [4,4,4]; 10/3 → [4,3,3]; 13/4 → [4,3,3,3].
export const balancedGroupSizes = (n, numGroups) => {
  if (numGroups <= 0) return [];
  const base = Math.floor(n / numGroups);
  const extra = n % numGroups;
  return Array.from({ length: numGroups }, (_, i) => base + (i < extra ? 1 : 0));
};

// Build a map pid → Set(prior partners) from every round strictly BEFORE `beforeRound`.
// For round 2 this yields exactly each player's round-1 foursome, which is what the
// "no repeats" method separates.
export const buildPriorPartners = (pairingsData, beforeRound) => {
  const partners = {};
  const add = (a, b) => { (partners[a] = partners[a] || new Set()).add(b); };
  Object.entries(pairingsData || {}).forEach(([rnd, groups]) => {
    if (parseInt(rnd) >= beforeRound) return;
    (groups || []).forEach(grp => grp.forEach(a => grp.forEach(b => { if (a !== b) add(a, b); })));
  });
  return partners;
};

// Count intra-group pairs that were also partners in a prior round.
export const countRepeatPairs = (groups, partners) => {
  let c = 0;
  groups.forEach(grp => {
    for (let i = 0; i < grp.length; i++)
      for (let j = i + 1; j < grp.length; j++)
        if (partners[grp[i]] && partners[grp[i]].has(grp[j])) c++;
  });
  return c;
};

const shuffleArr = (arr, rand = Math.random) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

const chunkBySizes = (order, sizes) => {
  const g = []; let k = 0;
  for (const s of sizes) { g.push(order.slice(k, k + s)); k += s; }
  return g;
};

// Partition playerIds into `numGroups` balanced groups minimizing the number of
// repeat-partner pairs. Randomized multi-start + swap hill-climb — fast and reliable
// for club-sized fields. NOTE: zero repeats is only achievable when the number of
// groups is >= the group size (e.g. threesomes with 4+ groups). With 12 players in
// foursomes the mathematical minimum is 3 forced repeat pairs (one per group), which
// this consistently finds. Returns { groups, repeats }.
// `rand` is injected so a test can pin the shuffle. Every caller in the app
// omits it and gets Math.random, which is what a draw should be.
export const optimizeAvoidRepeats = (playerIds, numGroups, partners, restarts = 80, rand = Math.random) => {
  const sizes = balancedGroupSizes(playerIds.length, numGroups);
  let best = null, bestCost = Infinity;
  for (let r = 0; r < restarts; r++) {
    let groups = chunkBySizes(shuffleArr(playerIds, rand), sizes);
    let cost = countRepeatPairs(groups, partners);
    let improved = true, guard = 0;
    while (improved && cost > 0 && guard++ < 500) {
      improved = false;
      outer:
      for (let gi = 0; gi < groups.length; gi++)
        for (let gj = gi + 1; gj < groups.length; gj++)
          for (let ai = 0; ai < groups[gi].length; ai++)
            for (let bj = 0; bj < groups[gj].length; bj++) {
              const A = groups[gi][ai], B = groups[gj][bj];
              groups[gi][ai] = B; groups[gj][bj] = A;
              const nc = countRepeatPairs(groups, partners);
              if (nc < cost) { cost = nc; improved = true; }
              else { groups[gi][ai] = A; groups[gj][bj] = B; }
              if (cost === 0) break outer;
            }
    }
    if (cost < bestCost) { bestCost = cost; best = groups.map(g => g.slice()); if (bestCost === 0) break; }
  }
  return { groups: best || chunkBySizes(playerIds.slice(), sizes), repeats: bestCost === Infinity ? 0 : bestCost };
};

// Group by leaderboard standings. `orderedPids` is best-first. leadersLast → the
// leaders land in the LAST group (latest tee time); otherwise they lead off first.
export const groupByLeaderboard = (orderedPids, numGroups, leadersLast) => {
  const sizes = balancedGroupSizes(orderedPids.length, numGroups);
  const order = leadersLast ? orderedPids.slice().reverse() : orderedPids.slice();
  return chunkBySizes(order, sizes);
};
