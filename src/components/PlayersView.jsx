// ══════════════════════════════════════════════════════════════════
//  PlayersView — the WBC Index, and the rounds it is made of.
// ══════════════════════════════════════════════════════════════════
//
// Every other screen in this app is about the tournament being played right
// now. This one is about the fourteen careers behind it: 424 recorded rounds
// from 2012 to 2025, turned into one number per player.
//
// The number on its own would be a claim. A handicap that arrives without its
// working invites exactly one response — "that can't be right" — and there is
// no way to answer it unless the app can show which rounds it used. So the
// screen is built in three layers, and each one is the answer to the question
// the layer above it raises:
//
//   the index          → "made of what?"
//   the last 12, drawn → "which of those counted?"
//   every round listed → "where did these come from?"
//
// The bar chart carries the second layer on its own: a column per round in the
// window, the ones that made the average filled in accent and the rest left as
// outlines. Nothing has to be read to see that the index is an average of the
// good half of a sample.
//
// The asterisk is the one piece of editorial here. A player who has been to
// every WBC is measured on the tournament's last twelve rounds; a player who
// comes every third year is measured on twelve rounds spanning a decade. Both
// indexes are correct arithmetic and they do not mean the same thing, so the
// second says so — see the `stale` rule in lib/handicap.js.
//
// One more thing the layout is holding: the WBC's field is twelve, and the
// active list is sized so all twelve land on one screen — on the smallest phone
// anybody brings, not just the roomiest. A roster you scroll to see the end of
// is a roster you compare in two halves.
//
// That budget is what decides the row's padding and line-heights, why the row
// is a single line, why there is no PLAYER / INDEX column heading, and why the
// definition above the list is a caption rather than a bordered card. Each of
// those was measured, not guessed: on a 375×667 handset the twelve rows plus
// everything above them come to 507 of the 521px between the header and the nav
// bar. Anything added up there costs a row.
//
// The math lives in lib/handicap.js and the rounds in data/history.js (which is
// generated — see scripts/build-history.mjs). This file only draws them.

import { Fragment, useMemo, useState } from "react";
import { K, FONT, FS, R, ALPHA, MOTION } from "../theme";
import { Btn, Card, SectionLabel } from "./ui";
import { indexFor, matchHistoryName, recentRoundSlots, WINDOW, COUNTING } from "../lib/handicap";
import { HISTORY_PLAYERS } from "../data/history";

// The tournament's own last 12 rounds — the yardstick the asterisk is measured
// against, and stable for the life of the bundle since the history is baked in.
const RECENT_SET = new Set(recentRoundSlots());

// The list's four columns: the name, the career index, what this year plays
// off, and the chevron. Shared by the header and every row, so a heading can
// never drift out of line with the numbers under it.
const LIST_COLS = "minmax(0, 1fr) 46px 54px 10px";

// The size of both chart marks — the filled bar swatch and the amber dot. One
// constant so the legend's dot is the same object as the one under the bars,
// rather than a second size that drifts from what it is describing.
const MARK = 9;

// Clearance under the last row. The nav bar's trophy sits in a dome that rises
// 24px above the bar, so a list that stops at the bar's edge has its final row
// half-covered by a trophy.
const BOTTOM_PAD = 44;

// An index, printed. Always one decimal place — 11 and 11.0 are the same
// handicap and printing them differently makes a column of them look ragged.
const fmtIndex = (n) => (n == null ? "—" : n.toFixed(1));
// A differential. Same precision, and negative ones keep their sign — a round
// under the course rating is a real thing and should look like one.
const fmtDiff = (n) => (n == null ? "—" : n.toFixed(1));

