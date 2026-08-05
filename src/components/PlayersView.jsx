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
// The bar chart carries the second layer on its own: twelve columns oldest to
// newest, the five that made the average filled in accent and the other seven
// left as outlines. Nothing has to be read to see that the index is an average
// of the good half of a sample.
//
// The asterisk is the one piece of editorial here. A player who has been to
// every WBC has twelve rounds spanning three years; a player who comes every
// third year has twelve rounds spanning eleven. Both indexes are correct
// arithmetic and they do not mean the same thing, so the second says so — see
// SPAN_LIMIT in lib/handicap.js for where the line is drawn and why.
//
// The math lives in lib/handicap.js and the rounds in data/history.js (which is
// generated — see scripts/build-history.mjs). This file only draws them.

import { useMemo, useState } from "react";
import { K, FONT, FS, R, ALPHA, MOTION } from "../theme";
import { Card, SectionLabel } from "./ui";
import { indexFor, matchHistoryName, recentRoundSlots, WINDOW, COUNTING } from "../lib/handicap";
import { HISTORY_PLAYERS } from "../data/history";

// The tournament's own last 12 rounds — the yardstick the asterisk is measured
// against, and stable for the life of the bundle since the history is baked in.
const RECENT = recentRoundSlots();

// "2025-4" → "2025 R4". The keys are internal; a card is read by people.
const slotLabel = (key) => {
  if (!key) return "";
  const [year, round] = String(key).split("-");
  return `${year} R${round}`;
};

