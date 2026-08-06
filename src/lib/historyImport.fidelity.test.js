// ══════════════════════════════════════════════════════════════════
//  The check that actually matters.
// ══════════════════════════════════════════════════════════════════
//
// historyImport.test.js pins the document SHAPES. This runs the real data
// through the real board: every year in data/*.csv is built into an edition,
// fed to computeIndividualBoard exactly as App.jsx feeds it, and the result is
// compared against what the tournament actually recorded.
//
// It is the test that would have caught the whole reason this import stores a
// course handicap rather than deriving one. Deleting the getPlayerCH line in
// individualBoard.js leaves historyImport.test.js green and turns this red on
// eight tournaments — including two whose champion changes.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { computeIndividualBoard, rankIndividualBoard } from "./individualBoard";
import { buildEdition, playerIdFor } from "./historyImport";

// The same minimal RFC-4180 reader scripts/build-history.mjs uses — hole_pars
// and hole_handicaps are quoted fields carrying commas.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((k, i) => [k, r[i]])));
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const csv = (f) => parseCsv(readFileSync(new URL(`../../data/${f}`, import.meta.url), "utf8"));

const tournaments = csv("tournaments.csv");
const allRounds = csv("rounds.csv");
const allCourses = csv("courses.csv");
const allHoles = csv("holes.csv");

const forYear = (rows, y) => rows.filter(r => num(r.year) === y);

const buildYear = (y) => {
  const t = tournaments.find(r => num(r.year) === y);
  return buildEdition({
    tournament: { year: y, num_rounds: num(t.num_rounds), champion: t.champion },
    rounds: forYear(allRounds, y).map(r => ({
      round: num(r.round), player: r.player, course_handicap: num(r.course_handicap),
    })),
    courses: forYear(allCourses, y).map(c => ({
      round: num(c.round), course: c.course, rating: num(c.rating), slope: num(c.slope), par: num(c.par),
      hole_pars: String(c.hole_pars || "").split(",").map(Number),
      hole_handicaps: String(c.hole_handicaps || "").split(",").map(Number),
    })),
    holes: forYear(allHoles, y).map(h => ({
      round: num(h.round), player: h.player, hole: num(h.hole), gross: num(h.gross),
    })),
  });
};

// Rebuild the app's in-memory state from the documents, the way App.jsx does
// (rowsToHoleData, rowsToTeeData) — so this exercises the documents as WRITTEN,
// not the intermediate objects that produced them.
const boardFor = (ed) => {
  const holeData = {};
  for (const h of ed.hole_scores) {
    const k = `${h.player_id}_${h.round_number}`;
    (holeData[k] ||= {})[h.hole_number - 1] = h.score;
  }
  const chByRound = {};
  for (const t of ed.tee_assignments) {
    (chByRound[t.round_number] ||= {})[t.player_id] = t.course_handicap;
  }
  const players = ed.tournament_players.map(tp => ({
    id: tp.player_id, handicap_index: tp.handicap_index,
  }));
  return rankIndividualBoard(computeIndividualBoard({
    players,
    numRounds: ed.tournament_state[0].meta.rounds,
    holeData,
    tRounds: ed.tournament_rounds,
    courses: ed.courses,
    getPlayerTee: (r, pid, course) => course.tee_boxes?.[0] || null,
    getPlayerCH: (r, pid) => chByRound[r]?.[pid] ?? null,
  }));
};

// Years with hole-by-hole scores. 2010 and 2011 recorded a champion and a
// roster and never a card, so there is nothing to reproduce.
const scoredYears = [...new Set(allHoles.map(h => num(h.year)))].filter(Boolean).sort();

describe("imported editions reproduce the tournament that was played", () => {
  it("covers every year that has hole-by-hole data", () => {
    expect(scoredYears).toEqual([2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
  });

  describe.each(scoredYears)("WBC %i", (year) => {
    const ed = buildYear(year);
    const board = boardFor(ed);
    const recorded = forYear(allRounds, year);

    it("crowns the recorded champion", () => {
      const champion = tournaments.find(t => num(t.year) === year).champion;
      expect(board[0].id).toBe(playerIdFor(champion));
    });

    it("matches every player's recorded net total", () => {
      // The board carries net-to-par; the record carries net strokes. Par for a
      // player's tournament is the sum of the pars of the rounds he played, so
      // a withdrawal is compared on what he actually completed.
      const parByRound = Object.fromEntries(
        forYear(allCourses, year).map(c => [num(c.round),
          String(c.hole_pars || "").split(",").reduce((a, b) => a + Number(b), 0)]));

      for (const row of board) {
        const mine = recorded.filter(r => playerIdFor(r.player) === row.id && num(r.net_total) !== null);
        if (!mine.length) continue;
        const expectedNet = mine.reduce((a, r) => a + num(r.net_total), 0);
        const expectedPar = mine.reduce((a, r) => a + (parByRound[num(r.round)] || 0), 0);
        expect(row.totalNetToPar, `${year} ${row.id} net`).toBe(expectedNet - expectedPar);
      }
    });

    it("matches every player's recorded gross total", () => {
      for (const row of board) {
        const mine = recorded.filter(r => playerIdFor(r.player) === row.id && num(r.gross_total) !== null);
        if (!mine.length) continue;
        expect(row.totalGross, `${year} ${row.id} gross`).toBe(
          mine.reduce((a, r) => a + num(r.gross_total), 0));
      }
    });

    it("gives every player a full 18 holes for each round he played", () => {
      const counts = {};
      for (const h of ed.hole_scores) counts[`${h.player_id}_${h.round_number}`] = (counts[`${h.player_id}_${h.round_number}`] || 0) + 1;
      for (const [k, n] of Object.entries(counts)) expect(n, `${year} ${k}`).toBe(18);
    });
  });
});

describe("the guard that keeps this honest", () => {
  // Deriving the handicap from the index instead of reading the recorded one is
  // exactly the regression getPlayerCH exists to prevent. Prove it would show.
  it("a flat-handicap year comes out wrong without the recorded handicap", () => {
    const ed = buildYear(2013);          // flat: 13, 13, 13, 13
    const withCH = boardFor(ed);
    const derived = rankIndividualBoard(computeIndividualBoard({
      players: ed.tournament_players.map(tp => ({ id: tp.player_id, handicap_index: tp.handicap_index })),
      numRounds: ed.tournament_state[0].meta.rounds,
      holeData: ed.hole_scores.reduce((acc, h) => {
        (acc[`${h.player_id}_${h.round_number}`] ||= {})[h.hole_number - 1] = h.score; return acc;
      }, {}),
      tRounds: ed.tournament_rounds,
      courses: ed.courses,
      getPlayerTee: (r, pid, course) => course.tee_boxes?.[0] || null,
      // getPlayerCH omitted — the pre-import behaviour.
    }));
    const same = withCH.every((row, i) => row.totalNetToPar === derived[i].totalNetToPar);
    expect(same, "2013 scored identically with and without the recorded handicap").toBe(false);
  });
});