// ── WindowChart ────────────────────────────────────────────────────
// The last twelve rounds, oldest at the left. Height is the differential, so a
// short bar is a good round — which is the right way round for golf, where the
// low number wins, and the same direction as every other number on this screen.
//
// Bars run from zero, not from the best round in the window. Zooming the scale
// onto the range would make a spread of 14 to 25 look like the difference
// between nothing and everything; zero is also a real place on this axis — it
// is a round shot exactly to the course rating — so the picture stays honest
// about how far apart the twelve rounds actually are. A round that beat the
// rating pulls the floor below zero rather than clipping.
function WindowChart({ idx }) {
  const cols = [...idx.window].reverse();
  if (!cols.length) return null;

  const diffs = cols.map(c => c.differential);
  const top = Math.max(...diffs);
  const floor = Math.min(0, ...diffs);
  const H = 92;
  const barH = (d) => Math.max(4, ((d - floor) / (top - floor || 1)) * H);

  // Consecutive rounds from the same year share one label under the chart —
  // twelve repetitions of "2025" is noise, three spans is the shape of a career.
  const groups = [];
  for (const c of cols) {
    const last = groups[groups.length - 1];
    if (last && last.year === c.year) last.count++;
    else groups.push({ year: c.year, count: 1 });
  }

  // Which of these rounds are outside the twelve the rest of the field is
  // measured on — the reason this player's index wears an asterisk.
  const outsiders = cols.filter(c => !RECENT_SET.has(c.key)).length;

  const grid = { display: "grid", gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))`, gap: 3 };

  return (
    <div>
      <div style={{ ...grid, alignItems: "end", height: H }}>
        {cols.map(c => {
          const on = idx.countingKeys.has(c.key);
          return (
            <div key={c.key} style={{
              height: barH(c.differential),
              borderRadius: `${R.xs}px ${R.xs}px 0 0`,
              background: on ? K.acc : `${K.acc}${ALPHA.wash}`,
              border: `1px solid ${on ? "transparent" : `${K.acc}${ALPHA.line}`}`,
              boxShadow: on ? `0 0 10px ${K.accGlow}` : "none",
              transition: `height ${MOTION}`,
            }} />
          );
        })}
      </div>

      {/* The differential under its own bar. This is the number the index is an
          average of, so it belongs on the picture rather than only in the list
          below it. */}
      <div style={{ ...grid, marginTop: 5 }}>
        {cols.map(c => (
          <div key={c.key} style={{
            textAlign: "center", fontSize: FS.micro,
            fontWeight: idx.countingKeys.has(c.key) ? 800 : 500,
            color: idx.countingKeys.has(c.key) ? K.acc : K.t3,
          }}>{fmtDiff(c.differential)}</div>
        ))}
      </div>

      {/* ── Why the index is asterisked, on the rounds that cause it ──
          A round the rest of the field did not play, marked where it sits.
          This replaced a paragraph above the chart that named the same rounds
          in prose — "2024 R4, 2024 R3 … are missing, so the window reaches back
          to 2014 R1" — which is a sentence you have to hold in your head and
          then map onto twelve bars. The mark is on the bar.

          Amber, the same colour as the asterisk it explains, so the two read as
          one statement rather than two warnings. */}
      {outsiders > 0 && (
        <div style={{ ...grid, marginTop: 4 }}>
          {cols.map(c => (
            <div key={c.key} style={{ display: "flex", justifyContent: "center", height: MARK }}>
              {!RECENT_SET.has(c.key) && (
                <span style={{ width: MARK, height: MARK, borderRadius: "50%", background: K.warn }} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* The year rail. Same grid, so a span of three columns lines up with
          exactly the three bars it names. */}
      <div style={{ ...grid, marginTop: 6 }}>
        {groups.map((g, i) => (
          <div key={`${g.year}-${i}`} style={{
            gridColumn: `span ${g.count}`,
            borderTop: `1px solid ${K.bdr}`,
            paddingTop: 4, textAlign: "center",
            fontSize: FS.micro, fontWeight: 700, color: K.t3, letterSpacing: 0.5,
          }}>{g.year}</div>
        ))}
      </div>

      {/* Only the two marks that mean something on their own. A third entry
          used to name the hollow bars — "in the window, didn't count" — which
          is what a bar IS when it is not filled: the absence of the first
          entry, spelled out, taking a line to say nothing the picture had not
          already said. */}
      <div style={{ display: "flex", flexWrap: "wrap", columnGap: 14, rowGap: 5, marginTop: 12, fontSize: FS.micro, color: K.t3 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: MARK, height: MARK, borderRadius: R.xs, background: K.acc, flexShrink: 0 }} />
          included in index
        </span>
        {outsiders > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: K.warn }}>
            <span style={{ width: MARK, height: MARK, borderRadius: "50%", background: K.warn, flexShrink: 0 }} />
            outside the WBC&apos;s last {WINDOW}
          </span>
        )}
      </div>
    </div>
  );
}

// ── RoundRow ───────────────────────────────────────────────────────
// One historical round. Marked three ways, weakest to strongest: an ordinary
// round is plain, a round inside the last twelve carries an accent edge, and a
// round that made the average is filled and carries its differential in accent.
const ROUND_COLS = "26px minmax(0, 1fr) 34px 34px 46px";

function RoundRow({ r, inWindow, counting }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: ROUND_COLS, gap: 6, alignItems: "center",
      padding: "6px 8px", borderRadius: R.sm,
      background: counting ? `${K.acc}${ALPHA.wash}` : "transparent",
      borderLeft: `2px solid ${counting ? K.acc : inWindow ? `${K.acc}${ALPHA.line}` : "transparent"}`,
    }}>
      <span style={{ fontSize: FS.micro, fontWeight: 700, color: K.t3 }}>R{r.round}</span>
      <span style={{
        fontSize: FS.small, fontWeight: 600, color: counting ? K.t1 : K.t2,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{r.course?.name || "—"}</span>
      <span style={{ fontSize: FS.small, color: K.t2, textAlign: "right" }}>{r.gross}</span>
      <span style={{ fontSize: FS.small, color: K.t3, textAlign: "right" }}>{r.net ?? "—"}</span>
      <span style={{
        fontSize: FS.small, fontWeight: counting ? 800 : 600,
        color: counting ? K.acc : K.t2, textAlign: "right",
      }}>{fmtDiff(r.differential)}</span>
    </div>
  );
}

// ── PlayerDetail ───────────────────────────────────────────────────
function PlayerDetail({ row, onBack, isDirector = false, onSetOverride = null }) {
  const idx = row.idx;
  const hasRounds = !!idx && idx.window.length > 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.override == null ? "" : String(row.override));

  // Career, newest year first. A year's rounds are already in order inside it.
  const byYear = useMemo(() => {
    const out = [];
    for (const r of idx?.rounds || []) {
      const last = out[out.length - 1];
      if (last && last.year === r.year) last.rounds.push(r);
      else out.push({ year: r.year, rounds: [r] });
    }
    return out;
  }, [idx]);

  const windowKeys = useMemo(() => new Set((idx?.window || []).map(r => r.key)), [idx]);

  // The last round still inside the window, and only when something older
  // follows it. A player whose whole career fits in the window has no boundary
  // to draw, and a dotted line under the final row would invent one.
  const windowEndsAfter = useMemo(() => {
    const last = idx?.window?.[idx.window.length - 1]?.key;
    if (!last) return null;
    const rounds = idx.rounds || [];
    const at = rounds.findIndex(r => r.key === last);
    return at >= 0 && at < rounds.length - 1 ? last : null;
  }, [idx]);

  return (
    <div style={{ fontFamily: FONT, paddingBottom: BOTTOM_PAD }}>
      <button onClick={onBack} style={{
        display: "flex", alignItems: "center", gap: 6, marginBottom: 12,
        background: "transparent", border: "none", cursor: "pointer",
        color: K.t3, fontSize: FS.small, fontWeight: 700, fontFamily: FONT, padding: 0,
      }}>
        <span style={{ fontSize: FS.body }}>‹</span> All players
      </button>

      {/* ── The number ── */}
      {/* The name and the index, and nothing else. This card carried three more
          lines — a WBC INDEX caption under the number, "best 5 of 12 · 2014–
          2024", and what the player is playing off this year — and every one of
          them was answered better a little further down the page: by the
          section headings, by the chart, and by the year column on the list you
          arrived from. A hero that restates the page is a hero you scroll past.

          The asterisk stays on the number, and the amber dots in the chart
          below say what it means. */}
      <Card style={{ marginBottom: 12, textAlign: "center" }} pad={18}>
        <div className="wbc-name" style={{
          fontSize: FS.lead, fontWeight: 800, color: K.t2,
          // No textTransform here: it was uppercasing this name before the
          // app-wide rule existed, and an INLINE value beats the .wbc-name
          // class, which would leave this one card in full caps while every
          // other name on screen is in small caps.
          letterSpacing: 1.2, marginBottom: 2,
        }}>{row.name}</div>
        <div style={{ fontSize: FS.display, fontWeight: 900, color: idx?.index == null ? K.t3 : K.acc, lineHeight: 1.1 }}>
          {fmtIndex(idx?.index)}
          {idx?.index != null && (idx.stale || idx.overridden) && <span style={{ color: K.warn }}>*</span>}
        </div>

        {/* The override, on the number it overrides. It had a card of its own,
            which spent a full panel and a sentence of explanation on a control
            a director uses once a season — and put a paragraph between the
            index and the chart that proves it, for everybody who is not a
            director and cannot use it at all.

            Closed it is one small button. Open it is the field and its two
            answers, in the same place. */}
        {isDirector && onSetOverride && (!editing ? (
          <Btn variant="secondary" size="sm" style={{ marginTop: 12 }}
            onClick={() => { setDraft(row.override == null ? "" : String(row.override)); setEditing(true); }}>
            {idx?.overridden ? "Edit override" : "Override"}
          </Btn>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 6 }}>
            <input
              autoFocus
              inputMode="decimal"
              value={draft}
              placeholder={idx?.computed != null ? fmtIndex(idx.computed) : "index"}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { onSetOverride(draft); setEditing(false); } }}
              style={{
                width: 80, padding: "7px 8px", background: K.inp,
                border: `1px solid ${K.acc}${ALPHA.line}`, borderRadius: R.sm,
                color: K.t1, fontSize: FS.lead, fontWeight: 800, fontFamily: FONT,
                textAlign: "center", boxSizing: "border-box",
              }}
            />
            <Btn size="sm" onClick={() => { onSetOverride(draft); setEditing(false); }}>Save</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Btn>
            {idx?.overridden && (
              <Btn variant="dangerOutline" size="sm" onClick={() => { onSetOverride(null); setEditing(false); }}>Clear</Btn>
            )}
          </div>
        ))}
      </Card>

      {!hasRounds && !idx?.overridden && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.5 }}>
            No recorded rounds yet. An index appears after a first WBC is played.
          </div>
        </Card>
      )}

      {/* ── A hand-set index ──
          The override carries the same asterisk the computed ones do, and this
          is what it means. It shows the computed number beside it whenever
          there is one: an index set by hand that hides what the rounds actually
          say is a number nobody can check, and the reason for setting one is
          usually a disagreement with those rounds — which is worth being able
          to see. */}
      {idx?.overridden && (
        <Card style={{ marginBottom: 12, borderColor: `${K.warn}${ALPHA.line}`, background: `${K.warn}${ALPHA.wash}` }}>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: K.warn, fontWeight: 900, fontSize: FS.lead, lineHeight: 1 }}>*</span>
            <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.5 }}>
              This index was <strong style={{ color: K.t1 }}>set by hand</strong> by a director, not
              computed from the rounds below.
              {idx.computed != null ? (
                <> Those rounds come to <strong style={{ color: K.t1 }}>{fmtIndex(idx.computed)}</strong>
                  {" "}on the usual rule — best {idx.counting.length} of {idx.window.length}.</>
              ) : (
                <> There are no recorded rounds to compute one from.</>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── A short sample ── */}
      {/* Not the asterisk's explanation — that is the amber dots in the chart.
          This says a different thing: how many of the rounds there count. It
          stands down for a hand-set index, where the card above has already
          named the computed number and the rule behind it. */}
      {hasRounds && idx.provisional && !idx.overridden && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.5 }}>
            Only {idx.window.length} recorded {idx.window.length === 1 ? "round" : "rounds"}, so this is the best
            {" "}<strong style={{ color: K.t1 }}>{idx.counting.length} of {idx.window.length}</strong> rather than
            the best {COUNTING} of {WINDOW}. Fewer rounds count on a short sample, so a single bad day is not
            baked into the number — it settles as more are played.
          </div>
        </Card>
      )}

      {/* ── The last 12 ── */}
      {hasRounds && (
        <>
          <SectionLabel style={{ textAlign: "center" }}>The last {idx.window.length}</SectionLabel>
          <Card style={{ marginBottom: 12 }}>
            <WindowChart idx={idx} />
          </Card>
        </>
      )}

      {/* ── The working ── */}
      {hasRounds && (
        <>
          <SectionLabel style={{ textAlign: "center" }}>Included in index</SectionLabel>
          <Card style={{ marginBottom: 12 }}>
            {idx.counting.map(r => (
              <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                <span style={{ fontSize: FS.micro, fontWeight: 700, color: K.t3, width: 52, flexShrink: 0 }}>
                  {r.year} R{r.round}
                </span>
                <span style={{
                  flex: 1, minWidth: 0, fontSize: FS.small, color: K.t2,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{r.course?.name}</span>
                <span style={{ fontSize: FS.small, fontWeight: 700, color: K.acc }}>{fmtDiff(r.differential)}</span>
              </div>
            ))}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              marginTop: 8, paddingTop: 8, borderTop: `1px solid ${K.bdr}`,
            }}>
              {/* A taper this steep bottoms out at one round, and "average of
                  1" is not a thing anybody says about a single number. */}
              <span style={{ flex: 1, fontSize: FS.label, fontWeight: 800, color: K.t3, letterSpacing: 0.8 }}>
                {idx.counting.length === 1 ? "BEST ROUND" : `AVERAGE OF ${idx.counting.length}`}
              </span>
              <span style={{ fontSize: FS.lead, fontWeight: 900, color: K.acc }}>{fmtIndex(idx.index)}</span>
            </div>
          </Card>
        </>
      )}

      {/* ── All rounds ── */}
      {byYear.length > 0 && (
        <>
          <SectionLabel style={{ textAlign: "center" }}>All rounds</SectionLabel>
          <Card pad={10}>
            <div style={{
              display: "grid", gridTemplateColumns: ROUND_COLS, gap: 6,
              padding: "0 8px 6px", borderBottom: `1px solid ${K.bdr}`,
              fontSize: FS.micro, fontWeight: 700, color: K.t3, letterSpacing: 0.5,
            }}>
              <span>RD</span>
              <span>COURSE</span>
              <span style={{ textAlign: "right" }}>GRS</span>
              <span style={{ textAlign: "right" }}>NET</span>
              <span style={{ textAlign: "right" }}>DIFF</span>
            </div>
            {byYear.map(y => (
              <div key={y.year} style={{ marginTop: 10 }}>
                <div style={{
                  fontSize: FS.label, fontWeight: 800, color: K.t2,
                  letterSpacing: 1, padding: "0 8px 4px",
                }}>{y.year}</div>
                {y.rounds.map(r => (
                  <Fragment key={r.key}>
                    <RoundRow
                      r={r}
                      inWindow={windowKeys.has(r.key)}
                      counting={idx.countingKeys.has(r.key)}
                    />
                    {/* Where the window ends. Above this line are the rounds
                        the index could have been built from; below it is
                        career. It falls mid-year as often as not — Matt V's
                        twelfth-most-recent round is in the middle of 2014 —
                        which is exactly why it is drawn against a ROW rather
                        than between two year headings.

                        The label sits in the middle of its own rule, naming
                        what is ABOVE it. Hung off one end it read as a heading
                        for the rounds below, which is the opposite of what the
                        line means. */}
                    {r.key === windowEndsAfter && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px 1px" }}>
                        <span style={{ flex: 1, borderTop: `1px dotted ${K.t3}` }} />
                        <span style={{
                          fontSize: FS.micro, fontWeight: 700, color: K.t3,
                          letterSpacing: 0.5, textTransform: "uppercase", flexShrink: 0,
                        }}>
                          last {idx.window.length}
                        </span>
                        <span style={{ flex: 1, borderTop: `1px dotted ${K.t3}` }} />
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

// ── PlayersView ────────────────────────────────────────────────────
// players — this edition's roster, used to name the rows and to spot the
//           signed-in player. The screen works without it: the index comes from
//           the recorded history, which needs no network at all.
// meId    — the signed-in player's id, for the gold row.
// registry — the `players` career registry, which carries `index_override`.
//           A row needs its registry id to be able to write one back, and the
//           registry holds men who are not in this year's field, so it is the
//           list overrides are keyed against rather than the roster.
// isDirector / onSetOverride — who may set a hand index, and how.
export function PlayersView({ players = [], registry = [], meId = null, year = null, isDirector = false, onSetOverride = null }) {
  const [open, setOpen] = useState(null);

  const rows = useMemo(() => {
    const overrideOf = (id) => registry.find(p => p.id === id)?.index_override ?? null;
    // The roster first, each matched to its history by name.
    const fromRoster = players.map(p => {
      const historyName = matchHistoryName(p);
      const override = p.index_override ?? overrideOf(p.id);
      return {
        key: p.id,
        pid: p.id,
        name: p.name,
        historyName,
        inField: true,
        isMe: !!meId && p.id === meId,
        override,
        // What this edition has them playing off. Read straight off the roster
        // row the leaderboard reads, never derived from the index — see
        // PlayerRow for why.
        year: Number.isFinite(Number(p.handicap_index)) ? Number(p.handicap_index) : null,
        idx: indexFor(historyName, { override }),
      };
    });
    // Then anybody in the record books who isn't in this year's field. The
    // history is a career registry — a man who last played in 2017 still has an
    // index, and hiding it would make the tab a roster rather than a record.
    //
    // They are matched back to the registry by name so a hand-set index can be
    // written for them too: not being in this year's field is exactly the
    // situation where the computed number is least likely to be right.
    const taken = new Set(fromRoster.map(r => r.historyName).filter(Boolean));
    const rosterIds = new Set(players.map(p => p.id));
    const fromHistory = HISTORY_PLAYERS
      .filter(n => !taken.has(n))
      .map(n => {
        const reg = registry.find(p => !rosterIds.has(p.id) && matchHistoryName(p) === n);
        const override = reg?.index_override ?? null;
        return {
          key: reg?.id || `h_${n}`,
          pid: reg?.id || null,
          name: reg?.name || n,
          historyName: n,
          inField: false,
          isMe: false,
          override,
          year: null,
          idx: indexFor(n, { override }),
        };
      });

    // "Inactive" is only sayable once there is a roster to be absent from.
    // Before it loads — or in an edition that has not set one up — every player
    // would fall into that section, which is the opposite of true, so they all
    // count as active until the field is known.
    const knowsField = fromRoster.length > 0;
    // Alphabetical within each section. The index column is not a leaderboard —
    // nobody wins the WBC by having the lowest handicap — so ordering by it
    // invited a reading that isn't there, and it moved a name every time a
    // round was posted. A list you look yourself up in should keep people where
    // you left them.
    return [...fromRoster, ...fromHistory]
      .map(r => ({ ...r, inField: r.inField || !knowsField }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [players, registry, meId]);

  const active = rows.filter(r => r.inField);
  const inactive = rows.filter(r => !r.inField);

  const detail = open ? rows.find(r => r.key === open) : null;
  if (detail) {
    return (
      <PlayerDetail
        row={detail}
        onBack={() => setOpen(null)}
        isDirector={isDirector}
        onSetOverride={detail.pid && onSetOverride ? (v) => onSetOverride(detail.pid, v) : null}
      />
    );
  }

  return (
    <div style={{ fontFamily: FONT, paddingBottom: BOTTOM_PAD }}>
      {/* What the number is, in one sentence. The formula and the asterisk rule
          used to be spelled out here too, and both are already on every detail
          page — one under "How it adds up", the other in the asterisk's own
          card, next to the rounds they describe. Up here they were a paragraph
          of definitions between the reader and the list they came for. */}
      {/* The definition, as a caption rather than a card. It was a bordered
          Card with its own eyebrow, which on a 667px-tall phone spent 84px —
          a sixth of everything below the header — restating one sentence. The
          words are the same; the chrome around them was the cost. */}
      <div style={{ fontSize: FS.label, color: K.t3, lineHeight: 1.4, marginBottom: 6, padding: "0 2px" }}>
        Average of the best <strong style={{ color: K.t2 }}>{COUNTING}</strong> differentials
        from the last <strong style={{ color: K.t2 }}>{WINDOW}</strong> rounds.
      </div>

      {/* Two numbers a row needs telling apart: the career index this tab is
          about, and what the golfer is actually playing off this year. */}
      <div style={{
        display: "grid", gridTemplateColumns: LIST_COLS, gap: 6, alignItems: "end",
        padding: "0 12px 4px", fontSize: FS.micro, fontWeight: 700, color: K.t3, letterSpacing: 0.5,
      }}>
        <span>PLAYER</span>
        <span style={{ textAlign: "right" }}>WBC</span>
        <span style={{ textAlign: "right" }}>{year || "YEAR"}</span>
        <span />
      </div>

      {/* No PLAYER / INDEX column heading. A name on the left and one accent
          number on the right under a card that just said what the number is
          does not need labelling, and the row it took was the last thing
          standing between a twelve-man field and one screen. */}
      {active.map(row => <PlayerRow key={row.key} row={row} onOpen={setOpen} />)}

      {/* ── Inactive ──
          Everyone in the record books who is not in this year's field. They
          keep their index and their whole career — the tab is a record, not a
          roster — but they are not who you are looking for when you open it
          during a tournament, so they sit under their own heading rather than
          interleaved with the men playing. */}
      {inactive.length > 0 && (
        <>
          <SectionLabel style={{ marginTop: 18, marginBottom: 6 }}>Inactive</SectionLabel>
          <div style={{ fontSize: FS.label, color: K.t3, lineHeight: 1.5, marginBottom: 8 }}>
            Not in this year&apos;s field.
          </div>
          {inactive.map(row => <PlayerRow key={row.key} row={row} onOpen={setOpen} />)}
        </>
      )}
    </div>
  );
}

// ── PlayerRow ──────────────────────────────────────────────────────
// One name in the list. Extracted when the list grew a second section: the
// active field and the inactive players are the same row, and the alternative
// was the same forty lines of markup written twice.
//
// The height is load-bearing. Twelve players is the WBC's field, and a roster
// you have to scroll to see all of is a roster you compare in two halves — so
// the row is sized so the whole field lands on one screen, down to the smallest
// phone anybody brings (a 375×667 SE, which has ~140px less to give than the
// 402×874 handset this was first fitted to).
//
// That budget is why the row is one line. It carried the player's recorded
// round count underneath, and at 11px of line box plus its own leading that
// second line cost more than the padding, the gap and the type size put
// together. The count is not lost — every round is listed on the detail page,
// which is where somebody counting them is going anyway.
//
// lineHeight is pinned rather than left to the app's inherited 1.6, which alone
// is worth 8px a row: at 15px that is the difference between an 18px line box
// and a 24px one, twelve times over.
function PlayerRow({ row, onOpen }) {
  const idx = row.idx;
  return (
    <button
      onClick={() => onOpen(row.key)}
      style={{
        width: "100%", display: "grid", gridTemplateColumns: LIST_COLS,
        gap: 6, alignItems: "center", textAlign: "left",
        padding: "7px 12px", marginBottom: 2,
        background: row.isMe ? `${K.gold}${ALPHA.wash}` : K.card,
        border: `1px solid ${row.isMe ? `${K.gold}${ALPHA.line}` : K.bdr}`,
        borderRadius: R.lg, cursor: "pointer", fontFamily: FONT,
      }}
    >
      <span className="wbc-name" style={{
        minWidth: 0, fontSize: FS.body, fontWeight: 700, lineHeight: 1.2,
        color: row.isMe ? K.gold : K.t1,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {row.name}
      </span>
      {/* The career index, in the quieter of the two weights. It is what this
          tab is ABOUT, but it is not the number anybody plays off — so it reads
          as the reference it is, and the accent is spent on the one that
          decides strokes on a tee box. It keeps the asterisk either way. */}
      <span style={{
        textAlign: "right", fontSize: FS.small, fontWeight: 700,
        color: idx?.index == null ? K.t3 : K.t2,
      }}>
        {fmtIndex(idx?.index)}
        {idx?.index != null && (idx.stale || idx.overridden) && <span style={{ color: K.warn }}>*</span>}
      </span>
      {/* What this player actually plays off this year, and the number that
          matters once the tournament starts: the leaderboard computes every
          course handicap from exactly this value. It is the edition's own
          figure, never derived — a screen showing anything else here would be
          disagreeing with the scoring. So it carries the emphasis. */}
      <span style={{
        textAlign: "right", fontSize: FS.lead, fontWeight: 900,
        color: row.year == null ? K.t3 : K.acc,
      }}>
        {row.year == null ? "—" : row.year.toFixed(1)}
      </span>
      <span style={{ textAlign: "right", fontSize: FS.small, color: K.t3 }}>›</span>
    </button>
  );
}

export default PlayersView;