// The missed rounds, said in the fewest words that stay specific. Past four
// names the list stops being read, so it names the years instead.
const missedLabel = (missed = []) => {
  if (missed.length <= 4) return missed.map(slotLabel).join(", ");
  const years = [...new Set(missed.map(k => k.split("-")[0]))];
  return `${missed.length} rounds from ${years.length > 1 ? `${years[years.length - 1]}–${years[0]}` : years[0]}`;
};

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

      <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: FS.micro, color: K.t3 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: R.xs, background: K.acc, flexShrink: 0 }} />
          counts toward the index
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: R.xs, background: `${K.acc}${ALPHA.wash}`, border: `1px solid ${K.acc}${ALPHA.line}`, flexShrink: 0 }} />
          in the window, didn&apos;t count
        </span>
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
function PlayerDetail({ row, onBack }) {
  const idx = row.idx;
  const hasRounds = !!idx && idx.window.length > 0;

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
      <Card style={{ marginBottom: 12, textAlign: "center" }} pad={18}>
        <SectionLabel style={{ marginBottom: 4 }}>{row.name}</SectionLabel>
        <div style={{ fontSize: FS.display, fontWeight: 900, color: idx?.index == null ? K.t3 : K.acc, lineHeight: 1.1 }}>
          {fmtIndex(idx?.index)}
          {idx?.stale && <span style={{ color: K.warn }}>*</span>}
        </div>
        <div style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, letterSpacing: 1.5, marginTop: 4 }}>
          WBC INDEX
        </div>
        {hasRounds && (
          <div style={{ fontSize: FS.small, color: K.t2, marginTop: 10 }}>
            best {idx.counting.length} of {idx.window.length} · {idx.spanFrom === idx.spanTo ? idx.spanFrom : `${idx.spanFrom}–${idx.spanTo}`}
          </div>
        )}
      </Card>

      {!hasRounds && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.5 }}>
            No recorded rounds yet. An index appears after a first WBC is played.
          </div>
        </Card>
      )}

      {/* ── The asterisk ── */}
      {idx?.stale && (
        <Card style={{ marginBottom: 12, borderColor: `${K.warn}${ALPHA.line}`, background: `${K.warn}${ALPHA.wash}` }}>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: K.warn, fontWeight: 900, fontSize: FS.lead, lineHeight: 1 }}>*</span>
            <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.5 }}>
              The WBC's last {WINDOW} rounds are <strong style={{ color: K.t1 }}>{slotLabel(RECENT[RECENT.length - 1])}</strong>
              {" "}through <strong style={{ color: K.t1 }}>{slotLabel(RECENT[0])}</strong>. These are not those.
              {idx.missed.length >= WINDOW ? (
                <> Not one of them is on this card — the most recent round here is
                  {" "}<strong style={{ color: K.t1 }}>{slotLabel(idx.window[0].key)}</strong>.</>
              ) : idx.provisional ? (
                <> {missedLabel(idx.missed)} {idx.missed.length === 1 ? "is" : "are"} missing, and there
                  {" "}{idx.window.length === 1 ? "is" : "are"} only <strong style={{ color: K.t1 }}>{idx.window.length}</strong> rounds
                  {" "}on record to put in their place.</>
              ) : (
                <> {missedLabel(idx.missed)} {idx.missed.length === 1 ? "is" : "are"} missing, so the window reaches
                  {" "}back to <strong style={{ color: K.t1 }}>{slotLabel(idx.window[idx.window.length - 1].key)}</strong>.</>
              )}
              {" "}It is honest arithmetic on real rounds — it is just not built from the same {WINDOW} as the rest of the field&apos;s.
            </div>
          </div>
        </Card>
      )}

      {/* ── A short sample ── */}
      {/* Separate from the asterisk above, because it says a different thing:
          that one is about WHICH rounds, this is about how many of them count. */}
      {hasRounds && idx.provisional && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.5 }}>
            Only {idx.window.length} recorded {idx.window.length === 1 ? "round" : "rounds"}, so this is the best {idx.counting.length} of {idx.window.length}
            {" "}rather than the best {COUNTING} of {WINDOW}. It settles as more rounds are played.
          </div>
        </Card>
      )}

      {/* ── The last 12 ── */}
      {hasRounds && (
        <>
          <SectionLabel>The last {idx.window.length}</SectionLabel>
          <Card style={{ marginBottom: 12 }}>
            <WindowChart idx={idx} />
          </Card>
        </>
      )}

      {/* ── The working ── */}
      {hasRounds && (
        <>
          <SectionLabel>How it adds up</SectionLabel>
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
              <span style={{ flex: 1, fontSize: FS.label, fontWeight: 800, color: K.t3, letterSpacing: 0.8 }}>
                AVERAGE OF {idx.counting.length}
              </span>
              <span style={{ fontSize: FS.lead, fontWeight: 900, color: K.acc }}>{fmtIndex(idx.index)}</span>
            </div>
          </Card>
        </>
      )}

      {/* ── Every round ── */}
      {byYear.length > 0 && (
        <>
          <SectionLabel>Every round</SectionLabel>
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
                  <RoundRow
                    key={r.key}
                    r={r}
                    inWindow={windowKeys.has(r.key)}
                    counting={idx.countingKeys.has(r.key)}
                  />
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
export function PlayersView({ players = [], meId = null }) {
  const [open, setOpen] = useState(null);

  const rows = useMemo(() => {
    // The roster first, each matched to its history by name.
    const fromRoster = players.map(p => {
      const historyName = matchHistoryName(p);
      return {
        key: p.id,
        name: p.name,
        historyName,
        inField: true,
        isMe: !!meId && p.id === meId,
        idx: historyName ? indexFor(historyName) : null,
      };
    });
    // Then anybody in the record books who isn't in this year's field. The
    // history is a career registry — a man who last played in 2017 still has an
    // index, and hiding it would make the tab a roster rather than a record.
    const taken = new Set(fromRoster.map(r => r.historyName).filter(Boolean));
    const fromHistory = HISTORY_PLAYERS
      .filter(n => !taken.has(n))
      .map(n => ({ key: `h_${n}`, name: n, historyName: n, inField: false, isMe: false, idx: indexFor(n) }));

    // "past" is only sayable once there is a roster to be absent from. Before
    // it loads — or in an edition that has not set one up — every row would
    // otherwise be tagged as a former player, which is the opposite of true.
    const knowsField = fromRoster.length > 0;
    // Alphabetical, everybody in one run. The index column is not a
    // leaderboard — nobody wins the WBC by having the lowest handicap — so
    // ordering by it invited a reading that isn't there, and it moved a name
    // every time a round was posted. A list you look yourself up in should keep
    // people where you left them.
    return [...fromRoster, ...fromHistory]
      .map(r => ({ ...r, inField: r.inField || !knowsField }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [players, meId]);

  const detail = open ? rows.find(r => r.key === open) : null;
  if (detail) return <PlayerDetail row={detail} onBack={() => setOpen(null)} />;

  return (
    <div style={{ fontFamily: FONT, paddingBottom: BOTTOM_PAD }}>
      {/* What the number is, stated once, at the top of the only screen that
          shows it. Without this the list is fourteen unexplained decimals. */}
      <Card style={{ marginBottom: 14 }}>
        <SectionLabel style={{ marginBottom: 6 }}>The WBC Index</SectionLabel>
        <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.55 }}>
          The average of a player&apos;s best <strong style={{ color: K.t1 }}>{COUNTING}</strong> score
          differentials from their last <strong style={{ color: K.t1 }}>{WINDOW}</strong> rounds.
          A differential puts one round on a common scale —
          {" "}<span style={{ color: K.t1, fontWeight: 700 }}>(gross − course rating) × 113 ÷ slope</span> —
          so a card at a brutal course counts for what it was worth.
        </div>
        <div style={{ fontSize: FS.label, color: K.t3, lineHeight: 1.5, marginTop: 8 }}>
          Tap a player for their rounds. A <span style={{ color: K.warn, fontWeight: 800 }}>*</span> means
          those {WINDOW} are not the tournament&apos;s last {WINDOW} — a missed year, a withdrawal, or
          too few rounds to fill the window.
        </div>
      </Card>

      <div style={{
        display: "grid", gridTemplateColumns: "minmax(0, 1fr) 62px 14px",
        gap: 6, alignItems: "end", padding: "0 12px 6px",
        fontSize: FS.micro, fontWeight: 700, color: K.t3, letterSpacing: 0.5,
      }}>
        <span>PLAYER</span>
        <span style={{ textAlign: "right" }}>INDEX</span>
        <span />
      </div>

      {rows.map(row => {
        const idx = row.idx;
        return (
          <button
            key={row.key}
            onClick={() => setOpen(row.key)}
            style={{
              width: "100%", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 62px 14px",
              gap: 6, alignItems: "center", textAlign: "left",
              padding: "10px 12px", marginBottom: 6,
              background: row.isMe ? `${K.gold}${ALPHA.wash}` : K.card,
              border: `1px solid ${row.isMe ? `${K.gold}${ALPHA.line}` : K.bdr}`,
              borderRadius: R.lg, cursor: "pointer", fontFamily: FONT,
            }}
          >
            <span style={{ minWidth: 0 }}>
              <span style={{
                display: "block", fontSize: FS.body, fontWeight: 700,
                color: row.isMe ? K.gold : K.t1,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {row.name}
                {!row.inField && <span style={{ fontSize: FS.micro, fontWeight: 700, color: K.t3 }}> · past</span>}
              </span>
              <span style={{ display: "block", fontSize: FS.micro, color: K.t3, marginTop: 2 }}>
                {idx?.window.length
                  ? `${idx.rounds.length} recorded · window ${idx.spanFrom === idx.spanTo ? idx.spanFrom : `${idx.spanFrom}–${idx.spanTo}`}`
                  : "no recorded rounds"}
              </span>
            </span>
            <span style={{ textAlign: "right", fontSize: FS.lead, fontWeight: 900, color: idx?.index == null ? K.t3 : K.acc }}>
              {fmtIndex(idx?.index)}
              {idx?.stale && <span style={{ color: K.warn }}>*</span>}
            </span>
            <span style={{ textAlign: "right", fontSize: FS.body, color: K.t3 }}>›</span>
          </button>
        );
      })}
    </div>
  );
}

export default PlayersView;
