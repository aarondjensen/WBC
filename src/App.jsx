import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

const WBC_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJ4AAADLAgMAAADiqMKsAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAJUExURf///yLTp////ypiD0cAAAABdFJOUwBA5thmAAAAAWJLR0QAiAUdSAAAAAd0SU1FB+oCHA8GOoAOEAoAAAH7SURBVGje7dlBcsMgDAVQtNARdB823dMZdP+r1LFjMA5IogND09a7TF6Qv2TjTOJcPoi9Mx28HWZoWRMekIMVcrRCvfwOPenl4UgNank826O1KRdFufwlB0gSiorULo9liPaidE9LjfSv88Nq86E26Fp5rA6vkom4Wahc9Lwc6J7gNid4QnhdFwu6vfp4vKxNryi/nSKd8LV7GT4+tEOqXjoFjPtSrMCt4meGvg3JCnkPHVQInVAvjT3w6Esd0h36BsTrXXdcuNqe0gtjY9bXs32m0WBKU7/M8pHSiJvJBUanbaSca8ubI6UllQPTkgpMO32wQvXZxdYlzzRqHLTWBnNtnljb/9wGzUzzDtAtg9oIoRsGBWI31NpI3XBdGxd2R8vS3R11u+/exIeFxt7QahYztGZx1ixgzWKG/W3UYP8tqMHhu6350TEe4kQYZEjDIS+DsA7iG8B9gpGWwWCA/A3odegHQuiDbjSM62AwQJwDvR3iYOhGQloL4zTohsHwHhBM0M+C8vdMXgvdX4RxLaz+oD4fhn/4KyCNhL4Xqr8fz4Pqjpugt8Jggajd2Feo/aW4Q9Ae2Oltlk8SrDB3hcQ0l68SchrOUHwa4h16acHzXQFiAYUhUgGxDQ939gTapYsF8zQbMFfDZnv4NgwSuqP/q36clM05NLov1h1u0UFTWgoAAAAASUVORK5CYII=";
const WBC_TROPHY = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIoAAADgAgMAAAChhhbLAAAACVBMVEX///8i06f///8qYg9HAAAAAXRSTlMAQObYZgAAAAFiS0dEAIgFHUgAAAAHdElNRQfqAhwPCRGrKvWFAAACeElEQVRYw+3YW3LdIAwAUPHBDsp+9NN/dQb2v5WaxzUgJFCapNOkZvK8PmM9kO2bAAwrpNdCUFYnKhpJSpJwiS1aTVrWEs6vJu2TkU16zH9pwj8W6zGKyQdRNfVo/kqqScWknfHdxK0huD6casL1mQ3uTD5yGdgZehkwGr81aDNJNXibIJrYDJbTec1E6AZl46ibq0GiycdyMsUk2ZRHxhvMtW9Sn/1tojKptbJuZBRhMkp/jobeZtL7jSuDU3/cGffpBuuBsleaqWX5bmBvcG+wzuLOlMOelBuZ3aS7OJvxW6MMRzQbZzGxn+1kcGN8M/ROE2j4przPbMbvTJuKGlIzMJQnG2cxbUcgikNGQ+mvmLJpF3S+9WqmDXIb64OpU8ZNmeP72VyT/1MTXmW14kVDt0kGEyQz7OjdoLAaN7wtKd0UjO+hamGCCaNJ68bHOZ32i2AGUrdl2S4XR1NvaNz4yTjZ0GhgLQxba/v6YTBBMnE2eRRnc704p1OSXgyejWMGuMlPG0ZyYZ6Z5f3qlbSbjYuLobO5XmGG7QTUOZi3Kywkz/RYGJbt4cGQGRIMzcYJBub3Uu1mwg1OJkgG4mjW7tQTDQ2KYqir9F9sNoTF+iwvNqpysGOoOZhm4JzOGIwMBlXjz6F60nqonvTO+FPlRuOOKd8J0daEQ3fuhPanqQnhY76dgQ86zxczYKi9XDwfYf5iny3XsuWeYDCGe1R/yBmIhhJbeip90T6QlnhIx2Dq3++7UEIwwXzW/2mdZPAxb+nhYx7zpQ3OxHJdeMnQbIJk4jc1rHaxP6yHlr0wPS8sz6b1RARnhIKZ0/4J8jqdZBo0Jn4DUtjOuhjt96MAAAAASUVORK5CYII=";

const WBC_TROPHY_SILHOUETTE = "data:image/png;base64,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";
// Clean SVG trophy for large silhouette display
const TROPHY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260">
  <!-- Cup body -->
  <path d="M55,10 L145,10 L145,20 C145,20 170,22 170,45 C170,68 152,88 130,95 C124,115 118,125 110,130 L110,160 L130,160 L135,175 L65,175 L70,160 L90,160 L90,130 C82,125 76,115 70,95 C48,88 30,68 30,45 C30,22 55,20 55,20 Z" fill="white"/>
  <!-- Left handle detail -->
  <path d="M55,20 C55,20 42,22 38,30 C34,38 34,52 42,62 C48,70 58,76 70,80" fill="none" stroke="white" stroke-width="0" />
  <!-- Right handle detail -->
  <path d="M145,20 C145,20 158,22 162,30 C166,38 166,52 158,62 C152,70 142,76 130,80" fill="none" stroke="white" stroke-width="0" />
  <!-- Base stem -->
  <rect x="88" y="160" width="24" height="20" rx="2" fill="white"/>
  <!-- Base platform -->
  <rect x="58" y="175" width="84" height="14" rx="5" fill="white"/>
  <!-- Base foot -->
  <rect x="50" y="189" width="100" height="10" rx="5" fill="white"/>
</svg>`;

const TROPHY_SVG_URL = `data:image/svg+xml;utf8,${encodeURIComponent(TROPHY_SVG)}`;

// Demo data simulating what's in Supabase
// Player registry — loaded from Supabase players table on mount
let DEMO_PLAYERS = [
  { id: "aaron_j", name: "Aaron J" }, { id: "bob_b", name: "Bob B" },
  { id: "brian_k", name: "Brian K" }, { id: "eric_o", name: "Eric O" },
  { id: "joe_s", name: "Joe S" }, { id: "john_c", name: "John C" },
  { id: "matt_v", name: "Matt V" }, { id: "scott_r", name: "Scott R" },
  { id: "jeff_b", name: "Jeff B" }, { id: "ray_h", name: "Ray H" },
  { id: "russ_w", name: "Russ W" }, { id: "steve_v", name: "Steve V" },
];

const DEMO_TP = [
  { id: "tp1", tournament_id: "wbc_2026", player_id: "aaron_j", handicap_index: 15.2, status: "active" },
  { id: "tp2", tournament_id: "wbc_2026", player_id: "bob_b", handicap_index: 12.8, status: "active" },
  { id: "tp3", tournament_id: "wbc_2026", player_id: "brian_k", handicap_index: 18.4, status: "active" },
  { id: "tp4", tournament_id: "wbc_2026", player_id: "eric_o", handicap_index: 9.1, status: "active" },
  { id: "tp5", tournament_id: "wbc_2026", player_id: "joe_s", handicap_index: 22.5, status: "active" },
  { id: "tp6", tournament_id: "wbc_2026", player_id: "john_c", handicap_index: 14.0, status: "active" },
  { id: "tp7", tournament_id: "wbc_2026", player_id: "matt_v", handicap_index: 16.7, status: "active" },
  { id: "tp8", tournament_id: "wbc_2026", player_id: "scott_r", handicap_index: 11.3, status: "active" },
  { id: "tp9", tournament_id: "wbc_2026", player_id: "jeff_b", handicap_index: 20.1, status: "active" },
  { id: "tp10", tournament_id: "wbc_2026", player_id: "ray_h", handicap_index: 17.6, status: "active" },
  { id: "tp11", tournament_id: "wbc_2026", player_id: "russ_w", handicap_index: 13.5, status: "active" },
  { id: "tp12", tournament_id: "wbc_2026", player_id: "steve_v", handicap_index: 19.8, status: "active" },
];

// ── Real Gaylord, MI course data (scorecard data from official Treetops PDFs) ──

// Treetops – Jones Masterpiece (RTJ Sr., 1987) — par 71
// Scorecard source: official Treetops PDF, Blue tees
const DEMO_COURSE = {
  id: "demo_course_1",
  name: "Treetops – Masterpiece",
  rating: 71.7, slope: 137, par: 71,
  city: "Gaylord", state: "MI",
  hole_pars:      [5,3,4,3,5,3,4,4,4, 5,4,4,3,4,4,3,4,5],
  hole_handicaps: [13,17,1,11,3,15,5,7,9, 4,6,2,12,14,16,18,8,10],
  tee_boxes: [
    { name: "Black",  color: "#2c2c2c", slope: 147, rating: 74.8, par: 71, yardage: 7068 },
    { name: "Blue",   color: "#2d8fd4", slope: 137, rating: 71.7, par: 71, yardage: 6435 },
    { name: "White",  color: "#e8e8e8", slope: 132, rating: 69.4, par: 71, yardage: 5921 },
    { name: "Gold",   color: "#d4a843", slope: 127, rating: 67.1, par: 71, yardage: 5421 },
    { name: "Red",    color: "#c0392b", slope: 120, rating: 63.8, par: 71, yardage: 4862 },
  ],
};

// Treetops – Smith Signature (Rick Smith, 1993) — par 70
// Scorecard source: official Treetops PDF, Blue tees
const DEMO_COURSE2 = {
  id: "demo_course_2",
  name: "Treetops – Signature",
  rating: 71.0, slope: 139, par: 70,
  city: "Gaylord", state: "MI",
  hole_pars:      [4,3,4,3,4,5,4,3,4, 5,3,4,4,4,5,4,3,4],
  hole_handicaps: [7,17,3,15,1,5,9,13,11, 4,14,10,2,8,6,18,16,12],
  tee_boxes: [
    { name: "Black",  color: "#2c2c2c", slope: 140, rating: 72.9, par: 70, yardage: 6653 },
    { name: "Blue",   color: "#2d8fd4", slope: 139, rating: 71.0, par: 70, yardage: 6271 },
    { name: "White",  color: "#e8e8e8", slope: 135, rating: 69.2, par: 70, yardage: 5843 },
    { name: "Gold",   color: "#d4a843", slope: 131, rating: 66.8, par: 70, yardage: 5387 },
    { name: "Red",    color: "#c0392b", slope: 131, rating: 67.9, par: 70, yardage: 4626 },
  ],
};

// Treetops – Smith Tradition (Rick Smith, 1997) — par 70
// Scorecard source: official Treetops PDF, Black tees
const DEMO_COURSE3 = {
  id: "demo_course_3",
  name: "Treetops – Tradition",
  rating: 70.0, slope: 130, par: 70,
  city: "Gaylord", state: "MI",
  hole_pars:      [4,4,5,4,4,3,4,4,3, 5,4,3,4,4,3,4,3,5],
  hole_handicaps: [9,3,7,5,1,13,11,17,15, 8,2,14,18,6,10,4,16,12],
  tee_boxes: [
    { name: "Black",  color: "#2c2c2c", slope: 130, rating: 70.0, par: 70, yardage: 6354 },
    { name: "Blue",   color: "#2d8fd4", slope: 126, rating: 69.4, par: 70, yardage: 6173 },
    { name: "White",  color: "#e8e8e8", slope: 118, rating: 67.8, par: 70, yardage: 5508 },
    { name: "Gold",   color: "#d4a843", slope: 115, rating: 66.4, par: 70, yardage: 5248 },
    { name: "Red",    color: "#c0392b", slope: 111, rating: 63.1, par: 70, yardage: 4791 },
  ],
};

// Treetops – Fazio Premier (Tom Fazio, 1992) — par 72
// Tee data from BlueGolf/USGA database; hole layout from Treetops materials
// Par sequence: typical Fazio Premier layout per known front/back par totals (36/36)
const DEMO_COURSE4 = {
  id: "demo_course_4",
  name: "Treetops – Premier",
  rating: 71.0, slope: 132, par: 72,
  city: "Gaylord", state: "MI",
  hole_pars:      [4,4,5,4,3,5,4,3,4, 5,3,4,4,5,4,3,4,4],
  hole_handicaps: [3,11,7,15,17,1,9,13,5, 2,16,8,4,12,6,18,14,10],
  tee_boxes: [
    { name: "Black",  color: "#2c2c2c", slope: 142, rating: 73.3, par: 72, yardage: 6701 },
    { name: "Blue",   color: "#2d8fd4", slope: 132, rating: 71.0, par: 72, yardage: 6282 },
    { name: "White",  color: "#e8e8e8", slope: 126, rating: 68.8, par: 72, yardage: 5854 },
    { name: "Gold",   color: "#d4a843", slope: 117, rating: 65.6, par: 72, yardage: 5290 },
    { name: "Red",    color: "#c0392b", slope: 113, rating: 64.5, par: 72, yardage: 4870 },
  ],
};

const DEMO_COURSE5 = {
  id: "american_dunes",
  name: "American Dunes",
  city: "Grand Haven", state: "MI",
  par: 72, rating: 73.0, slope: 142, yardage: 6701,
  hole_pars:      [4,5,4,3,4,5,3,4,4, 4,4,3,5,4,3,4,4,5],
  hole_handicaps: [5,17,3,11,15,1,7,13,9, 12,10,8,18,16,2,14,6,4],
  tee_boxes: [
    { name: "Jet",     color: "#2c2c2c", slope: 148, rating: 75.4, par: 72, yardage: 7213 },
    { name: "Valor",   color: "#2d8fd4", slope: 142, rating: 73.0, par: 72, yardage: 6701 },
    { name: "Freedom", color: "#e8e8e8", slope: 133, rating: 70.3, par: 72, yardage: 6131 },
    { name: "Honor",   color: "#d4a843", slope: 126, rating: 67.8, par: 72, yardage: 5573 },
    { name: "Bear",    color: "#c0392b", slope: 116, rating: 63.9, par: 72, yardage: 4772 },
  ],
};

const ALL_DEMO_COURSES = [DEMO_COURSE, DEMO_COURSE2, DEMO_COURSE3, DEMO_COURSE4, DEMO_COURSE5];

const TOURNAMENT = { id: "wbc_2026", name: "WBC 2026", year: 2026, num_rounds: 4, status: "active" };

// ── Pre-populated Round 1 scores (Treetops Masterpiece, par 71, White tees) ──
const DEMO_PAIRINGS = {
  1: [
    ["aaron_j", "bob_b", "brian_k", "eric_o"],
    ["jeff_b", "joe_s", "john_c", "matt_v"],
    ["ray_h", "russ_w", "scott_r", "steve_v"],
  ],
};
const DEMO_TEE_TIMES = { 1: ["8:00 AM", "8:08 AM", "8:16 AM"] };
const DEMO_TEE_ASSIGNMENTS = {
  1: {
    aaron_j: "White", bob_b: "White", brian_k: "Gold", eric_o: "Blue",
    jeff_b: "Gold", joe_s: "Gold", john_c: "White", matt_v: "White",
    ray_h: "White", russ_w: "White", scott_r: "Blue", steve_v: "Gold",
  },
};
// Realistic 18-hole scores per player on Treetops Masterpiece (par 71, White tees)
// Scores reflect a mid-handicap group — bogey golf with a few pars and doubles mixed in
const DEMO_HOLE_DATA = {
  "aaron_j_1":  {0:5,1:6,2:3,3:5,4:4,5:3,6:6,7:5,8:4, 9:5,10:3,11:5,12:6,13:4,14:3,15:5,16:5,17:6},   // 86
  "bob_b_1":    {0:4,1:5,2:3,3:4,4:5,5:3,6:5,7:4,8:5, 9:4,10:3,11:4,12:6,13:4,14:4,15:4,16:5,17:5},   // 79
  "brian_k_1":  {0:5,1:6,2:4,3:5,4:5,5:4,6:6,7:5,8:5, 9:5,10:4,11:5,12:6,13:5,14:4,15:5,16:5,17:6},   // 93
  "eric_o_1":   {0:4,1:5,2:3,3:4,4:4,5:3,6:5,7:4,8:4, 9:4,10:3,11:4,12:5,13:4,14:3,15:4,16:4,17:5},   // 76
  "jeff_b_1":   {0:5,1:6,2:4,3:5,4:5,5:4,6:6,7:5,8:5, 9:4,10:4,11:5,12:6,13:5,14:3,15:5,16:5,17:6},   // 91
  "joe_s_1":    {0:6,1:6,2:4,3:5,4:5,5:4,6:7,7:5,8:5, 9:5,10:4,11:5,12:7,13:5,14:4,15:5,16:5,17:6},   // 96
  "john_c_1":   {0:4,1:5,2:3,3:5,4:4,5:3,6:6,7:4,8:5, 9:4,10:3,11:5,12:5,13:4,14:3,15:4,16:5,17:5},   // 82
  "matt_v_1":   {0:5,1:6,2:3,3:5,4:5,5:3,6:6,7:5,8:4, 9:5,10:4,11:4,12:6,13:5,14:4,15:5,16:5,17:6},   // 89
  "ray_h_1":    {0:5,1:6,2:4,3:5,4:4,5:4,6:6,7:5,8:5, 9:5,10:3,11:5,12:6,13:5,14:3,15:5,16:4,17:6},   // 90
  "russ_w_1":   {0:4,1:5,2:3,3:4,4:5,5:3,6:5,7:5,8:4, 9:4,10:3,11:4,12:6,13:4,14:4,15:4,16:5,17:5},   // 81
  "scott_r_1":  {0:4,1:5,2:3,3:4,4:4,5:3,6:5,7:4,8:4, 9:4,10:3,11:4,12:5,13:5,14:3,15:4,16:4,17:5},   // 78
  "steve_v_1":  {0:5,1:7,2:4,3:5,4:5,5:4,6:6,7:5,8:5, 9:5,10:4,11:5,12:7,13:5,14:4,15:5,16:5,17:6},   // 95
};

// ── Supabase client ──
const SUPABASE_URL = "https://eslskkeienudxxmwafag.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzbHNra2VpZW51ZHh4bXdhZmFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMzgwMDQsImV4cCI6MjA4NzgxNDAwNH0.ZELe_lRNmJdJaAsUAwhPXpX8OgtdtAUwbetiiZH7qZw";
const TOURNAMENT_ID = "wbc_2026";

const sb = {
  url: SUPABASE_URL,
  key: SUPABASE_ANON,
  fetch: async (path, opts = {}) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...opts,
      headers: {
        "apikey": SUPABASE_ANON,
        "Authorization": `Bearer ${SUPABASE_ANON}`,
        "Content-Type": "application/json",
        "Prefer": opts.prefer || "return=representation",
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) { const err = await res.text(); console.error("SB error:", err); return null; }
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  },
  get: (table, query = "") => sb.fetch(`${table}?${query}`),
  upsert: (table, data, onConflict) => sb.fetch(`${table}`, {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    headers: onConflict ? { "Prefer": `resolution=merge-duplicates,return=representation` } : {},
    body: JSON.stringify(data),
  }),
  delete: (table, query) => sb.fetch(`${table}?${query}`, { method: "DELETE", prefer: "return=representation" }),
  // Real-time subscription via websocket
  subscribe: (table, filter, callback) => {
    const wsUrl = SUPABASE_URL.replace("https://", "wss://") + "/realtime/v1/websocket?apikey=" + SUPABASE_ANON + "&vsn=1.0.0";
    let ws, heartbeat;
    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({ topic: "realtime:*", event: "phx_join", payload: { config: { broadcast: { self: false }, presence: { key: "" }, postgres_changes: [{ event: "*", schema: "public", table }] } }, ref: "1" }));
        heartbeat = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: "hb" })), 25000);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.event === "postgres_changes" && msg.payload?.data) callback(msg.payload.data);
        } catch(err) {}
      };
      ws.onclose = () => { clearInterval(heartbeat); setTimeout(connect, 3000); };
    };
    connect();
    return () => { clearInterval(heartbeat); ws?.close(); };
  },
};

// Helper: convert Supabase hole_scores rows → holeData format { "pid_round": { holeIdx: score } }
const extractRound = (roundScoreId) => {
  const m = roundScoreId?.match(/_r(\d+)_/);
  return m ? parseInt(m[1]) : 1;
};
const rowsToHoleData = (rows) => {
  const hd = {};
  rows.forEach(r => {
    const key = `${r.player_id}_${r.round_number || extractRound(r.round_score_id)}`;
    if (!hd[key]) hd[key] = {};
    hd[key][r.hole_number - 1] = r.score;
  });
  return hd;
};
// Convert holeData entry to Supabase row
const holeDataToRow = (pid, rnd, holeIdx, score, courseId) => ({
  id: `hs_2026_r${rnd}_${pid}_h${holeIdx + 1}`,
  round_score_id: `rs_2026_r${rnd}_${pid}`,
  tournament_id: TOURNAMENT_ID,
  player_id: pid,
  course_id: courseId || "unknown",
  round_number: rnd,
  hole_number: holeIdx + 1,
  score: score,
});

// Convert pairings rows → pairingsData format { round: [[pid,...], ...] }
const rowsToPairings = (rows) => {
  const pd = {};
  rows.forEach(r => {
    if (!pd[r.round_number]) pd[r.round_number] = [];
    const gi = r.group_number - 1;
    while (pd[r.round_number].length <= gi) pd[r.round_number].push([]);
    pd[r.round_number][gi].push(r.player_id);
  });
  return pd;
};

// Convert tee assignment rows → teeData format { round: { pid: teeName } }
const rowsToTeeData = (rows) => {
  const td = {};
  rows.forEach(r => {
    if (!td[r.round_number]) td[r.round_number] = {};
    td[r.round_number][r.player_id] = r.tee_name;
  });
  return td;
};

// Convert tee times rows → teeTimesData { round: [time, time, ...] }
const rowsToTeeTimes = (rows) => {
  const tt = {};
  rows.forEach(r => {
    if (!tt[r.round_number]) tt[r.round_number] = [];
    const gi = r.group_number - 1;
    while (tt[r.round_number].length <= gi) tt[r.round_number].push("");
    tt[r.round_number][gi] = r.tee_time || "";
  });
  return tt;
};

const calcCH = (hi, slope, rating, par) => (!hi && hi !== 0) ? 0 : Math.round((hi * (slope / 113)) + (rating - par));
const fmtPar = n => n == null ? "—" : n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`;

// Resolve tee color from name — handles standard colors, non-standard colors, and word names
const TEE_COLOR_MAP = {
  black: "#2c2c2c", blue: "#2d8fd4", white: "#e8e8e8", gold: "#d4a843", red: "#9b2335",
  green: "#2d8a4e", silver: "#a8b2bd", yellow: "#e6c619", orange: "#e67e22", purple: "#7b2d8b",
  maroon: "#6b1c2a", navy: "#1b2a4a", teal: "#1a8a7a", tan: "#c4a86b", copper: "#b87333",
  bronze: "#cd7f32", champagne: "#f7e7ce", crimson: "#b22234", burgundy: "#800020",
  platinum: "#c0c0c0", pewter: "#8e8e8e", sand: "#c2b280", coral: "#ff7f50",
  tournament: "#1a1a2e", championship: "#1a1a2e", tips: "#1a1a2e", pro: "#2d8fd4", member: "#e8e8e8",
  ladies: "#c0392b", senior: "#d4a843", forward: "#d4a843", back: "#1a1a2e", middle: "#e8e8e8",
};
// Palette for unknown tee names (cycled by index)
const TEE_FALLBACK_COLORS = ["#5b8fb9", "#8b5e3c", "#6b7b3a", "#8e44ad", "#2e86ab", "#a84632"];
const resolveTeeColor = (tee, index) => {
  // Always check name first so known color names are normalized consistently
  const key = (tee.name || "").toLowerCase().trim();
  if (TEE_COLOR_MAP[key]) return TEE_COLOR_MAP[key];
  for (const [word, clr] of Object.entries(TEE_COLOR_MAP)) {
    if (key.includes(word)) return clr;
  }
  // Fall back to stored color only for unknown tee names
  if (tee.color && tee.color !== "#000" && tee.color !== "#000000") return tee.color;
  return TEE_FALLBACK_COLORS[index % TEE_FALLBACK_COLORS.length];
};
// Combo tee detection — splits "BLACK/BLUE" into ["#2c2c2c", "#2d8fd4"]
const getComboColors = (name) => {
  if (!name) return null;
  const separators = ["/", "-", "+", "&", " and "];
  for (const sep of separators) {
    const parts = name.split(new RegExp(`\\s*${sep.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\s*`, "i")).map(p => p.trim().toLowerCase());
    if (parts.length === 2 && parts[0] !== parts[1]) {
      const c1 = TEE_COLOR_MAP[parts[0]] || (parts[0].includes("black") ? "#2c2c2c" : null);
      const c2 = TEE_COLOR_MAP[parts[1]] || (parts[1].includes("white") ? "#e8e8e8" : null);
      if (c1 && c2) return [c1, c2];
    }
  }
  return null;
};

const isLightTee = (clr) => {
  if (!clr) return false;
  const light = ["#e8e8e8","#a8b2bd","#c0c0c0","#f7e7ce","#c2b280","#c4a86b","#8e8e8e"];
  return light.includes(clr.toLowerCase());
};
const isDarkTee = (clr) => {
  if (!clr) return false;
  const dark = ["#1a1a2e","#000000","#111111","#0a0a0a","#1a1a1a","#222222","#2c2c2c","#2d2d2d","#0d0d0d","black"];
  return dark.includes(clr.toLowerCase());
};
const isBlackTee = (clr) => isDarkTee(clr);

// Portal component — renders modal directly into document.body to escape all stacking contexts
const CoursePreviewPortal = ({ children }) => {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
};
// TeeColorSwatch — handles solid, combo (diagonal split), and black (gray+dot) tees
const TeeColorSwatch = ({ color, name, size = 12, style = {} }) => {
  const combo = getComboColors(name || "");
  if (combo) {
    const [c1, c2] = combo;
    const s = size;
    return (
      <span style={{ display: "inline-block", width: s, height: s, borderRadius: 3, overflow: "hidden", flexShrink: 0, border: "1px solid #ffffff20", ...style }}>
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <polygon points={`0,0 ${s},0 0,${s}`} fill={c1} />
          <polygon points={`${s},0 ${s},${s} 0,${s}`} fill={c2} />
        </svg>
      </span>
    );
  }
  if (isBlackTee(color)) {
    return <span style={{ display: "inline-block", width: size, height: size, borderRadius: 3, background: "#1a1a1a", border: "1px solid #666666", flexShrink: 0, ...style }} />;
  }
  const border = isLightTee(color) ? "1px solid #99999960" : "1px solid #ffffff15";
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: 3, background: color || "#888", border, flexShrink: 0, ...style }} />;
};

// Black tee marker: light gray background (#a8b2bd) with black dot inside
const blackTeeMarker = (size = 10) => ({
  outer: { width: size, height: size, borderRadius: "50%", background: "#a8b2bd", border: "1px solid #88888880", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  inner: { width: Math.round(size * 0.45), height: Math.round(size * 0.45), borderRadius: "50%", background: "#111", display: "block" },
});

// Pick default tee: closest to slope 128 and 6400 yards (weighted combo)
const getDefaultTee = (tees) => {
  if (!tees || tees.length === 0) return null;
  let best = tees[0], bestScore = Infinity;
  tees.forEach(t => {
    const slopeDiff = Math.abs((t.slope || 113) - 127);
    const yardDiff = Math.abs((t.yardage || 6300) - 6300) / 50;
    const score = slopeDiff + yardDiff;
    if (score < bestScore) { bestScore = score; best = t; }
  });
  return best;
};

const K = {
  bg: "#080f1a", card: "#0e1829", inp: "#0a1425", hover: "#142036",
  acc: "#22d3a7", accDim: "#0d9b73", accGlow: "rgba(34,211,167,0.12)",
  tourn: "#38bdf8", tournGlow: "rgba(56,189,248,0.12)",
  warn: "#f59e0b", danger: "#ef4444",
  t1: "#e8edf5", t2: "#8b9ec2", t3: "#526484",
  bdr: "#1a2b47",
  eagle: "#3b82f6", birdie: "#22c55e", par: "#8b9ec2", bogey: "#eab308", dbl: "#ef4444",
};

const TEE_PALETTE = ["#60a5fa","#f59e0b","#a78bfa","#34d399","#fb923c","#f472b6","#38bdf8","#e879f9"];

// ── LEADERBOARD ──
function LeaderboardView({ lb, round, holeData, tRounds, courses, tPlayers, teeData, getPlayerTee, finalizedRounds, skinWins }) {
  const [expanded, setExpanded] = useState(null);
  const [scorecardRound, setScorecardRound] = useState(null);
  const [showGross, setShowGross] = useState(false);
  const [showToPar, setShowToPar] = useState(true);
  // Reset to Net + To-Par whenever leaderboard mounts
  useEffect(() => { setShowGross(false); setShowToPar(true); }, []);
  const containerRef = useRef(null);
  const headerRef = useRef(null);
  const totalCellRef = useRef(null);
  const [trophyLeft, setTrophyLeft] = useState("50%");
  const [rowStyle, setRowStyle] = useState({ padding: "6px 12px", fontSize: 12 });

  // Compute player column width to center Total, and align trophy to match
  const [playerColW, setPlayerColW] = useState("auto");
  useEffect(() => {
    const align = () => {
      if (!containerRef.current) return;
      // Card has padding 12px each side, grid padding 12px each side
      const containerW = containerRef.current.offsetWidth;
      const gridW = containerW - 24; // 12px padding each side
      // Fixed cols right of player: 34(Total) + 34(Thru) + 14(gap) + 4*22(88) = 170
      // Fixed cols left of player: 24(#)
      // Total center = 24 + playerW + 17 = gridW/2  =>  playerW = gridW/2 - 41
      const playerW = Math.max(60, gridW / 2 - 41);
      setPlayerColW(`${Math.floor(playerW)}px`);
      // Trophy tracks Total center
      if (totalCellRef.current) {
        const cellRect = totalCellRef.current.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const cellCenter = cellRect.left + cellRect.width / 2 - containerRect.left;
        const pct = (cellCenter / containerRect.width) * 100;
        setTrophyLeft(`${pct}%`);
      }
    };
    align();
    const t = setTimeout(align, 150);
    window.addEventListener("resize", align);
    return () => { clearTimeout(t); window.removeEventListener("resize", align); };
  }, [lb.length]);

  // Track previous positions for movement arrows
  const prevPositions = useRef({});
  const [movements, setMovements] = useState({});
  useEffect(() => {
    const newMov = {};
    lb.forEach((p, idx) => {
      const prev = prevPositions.current[p.id];
      if (prev != null && prev !== idx) newMov[p.id] = prev > idx ? "up" : "down";
    });
    setMovements(newMov);
    const newPos = {};
    lb.forEach((p, idx) => { newPos[p.id] = idx; });
    prevPositions.current = newPos;
  }, [lb.map(p => p.id).join(",")]);

  // Row styles handled via CSS flex — rowStyle kept for font size only
  useEffect(() => {
    const calc = () => {
      if (!containerRef.current || !headerRef.current || lb.length === 0) return;
      // Use the container's own bounding rect — it already lives inside the padded content area
      const containerRect = containerRef.current.getBoundingClientRect();
      const headerH = headerRef.current.offsetHeight;
      // Available = space from bottom of grid header to bottom of container
      const available = containerRect.height - headerH;
      const perRow = Math.floor(available / lb.length);
      const clampedPerRow = Math.min(perRow, 36);
      const fSize = clampedPerRow >= 32 ? 13 : clampedPerRow >= 26 ? 12 : clampedPerRow >= 18 ? 11 : 10;
      setRowStyle({ fontSize: fSize, lineHeight: 1 });
    };
    calc();
    const t = setTimeout(calc, 100);
    window.addEventListener("resize", calc);
    return () => { clearTimeout(t); window.removeEventListener("resize", calc); };
  }, [lb.length]);

  const scColor = (d) => d <= -2 ? K.eagle : d === -1 ? K.birdie : d === 0 ? K.par : d === 1 ? K.bogey : K.dbl;
  const scBg = (d) => d <= -2 ? K.eagle+"20" : d === -1 ? K.birdie+"15" : d === 0 ? "transparent" : d === 1 ? K.bogey+"12" : K.dbl+"12";

  const renderScorecard = (p) => {
    const tp = tPlayers.find(t => t.player_id === p.id);
    const hi = parseFloat(tp?.handicap_index) || 0;
    // Find rounds with scores
    const availRounds = [];
    for (let r = 1; r <= 4; r++) {
      const tr = tRounds.find(t => t.round_number === r);
      if (!tr) continue;
      const course = courses.find(c => c.id === tr.course_id);
      if (!course) continue;
      const key = `${p.id}_${r}`;
      const scores = holeData[key] || {};
      if (Object.keys(scores).length === 0) continue;
      availRounds.push(r);
    }
    if (availRounds.length === 0) return <div style={{ padding: 12, fontSize: 12, color: K.t3 }}>No scores yet</div>;

    const viewRound = scorecardRound && availRounds.includes(scorecardRound) ? scorecardRound : availRounds[availRounds.length - 1];
    const tr = tRounds.find(t => t.round_number === viewRound);
    const course = courses.find(c => c.id === tr.course_id);
    const key = `${p.id}_${viewRound}`;
    const scores = holeData[key] || {};
    const holePars = course.hole_pars || [];
    const holeHcps = course.hole_handicaps || [];
    const tee = getPlayerTee(viewRound, p.id, course);
    const ch = calcCH(hi, tee?.slope || course.slope, tee?.rating || course.rating, tee?.par || course.par);
    const sorted = holeHcps.map((h, i) => ({ idx: i, hcp: h })).sort((a, b) => a.hcp - b.hcp);
    const strokeMap = {};
    let rem = Math.abs(ch);
    for (let pass = 0; pass < 3 && rem > 0; pass++) {
      for (const h of sorted) { if (rem <= 0) break; strokeMap[h.idx] = (strokeMap[h.idx] || 0) + 1; rem--; }
    }
    const frontPar = holePars.slice(0,9).reduce((a,b)=>a+b,0);
    const backPar = holePars.slice(9).reduce((a,b)=>a+b,0);
    let frontGross = 0, backGross = 0, frontNet = 0, backNet = 0;
    for (let h = 0; h < 18; h++) {
      if (scores[h]) {
        const g = scores[h];
        const st = strokeMap[h] || 0;
        if (h < 9) { frontGross += g; frontNet += (g - st); } else { backGross += g; backNet += (g - st); }
      }
    }
    const rc = { r: viewRound, course, holePars, scores, strokeMap, ch, frontPar, backPar, frontGross, backGross, frontNet, backNet, tee };

    const totalGross = rc.frontGross + rc.backGross;
    const totalNet = rc.frontNet + rc.backNet;
    const totalPar = rc.frontPar + rc.backPar;
    const netToPar = totalNet - totalPar;

    return (
      <div style={{ padding: "8px 10px 8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {availRounds.length > 1 ? (
              <select value={viewRound} onChange={e => setScorecardRound(parseInt(e.target.value))} onClick={e => e.stopPropagation()} style={{
                background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: 4, color: K.acc, fontSize: 10, fontWeight: 700, padding: "2px 4px", cursor: "pointer",
              }}>
                {availRounds.map(r => {
                  const c = courses.find(cs => cs.id === tRounds.find(t => t.round_number === r)?.course_id);
                  return <option key={r} value={r}>Rd {r}: {c?.name || "—"}</option>;
                })}
              </select>
            ) : (
              <span style={{ fontSize: 10, fontWeight: 700, color: K.acc }}>Rd {rc.r}: {rc.course.name}</span>
            )}
            <span style={{ fontSize: 9, color: K.t3 }}>CH {rc.ch}</span>
          </div>
          <div style={{ display: "flex", gap: 8, fontSize: 10 }}>
            <span style={{ color: K.t3 }}>Gross <strong style={{ color: K.t2 }}>{totalGross || "—"}</strong></span>
            <span style={{ color: K.t3 }}>Net <strong style={{ color: netToPar < 0 ? "#ef4444" : K.t1 }}>{totalNet || "—"}</strong></span>
          </div>
        </div>
            {[["Front", 0, 9, rc.frontPar, rc.frontGross, rc.frontNet], ["Back", 9, 9, rc.backPar, rc.backGross, rc.backNet]].map(([label, start, count, parT, grossT, netT]) => (
              <div key={label} style={{ marginBottom: 4 }}>
                <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 32px`, gap: 1, fontSize: 9 }}>
                  <div style={{ color: K.t3, fontWeight: 600, padding: "2px 0" }}></div>
                  {Array.from({length: count}, (_, i) => start + i).map(h => (
                    <div key={h} style={{ textAlign: "center", color: K.t3, fontWeight: 600, padding: "2px 0" }}>{h+1}</div>
                  ))}
                  <div style={{ textAlign: "center", color: K.t3, fontWeight: 700 }}></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 32px`, gap: 1, fontSize: 9 }}>
                  <div style={{ color: K.t3, padding: "2px 0", fontSize: 8 }}>Par</div>
                  {Array.from({length: count}, (_, i) => start + i).map(h => (
                    <div key={h} style={{ textAlign: "center", color: K.t3, padding: "2px 0" }}>{rc.holePars[h]}</div>
                  ))}
                  <div style={{ textAlign: "center", color: K.t3, fontWeight: 700 }}>{parT}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 32px`, gap: 1 }}>
                  <div style={{ color: K.t2, padding: "3px 0", fontSize: 8, fontWeight: 600 }}>Scr</div>
                  {Array.from({length: count}, (_, i) => start + i).map(h => {
                    const s = rc.scores[h];
                    const d = s ? s - rc.holePars[h] : null;
                    const st = rc.strokeMap[h] || 0;
                    const isSkin = skinWins[`${rc.r}_${h}`] === p.id;
                    const clr = isSkin ? "#d4a843" : "#8b9ec2";
                    return (
                      <div key={h} style={{
                        textAlign: "center", fontSize: 11, fontWeight: 700, padding: "1px 0",
                        position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
                        height: 22,
                      }}>
                        {s && d !== 0 && d != null && (
                          <div style={{ position: "absolute", width: 20, height: 20, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
                            <div style={{ position: "absolute", inset: 0, borderRadius: d < 0 ? "50%" : 2, border: `1.5px solid ${clr}` }} />
                            {(d <= -2 || d >= 2) && <div style={{ position: "absolute", inset: 3, borderRadius: d < 0 ? "50%" : 1, border: `1px solid ${clr}` }} />}
                          </div>
                        )}
                        <span style={{ position: "relative", zIndex: 1, color: isSkin ? "#d4a843" : K.t2 }}>
                          {s || "·"}
                          {st > 0 && <span style={{ position: "absolute", top: -1, left: "100%", display: "flex", gap: 1, paddingLeft: 1 }}>
                            {Array.from({length: st}).map((_, i) => <span key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: K.acc, display: "block" }} />)}
                          </span>}
                        </span>
                      </div>
                    );
                  })}
                  <div style={{ textAlign: "center", fontSize: 12, fontWeight: 800, color: K.t2, display: "flex", alignItems: "center", justifyContent: "center", height: 22 }}>{grossT || ""}</div>
                </div>
              </div>
            ))}
      </div>
    );
  };

  return (
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Giant trophy silhouette behind entire leaderboard — fixed so it never shifts */}
      <img src={WBC_TROPHY_SILHOUETTE} alt="" style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 480, height: "100vh",
        maxWidth: "100vw",
        opacity: 0.08,
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 0,
        objectFit: "contain",
      }} />
      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Title inline with stacked pills */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 8 }}>
        {/* Left pill — Net/Gross */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
          <div onClick={() => setShowGross(g => !g)} style={{
            display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none",
            background: K.bdr + "20", borderRadius: 20, padding: "2px 3px", gap: 1,
          }}>
            {[["Net", false], ["Gross", true]].map(([label, val]) => (
              <span key={label} style={{
                fontSize: 8, fontWeight: 600, padding: "2px 0", borderRadius: 16,
                width: 30, textAlign: "center",
                background: showGross === val ? K.t3 + "30" : "transparent",
                color: showGross === val ? K.t2 : K.t3 + "80",
                transition: "background 0.2s, color 0.2s",
              }}>{label}</span>
            ))}
          </div>
        </div>
        {/* Center — title */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300" style={{ height: 22, width: "auto" }}>
            <rect x="62" y="14" width="76" height="10" rx="2" fill="currentColor"/>
            <path d="M68,18 C52,18 36,26 34,46 C32,64 44,80 62,88 C58,88 50,80 48,68 C44,54 48,34 58,26 C62,22 66,20 68,20Z" fill="currentColor"/>
            <path d="M132,18 C148,18 164,26 166,46 C168,64 156,80 138,88 C142,88 150,80 152,68 C156,54 152,34 142,26 C138,22 134,20 132,20Z" fill="currentColor"/>
            <path d="M62,14 L138,14 C140,14 142,15 142,17 L140,88 C138,102 126,114 112,120 L88,120 C74,114 62,102 60,88 L58,17 C58,15 60,14 62,14Z" fill="currentColor"/>
            <ellipse cx="100" cy="128" rx="16" ry="5" fill="currentColor"/>
            <rect x="92" y="128" width="16" height="18" rx="2" fill="currentColor"/>
            <rect x="74" y="144" width="52" height="8" rx="2" fill="currentColor"/>
            <rect x="60" y="152" width="80" height="60" rx="2" fill="currentColor"/>
            <rect x="50" y="210" width="100" height="10" rx="2" fill="currentColor"/>
          </svg>
          <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 20, margin: 0, fontWeight: 800 }}>Leaderboard</h2>
          {(() => {
            const isFinalized = finalizedRounds[round];
            if (isFinalized) return <span style={{ fontSize: 9, fontWeight: 700, color: K.acc, background: K.acc+"15", border: `1px solid ${K.acc}40`, borderRadius: 6, padding: "2px 8px" }}>✓ FINAL</span>;
            return null;
          })()}
        </div>
        {/* Right pill — Par/Total */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div onClick={() => setShowToPar(v => !v)} style={{
            display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none",
            background: K.bdr + "20", borderRadius: 20, padding: "2px 3px", gap: 1,
          }}>
            {[["Par", true], ["Total", false]].map(([label, val]) => (
              <span key={label} style={{
                fontSize: 8, fontWeight: 600, padding: "2px 0", borderRadius: 16,
                width: 30, textAlign: "center",
                background: showToPar === val ? K.t3 + "30" : "transparent",
                color: showToPar === val ? K.t2 : K.t3 + "80",
                transition: "background 0.2s, color 0.2s",
              }}>{label}</span>
            ))}
          </div>
        </div>
      </div>
      <div ref={containerRef} style={{ background: "transparent", borderRadius: 12, border: `1px solid ${K.bdr}`, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1 }}>
        {/* Build dynamic grid: #, Player, Total, Thru, Rd, [8px gap], prior rounds */}
        {(() => {
          const allPriorRounds = [1, 2, 3, 4];
          const statW = 34;
          const priorW = 22;
          const gridCols = `24px ${playerColW} ${statW}px ${statW}px 1fr${allPriorRounds.map(() => ` ${priorW}px`).join("")}`;
          const gridStyle = { display: "grid", gridTemplateColumns: gridCols, alignItems: "center" };
          return (
            <>
              <div ref={headerRef} style={{ ...gridStyle, padding: "7px 12px", fontSize: 9, fontWeight: 600, color: K.t3, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${K.bdr}` }}>
                <span>#</span>
                <span>Player</span>
                <span ref={totalCellRef} style={{ textAlign: "center" }}>{showGross ? "Gross" : showToPar ? "Total" : "Strokes"}</span>
                <span style={{ textAlign: "center" }}>Thru</span>
                <span />
                {allPriorRounds.map(r => <span key={r} style={{ textAlign: "center" }}>R{r}</span>)}
              </div>
              {lb.length === 0 && <div style={{ padding: 24, textAlign: "center", color: K.t3, fontSize: 12 }}>No scores yet — be the first!</div>}
              <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              {(() => {
                // Pre-compute tied positions
                const posMap = {};
                let i = 0;
                while (i < lb.length) {
                  if (lb[i].roundsPlayed === 0) { posMap[lb[i].id] = i + 1; i++; continue; }
                  let j = i + 1;
                  while (j < lb.length && lb[j].roundsPlayed > 0 && lb[j].totalNetToPar === lb[i].totalNetToPar) j++;
                  const tied = j - i > 1;
                  for (let k = i; k < j; k++) posMap[lb[k].id] = tied ? `T${i + 1}` : i + 1;
                  i = j;
                }
                const rows = lb.map((p, idx) => {
                const pos = posMap[p.id] ?? idx + 1;
                const rd = p.rds[round - 1];
                const top3 = pos === 1 || pos === "T1";
                const isExpanded = expanded === p.id;
                const mov = movements[p.id];
                const displayTotal = showGross
                  ? (() => {
                      let g = 0;
                      for (let r = 1; r <= 4; r++) {
                        const scores = holeData[`${p.id}_${r}`] || {};
                        Object.values(scores).forEach(s => { g += s; });
                      }
                      return g > 0 ? g : null;
                    })()
                  : showToPar
                    ? (p.roundsPlayed > 0 ? p.totalNetToPar : null)
                    : (() => {
                        // Net total strokes across all rounds
                        let netTotal = 0; let hasAny = false;
                        for (let r = 1; r <= 4; r++) {
                          const prRd = p.rds[r - 1];
                          if (prRd && !prRd.wd && prRd.netToPar != null) {
                            const tr2 = tRounds.find(t => t.round_number === r);
                            const c2 = tr2 ? courses.find(c => c.id === tr2.course_id) : null;
                            const par2 = c2?.hole_pars?.reduce((a,b) => a+b, 0) || 72;
                            netTotal += prRd.netToPar + par2;
                            hasAny = true;
                          }
                        }
                        return hasAny ? netTotal : null;
                      })();
                const rdDisplay = showGross
                  ? (() => {
                      const scores = holeData[`${p.id}_${round}`] || {};
                      const g = Object.values(scores).reduce((a,b) => a+b, 0);
                      return g > 0 ? g : null;
                    })()
                  : rd?.netToPar;
                return (
                  <div key={p.id} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div onClick={() => { setExpanded(isExpanded ? null : p.id); setScorecardRound(null); }} style={{ ...gridStyle, padding: "0 12px", minHeight: 0, height: "100%", alignItems: "center", borderBottom: `1px solid ${K.bdr}10`, background: "transparent", cursor: "pointer", fontSize: rowStyle.fontSize, lineHeight: 1 }}>
                      {/* # */}
                      <span style={{ fontWeight: 800, fontSize: rowStyle.fontSize, color: top3 ? K.acc : K.t3, display: "flex", alignItems: "center", gap: 1 }}>
                        {pos}
                        {mov && <span style={{ fontSize: 7, color: mov === "up" ? "#22c55e" : "#ef4444", lineHeight: 1 }}>{mov === "up" ? "▲" : "▼"}</span>}
                      </span>
                      {/* Player */}
                      <div style={{ fontWeight: 600, fontSize: rowStyle.fontSize, display: "flex", alignItems: "center", gap: 3, overflow: "hidden" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                        <span style={{ fontSize: 8, flexShrink: 0, color: isExpanded ? K.acc : K.t3, transition: "transform 0.2s", display: "inline-block", transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
                      </div>
                      {/* Total */}
                      <span style={{ textAlign: "center", fontWeight: 800, fontSize: rowStyle.fontSize + 1, color: p.isWD ? K.t3 : displayTotal != null ? (showGross || !showToPar ? K.t2 : displayTotal < 0 ? "#ef4444" : displayTotal > 0 ? K.t2 : K.t1) : K.t3 }}>
                        {p.isWD ? <span style={{ fontSize: rowStyle.fontSize - 1, color: K.t3, fontWeight: 700 }}>WD</span> : displayTotal != null ? (showGross || !showToPar ? displayTotal : fmtPar(displayTotal)) : "—"}
                      </span>
                      {/* Thru */}
                      <span style={{ textAlign: "center", fontSize: rowStyle.fontSize - 2, color: K.t2 }}>{p.isWD ? "—" : rd?.thru > 0 ? (rd.thru === 18 ? "F" : rd.thru) : "—"}</span>
                      {/* Gap between current round stats and prior rounds */}
                      <span />
                      {/* Prior rounds — always show all 4 */}
                      {allPriorRounds.map(r => {
                        const prRd = p.rds[r - 1];
                        const isWDRound = prRd?.wd;
                        const prVal = isWDRound ? null : showGross
                          ? (() => { const scores = holeData[`${p.id}_${r}`] || {}; const g = Object.values(scores).filter(s => s !== 99).reduce((a,b) => a+b, 0); return g > 0 ? g : null; })()
                          : showToPar
                            ? prRd?.netToPar
                            : (() => {
                                if (!prRd || prRd.netToPar == null) return null;
                                const tr2 = tRounds.find(t => t.round_number === r);
                                const c2 = tr2 ? courses.find(c => c.id === tr2.course_id) : null;
                                const par2 = c2?.hole_pars?.reduce((a,b) => a+b, 0) || 72;
                                return prRd.netToPar + par2;
                              })();
                        return (
                          <span key={r} style={{ textAlign: "center", fontSize: rowStyle.fontSize - 2, color: isWDRound ? K.t3 : prVal != null && !showGross && showToPar && prVal < 0 ? "#ef4444" : K.t3, opacity: isWDRound ? 0.5 : prVal != null ? 0.6 : 0.3 }}>
                            {isWDRound ? "WD" : prVal != null ? (showGross || !showToPar ? prVal : fmtPar(prVal)) : "—"}
                          </span>
                        );
                      })}
                    </div>
                    {isExpanded && (
                      <div style={{ borderBottom: `1px solid ${K.bdr}30`, background: K.bg + "80" }}>
                        {renderScorecard(p)}
                      </div>
                    )}
                  </div>
                );
              });
                return <>{rows}</>;
              })()}
              </div>
            </>
          );
        })()}
      </div>
      </div>
    </div>
  );
}

// ── NINE CARD ──

// ── ON-COURSE SCORING (replaces old ScoringView) ──
// Flow: Group Setup → Hole-by-hole for entire group → auto-advance
function OnCourseScoring({ user, players, round, tRounds, courses, holeData, tPlayers, onSaveHole, notify, pairingsData, teeData, setTee, getPlayerTee, finalizedRounds, onFinalizeRound, onUnfinalizeRound, onNavigate, onGoToAdminCourses, markPlayerWD }) {
  const [group, setGroup] = useState(null);
  const [currentHole, setCurrentHole] = useState(0);
  const [manualOverride, setManualOverride] = useState(false);
  const [showTeePicker, setShowTeePicker] = useState(null);
  const [expandedScores, setExpandedScores] = useState(null);
  const [editingCompleted, setEditingCompleted] = useState(false);
  const [navSource, setNavSource] = useState("auto");
  const navSourceRef = useRef("auto");
  const setNavSourceSynced = (v) => { navSourceRef.current = v; setNavSource(v); };
  const [holeTransition, setHoleTransition] = useState("idle");
  const [transitionDir, setTransitionDir] = useState(1); // 1 = forward (→), -1 = backward (←)
  const [showFinalize, setShowFinalize] = useState(false);
  const [wdConfirm, setWdConfirm] = useState(null);


  const tr = tRounds.find(t => t.round_number === round);
  const course = tr ? courses.find(c => c.id === tr.course_id) : null;

  // Check if director pre-set pairings for this round
  const presetGroups = (pairingsData || {})[round] || [];
  const myPresetGroup = presetGroups.find(g => g.includes(user.id));

  // Auto-assign group from pairings if available and not manually overridden
  useEffect(() => {
    if (myPresetGroup && !manualOverride) {
      // Update group if pairings were set/changed (even if group already exists)
      const currentIds = (group || []).slice().sort().join(",");
      const presetIds = myPresetGroup.slice().sort().join(",");
      if (currentIds !== presetIds) {
        setGroup(myPresetGroup);
        setCurrentHole(0);
      }
    } else if (!myPresetGroup) {
      // No pairings for this round — clear any stale group from a previous round
      setGroup(null);
      setCurrentHole(0);
      setManualOverride(false);
    }
  }, [round, JSON.stringify(myPresetGroup)]);

  // When group is set, resume at correct hole
  useEffect(() => {
    if (!group || !course) return;
    const gPlayers = group.map(id => players.find(p => p.id === id)).filter(Boolean);
    // Find first incomplete hole
    for (let i = 0; i < 18; i++) {
      const allDone = gPlayers.every(p => (holeData[`${p.id}_${round}`] || {})[i] > 0);
      if (!allDone) {
        setCurrentHole(i);
        setNavSourceSynced("auto"); // incomplete hole — allow auto-advance after scoring
        return;
      }
    }
    // All 18 complete — land on hole 18, manual so editing mode shows
    setCurrentHole(17);
    setNavSourceSynced("manual");
    setEditingCompleted(true);
  }, [group]);

  // Note: round changes from other tabs should NOT reset scoring state
  // since the scoring component stays mounted. The group persists.

  const holePars = course ? (course.hole_pars || []) : [];
  const holeHcps = course ? (course.hole_handicaps || []) : [];
  const groupPlayers = group ? group.map(id => players.find(p => p.id === id)).filter(Boolean) : [];
  const par = holePars[currentHole] || 4;
  const hcp = holeHcps[currentHole] || (currentHole + 1);

  const getScore = (pid) => {
    const key = `${pid}_${round}`;
    return (holeData[key] || {})[currentHole] || 0;
  };

  const allScored = group ? groupPlayers.every(p => getScore(p.id) > 0) : false;

  const isHoleComplete = (holeIdx) => {
    if (!group) return false;
    return groupPlayers.every(p => {
      const key = `${p.id}_${round}`;
      return (holeData[key] || {})[holeIdx] > 0;
    });
  };

  const findNextIncompleteHole = () => {
    for (let i = 0; i < 18; i++) {
      if (!isHoleComplete(i)) return i;
    }
    return 17; // all complete
  };

  const goToHole = (holeIdx) => {
    if (holeIdx === currentHole) return;
    const dir = holeIdx > currentHole ? 1 : -1;
    setTransitionDir(dir);
    setHoleTransition("out");
    setTimeout(() => {
      setNavSourceSynced("manual");
      setEditingCompleted(false);
      setExpandedScores(null);
      setCurrentHole(holeIdx);
      setHoleTransition("in-start"); // instant: new content placed off-screen right
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setHoleTransition("in-end"); // animated: slides in from right to center
        setTimeout(() => setHoleTransition("idle"), 250);
      }));
    }, 180);
  };

  const returnToPlay = () => {
    const next = findNextIncompleteHole();
    setNavSourceSynced("auto");
    setEditingCompleted(false);
    setExpandedScores(null);
    setCurrentHole(next);
  };

  // All 18 holes complete for the group
  const allRoundComplete = group ? (() => {
    const gPlayers = group.map(id => players.find(p => p.id === id)).filter(Boolean);
    return gPlayers.every(p => {
      for (let h = 0; h < 18; h++) { if (!((holeData[`${p.id}_${round}`] || {})[h] > 0)) return false; }
      return true;
    });
  })() : false;

  // When all 18 complete and not finalized, auto-show finalize prompt (only once)
  const shownFinalizeRef = useRef(false);
  useEffect(() => {
    if (!group) return;
    const groupKey = `${round}_${group.slice().sort().join(",")}`;
    const isFinalized = finalizedRounds[groupKey] || finalizedRounds[round];
    if (allRoundComplete && !isFinalized && !shownFinalizeRef.current) {
      shownFinalizeRef.current = true;
      setCurrentHole(17);
      setNavSourceSynced("manual");
      setTimeout(() => setShowFinalize(true), 400);
    }
    if (!allRoundComplete) shownFinalizeRef.current = false;
  }, [allRoundComplete, JSON.stringify(group), round]);

  // Auto-advance after short delay when all scored (only on fresh scoring, not editing)
  useEffect(() => {
    if (allScored && currentHole < 17 && navSourceRef.current === "auto" && !editingCompleted && !allRoundComplete) {
      const timer = setTimeout(() => {
        setTransitionDir(1);
        setHoleTransition("out");
        const advance = setTimeout(() => {
          setCurrentHole(h => {
            // Skip over any already-completed holes when auto-advancing
            let next = h + 1;
            while (next < 17 && groupPlayers.every(p => (holeData[`${p.id}_${round}`] || {})[next] > 0)) {
              next++;
            }
            return next;
          });
          setNavSourceSynced("auto");
          setExpandedScores(null);
          setHoleTransition("in-start");
          requestAnimationFrame(() => requestAnimationFrame(() => {
            setHoleTransition("in-end");
            setTimeout(() => setHoleTransition("idle"), 250);
          }));
        }, 180);
        return () => clearTimeout(advance);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [allScored, currentHole, editingCompleted]);

  const getCH = (p) => {
    if (!course) return 0;
    const tp = tPlayers.find(t => t.player_id === p.id);
    const hi = parseFloat(tp?.handicap_index) || 0;
    const tee = getPlayerTee(round, p.id, course);
    return calcCH(hi, tee?.slope || course.slope, tee?.rating || course.rating, tee?.par || course.par);
  };

  const getTeeName = (p) => {
    const tee = getPlayerTee(round, p.id, course);
    return tee?.name || "Default";
  };

  const getTeeColor = (p) => {
    const tee = getPlayerTee(round, p.id, course);
    return tee?.color || "#64748b";
  };

  // Calculate strokes per hole - handles CH > 18 (wraps around)
  const getStrokesMap = (ch) => {
    const map = {};
    const sorted = holeHcps.map((h, i) => ({ idx: i, hcp: h })).sort((a, b) => a.hcp - b.hcp);
    let rem = Math.abs(ch);
    // First pass: 1 stroke each, easiest-to-hardest by handicap index
    for (const h of sorted) { if (rem <= 0) break; map[h.idx] = (map[h.idx] || 0) + 1; rem--; }
    // Second pass: if CH > 18, wrap around for 2nd strokes
    for (const h of sorted) { if (rem <= 0) break; map[h.idx] = (map[h.idx] || 0) + 1; rem--; }
    // Third pass: if CH > 36 (unlikely but safe)
    for (const h of sorted) { if (rem <= 0) break; map[h.idx] = (map[h.idx] || 0) + 1; rem--; }
    return map;
  };

  const getStrokes = (p, holeIdx) => {
    const ch = getCH(p);
    const map = getStrokesMap(ch);
    return map[holeIdx] || 0;
  };

  const getRunning = (pid) => {
    const key = `${pid}_${round}`;
    const scores = holeData[key] || {};
    let gross = 0, netToPar = 0, thru = 0;
    if (!course) return { gross, netToPar, thru };
    const tp = tPlayers.find(t => t.player_id === pid);
    const hi = parseFloat(tp?.handicap_index) || 0;
    const tee = getPlayerTee(round, pid, course);
    const ch = calcCH(hi, tee?.slope || course.slope, tee?.rating || course.rating, tee?.par || course.par);
    const strokeMap = getStrokesMap(ch);
    for (let h = 0; h < 18; h++) {
      if (scores[h]) {
        gross += scores[h];
        const p = holePars[h] || 4;
        const stroke = strokeMap[h] || 0;
        netToPar += (scores[h] - stroke - p);
        thru++;
      }
    }
    return { gross, netToPar, thru };
  };

  // ── EARLY RETURNS (after all hooks) ──
  if (!course) return (
    <div>
      <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 22, margin: "0 0 14px", fontWeight: 800 }}>Score — Round {round}</h2>
      <div
        onClick={user.isDirector && onGoToAdminCourses ? onGoToAdminCourses : undefined}
        style={{ background: K.card, borderRadius: 14, border: `1px dashed ${K.warn}40`, padding: 32, textAlign: "center", cursor: user.isDirector ? "pointer" : "default" }}
      >
        <div style={{ fontSize: 36, marginBottom: 8 }}>🏌️</div>
        <p style={{ color: K.warn, fontWeight: 600, margin: "0 0 4px" }}>No course set for Round {round}</p>
        {user.isDirector
          ? <p style={{ color: K.acc, fontSize: 13, margin: "0 0 0", fontWeight: 600 }}>Tap to set up course in Admin →</p>
          : <p style={{ color: K.t2, fontSize: 13, margin: 0 }}>Waiting on your tournament director.</p>
        }
      </div>
    </div>
  );

  if (!group) {
    if (myPresetGroup && !manualOverride) {
      setGroup(myPresetGroup);
      return null;
    }
    // Directors can pick any group to score
    if (user.isDirector && presetGroups.length > 0) {
      return (
        <div style={{ padding: "16px 0" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: K.t2, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Select Group to Score</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {presetGroups.map((grp, gi) => {
              const grpPlayers = grp.map(id => players.find(p => p.id === id)).filter(Boolean);
              const grpKey = `${round}_${grp.slice().sort().join(",")}`;
              const isFinalized = finalizedRounds[grpKey] || finalizedRounds[round];
              const holesScored = Math.max(...grpPlayers.map(p => {
                const s = holeData[`${p.id}_${round}`] || {};
                return Object.values(s).filter(v => v > 0).length;
              }), 0);
              const allComplete = grpPlayers.every(p => { for (let h = 0; h < 18; h++) { if (!((holeData[`${p.id}_${round}`] || {})[h] > 0)) return false; } return true; });
              return (
                <div key={gi} style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                  <button onClick={() => { setGroup(grp); setManualOverride(true); }} style={{
                    flex: 1, background: K.card, border: `1px solid ${K.bdr}`, borderRadius: 12,
                    padding: "12px 16px", cursor: "pointer", textAlign: "left",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: K.acc, marginBottom: 4 }}>Group {gi + 1}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: K.t1 }}>{grpPlayers.map(p => p.name.split(" ")[0]).join(", ")}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {isFinalized
                        ? <span style={{ fontSize: 10, fontWeight: 700, color: K.acc, background: K.accGlow, padding: "3px 8px", borderRadius: 6 }}>✓ Final</span>
                        : allComplete
                          ? <span style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", background: "#fbbf2415", padding: "3px 8px", borderRadius: 6 }}>18 ✓ Ready</span>
                          : holesScored > 0
                            ? <span style={{ fontSize: 10, fontWeight: 600, color: K.warn }}>Thru {holesScored}</span>
                            : <span style={{ fontSize: 10, color: K.t3 }}>Not started</span>
                      }
                    </div>
                  </button>
                  {allComplete && !isFinalized && (
                    <button onClick={() => { onFinalizeRound(grpKey); notify("Group finalized! ✓"); }} style={{
                      padding: "0 16px", borderRadius: 12, background: K.acc, border: "none",
                      color: K.bg, fontSize: 11, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
                    }}>✓ Finalize</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: K.t1, marginBottom: 6 }}>Waiting for Pairings</div>
        <div style={{ fontSize: 12, color: K.t3 }}>Your tournament director will set up groups before the round begins.</div>
      </div>
    );
  }

  // ── FINALIZED EARLY RETURN ──
  const _groupKey = group ? `${round}_${group.slice().sort().join(",")}` : null;
  const isGroupFinalized = _groupKey && (finalizedRounds[_groupKey] || finalizedRounds[round]);
  if (isGroupFinalized) return (
    <div style={{ padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Round banner */}
      {(() => {
        const tr = tRounds.find(t => t.round_number === round);
        const c = tr ? courses.find(cx => cx.id === tr.course_id) : null;
        return (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "7px 12px", background: K.accGlow, borderRadius: 10, border: `1px solid ${K.acc}30` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: K.acc }}>Round {round}</span>
            {c && <><span style={{ color: K.acc, opacity: 0.4 }}>·</span><span style={{ fontSize: 11, color: K.t2, fontWeight: 500 }}>{c.name}</span></>}
          </div>
        );
      })()}
      {/* Submitted notice */}
      <div style={{ background: K.acc + "10", border: `1px solid ${K.acc}30`, borderRadius: 14, padding: "24px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🏆</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: K.acc, marginBottom: 6 }}>Scorecard Submitted</div>
        <div style={{ fontSize: 12, color: K.t3, lineHeight: 1.6, marginBottom: user.isDirector ? 16 : 0 }}>
          Your round has been submitted and is waiting on the tournament director to finalize.
        </div>
        {user.isDirector && (
          <button onClick={() => { onUnfinalizeRound(_groupKey); notify("Round unfinalized — scores unlocked"); }} style={{
            marginTop: 4, padding: "10px 20px", borderRadius: 10,
            background: "transparent", border: `1px solid ${K.bdr}`,
            color: K.t3, fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>↩ Unfinalize to Edit Scores</button>
        )}
      </div>
    </div>
  );

  return (
    <div>
      {/* Director: back to group picker */}
      {user.isDirector && presetGroups.length > 1 && (
        <button onClick={() => { setGroup(null); setManualOverride(false); }} style={{
          background: "transparent", border: "none", color: K.acc, fontSize: 12,
          fontWeight: 600, cursor: "pointer", padding: "0 0 10px 0", display: "flex", alignItems: "center", gap: 4,
        }}>← All Groups</button>
      )}
      {/* Round banner */}
      {(() => {
        const tr = tRounds.find(t => t.round_number === round);
        const course = tr ? courses.find(c => c.id === tr.course_id) : null;
        return (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "7px 12px", marginBottom: 8, background: K.accGlow, borderRadius: 10, border: `1px solid ${K.acc}30` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: K.acc }}>Round {round}</span>
            {course && <><span style={{ color: K.acc, opacity: 0.4 }}>·</span><span style={{ fontSize: 11, color: K.t2, fontWeight: 500 }}>{course.name}</span></>}
          </div>
        );
      })()}
      {/* Hole navigator - Front 9 / Back 9 */}
      <div style={{ marginBottom: 8 }}>
        {[0, 9].map(start => (
          <div key={start} style={{ display: "flex", gap: 2, justifyContent: "center", marginBottom: 2 }}>
            {Array.from({ length: 9 }, (_, i) => start + i).map(i => {
              const allScoredHole = groupPlayers.every(p => (holeData[`${p.id}_${round}`] || {})[i] > 0);
              const isCurrent = i === currentHole;
              return (
                <button key={i} onClick={() => goToHole(i)} style={{
                  flex: 1, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: allScoredHole || isCurrent ? 12 : 6,
                  border: allScoredHole && !isCurrent ? `1.5px solid ${K.acc}60` : "none",
                  cursor: "pointer",
                  fontSize: 11, fontWeight: 700,
                  background: isCurrent ? K.acc : allScoredHole ? K.accDim + "18" : K.card,
                  color: isCurrent ? K.bg : allScoredHole ? K.acc : K.t3,
                  outline: isCurrent ? `2px solid ${K.acc}` : "none",
                  outlineOffset: 1,
                  transition: "all 0.15s",
                }}>{i + 1}</button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Animated hole content */}
      <div style={{
        transition: holeTransition === "in-start" ? "none" : "opacity 0.2s ease, transform 0.2s ease",
        opacity: holeTransition === "out" ? 0 : holeTransition === "in-start" ? 0 : 1,
        transform: holeTransition === "out"
          ? `translateX(${transitionDir * -60}px)`
          : holeTransition === "in-start"
            ? `translateX(${transitionDir * 60}px)`
            : "translateX(0)",
      }}>

      {/* Current hole header - compact with par left, hcp right */}
      <div style={{
        background: `linear-gradient(135deg, ${K.card}, #12233f)`,
        borderRadius: 12, border: `1px solid ${K.bdr}`, padding: "10px 16px",
        marginBottom: 8, position: "relative",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => goToHole(Math.max(0, currentHole - 1))} disabled={currentHole === 0}
            style={{ width: 34, height: 34, borderRadius: 10, background: K.inp, border: `1px solid ${K.bdr}`, color: currentHole === 0 ? K.t3 + "40" : K.t1, fontSize: 16, cursor: "pointer", fontWeight: 700 }}>‹</button>
          <div style={{ fontSize: 10, color: K.t3, textAlign: "center" }}>
            <span style={{ fontWeight: 600 }}>Par</span>
            <div style={{ fontSize: 16, fontWeight: 700, color: K.t3, lineHeight: 1, marginTop: 2 }}>{par}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: K.t1, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Hole</div>
            <div style={{ fontSize: 40, fontWeight: 800, fontFamily: "'Montserrat', sans-serif", lineHeight: 1, color: K.t1 }}>{currentHole + 1}</div>
          </div>
          <div style={{ fontSize: 10, color: K.t3, textAlign: "center" }}>
            <span style={{ fontWeight: 600 }}>HCP</span>
            <div style={{ fontSize: 16, fontWeight: 700, color: K.t3, lineHeight: 1, marginTop: 2 }}>{hcp}</div>
          </div>
          <button onClick={() => goToHole(Math.min(17, currentHole + 1))} disabled={currentHole === 17}
            style={{ width: 34, height: 34, borderRadius: 10, background: K.inp, border: `1px solid ${K.bdr}`, color: currentHole === 17 ? K.t3 + "40" : K.t1, fontSize: 16, cursor: "pointer", fontWeight: 700 }}>›</button>
        </div>
      </div>

      {/* Completed hole confirmation overlay */}
      {navSource === "manual" && isHoleComplete(currentHole) && !editingCompleted && (<>
        <div style={{
          background: "#fbbf2410", border: `1px solid #fbbf2440`, borderRadius: 12,
          padding: 12, marginBottom: 8,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginBottom: 8, textAlign: "center" }}>Hole {currentHole + 1} already complete</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setEditingCompleted(true)} style={{
              flex: 1, padding: "8px 0", borderRadius: 8, background: K.card, border: `1px solid #fbbf2440`,
              color: "#fbbf24", fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}>Edit Scores</button>
            <button onClick={returnToPlay} style={{
              flex: 1, padding: "8px 0", borderRadius: 8, background: K.acc, border: "none",
              color: K.bg, fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}>Resume Hole {findNextIncompleteHole() + 1} →</button>
          </div>
        </div>
        {/* Recorded scores - styled like scoring cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {groupPlayers.map(p => {
            const s = (holeData[`${p.id}_${round}`] || {})[currentHole] || 0;
            const ch = getCH(p);
            const strokes = getStrokes(p, currentHole);
            const sd = s - par;
            const clr = sd < 0 ? "#ef4444" : sd === 0 ? "#94a3b8" : "#3b82f6";
            const maxBase = 8;
            const btnScores = [2,3,4,5,6,7,8];
            // Adjust range if score is outside normal buttons
            let displayScores = [...btnScores];
            if (s === 1) displayScores[0] = 1;
            if (s > maxBase) displayScores[displayScores.length - 1] = s;
            return (
              <div key={p.id} style={{
                background: K.card, borderRadius: 10, border: `1px solid ${K.bdr}`,
                padding: "8px 10px", opacity: 0.7,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: K.acc, fontWeight: 700 }}>{ch}</span>
                    {strokes > 0 && <span style={{ color: K.acc, fontSize: 11, letterSpacing: "-1px" }}>{"●".repeat(strokes)}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 3 }}>
                  {displayScores.map(btn => {
                    const isCur = btn === s;
                    const bsd = btn - par;
                    const bclr = bsd < 0 ? "#ef4444" : bsd === 0 ? "#94a3b8" : "#3b82f6";
                    const sz = 32;
                    return (
                      <div key={btn} style={{
                        flex: 1, height: 38,
                        fontWeight: 800, fontSize: 15, textAlign: "center",
                        background: isCur ? "#94a3b8" : "#94a3b80a",
                        color: isCur ? K.bg : "#94a3b8",
                        borderRadius: 8, position: "relative",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {isCur && bsd !== 0 && (
                          <div style={{ position: "absolute", width: sz, height: sz, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
                            <div style={{ position: "absolute", inset: 0, borderRadius: bsd < 0 ? "50%" : 3, border: `1.5px solid ${bclr}` }} />
                            {(bsd <= -2 || bsd >= 2) && <div style={{ position: "absolute", inset: 3, borderRadius: bsd < 0 ? "50%" : 2, border: `1px solid ${bclr}` }} />}
                          </div>
                        )}
                        <span style={{ position: "relative", zIndex: 1 }}>{btn}</span>
                      </div>
                    );
                  })}
                  <div style={{ flex: "0 0 32px" }} />
                </div>
              </div>
            );
          })}
        </div>
      </>)}

      {/* Return to play banner */}
      {editingCompleted && (
        <div style={{
          background: "#fde04730", border: `1.5px solid #fde047`, borderRadius: 8,
          padding: "6px 12px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 13, color: "#fde047", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>✏️ EDITING HOLE {currentHole + 1}</span>
          <button onClick={returnToPlay} style={{
            padding: "4px 12px", borderRadius: 6, background: K.acc, border: "none",
            color: K.bg, fontSize: 10, fontWeight: 700, cursor: "pointer",
          }}>Resume Hole {findNextIncompleteHole() + 1} →</button>
        </div>
      )}

      {/* Player score cards */}
      {!(navSource === "manual" && isHoleComplete(currentHole) && !editingCompleted) && (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {groupPlayers.map(p => {
          const score = getScore(p.id);
          const ch = getCH(p);
          const strokes = getStrokes(p, currentHole);
          const running = getRunning(p.id);
          const d = score ? score - par : null;

          return (
            <div key={p.id} style={{
              background: K.card, borderRadius: 10, border: `1px solid ${K.bdr}`,
              padding: "8px 10px",
            }}>
              {/* Player header row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: K.acc, fontWeight: 700 }}>{ch}</span>
                  {strokes > 0 && <span style={{ color: K.acc, fontSize: 11, letterSpacing: "-1px" }}>{"●".repeat(strokes)}</span>}
                </div>
                {running.thru > 0 && <span style={{ fontSize: 10, color: K.t3 }}>Thru {running.thru}: <span style={{ color: running.netToPar < 0 ? "#ef4444" : running.netToPar > 0 ? K.t2 : "#94a3b8", fontWeight: 700 }}>{fmtPar(running.netToPar)}</span></span>}
              </div>

              {/* Tee picker - expandable */}
              {showTeePicker === p.id && course.tee_boxes && course.tee_boxes.length > 0 && (
                <div style={{ display: "flex", gap: 3, marginBottom: 6, flexWrap: "wrap" }}>
                  {course.tee_boxes.map(tee => {
                    const isActive = getTeeName(p) === tee.name;
                    const tp2 = tPlayers.find(t => t.player_id === p.id);
                    const hi2 = parseFloat(tp2?.handicap_index) || 0;
                    const previewCH = calcCH(hi2, tee.slope, tee.rating, tee.par);
                    return (
                      <button key={tee.name} onClick={() => { setTee(round, p.id, tee.name); setShowTeePicker(null); }} style={{
                        flex: 1, minWidth: 55, padding: "6px 4px", borderRadius: 6, cursor: "pointer", textAlign: "center",
                        background: isActive ? tee.color + "25" : K.inp,
                        border: `1.5px solid ${isActive ? tee.color : K.bdr}`,
                        color: K.t1,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, marginBottom: 1 }}>
                          <TeeColorSwatch color={tee.color} name={tee.name} size={8} />
                          <span style={{ fontSize: 10, fontWeight: 700 }}>{tee.name}</span>
                        </div>
                        <div style={{ fontSize: 9, color: K.acc, fontWeight: 700 }}>CH {previewCH}</div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Score buttons */}
              {(() => {
                const baseScores = [2,3,4,5,6,7,8];
                let displayScores = [...baseScores];
                // If score is 1 (ace), replace the lowest button
                if (score === 1) displayScores[0] = 1;
                // If score > 8, replace the highest button
                if (score > 8) displayScores[displayScores.length - 1] = score;
                return (
                  <div style={{ display: "flex", gap: 3 }}>
                    {displayScores.map(s => {
                      const isCur = s === score;
                      const sd = s - par;
                      const clr = sd < 0 ? "#ef4444" : sd === 0 ? "#94a3b8" : "#3b82f6";
                      const sz = 32;
                      return (
                        <button key={s} onClick={() => { onSaveHole(p.id, round, currentHole, s); setExpandedScores(null); }} style={{
                          flex: 1, height: 38, cursor: "pointer",
                          fontWeight: 800, fontSize: 15, textAlign: "center",
                          background: isCur ? "#94a3b8" : "#94a3b80a",
                          color: isCur ? K.bg : "#94a3b8",
                          border: "none", borderRadius: 8,
                          position: "relative",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {isCur && sd !== 0 && (
                            <div style={{ position: "absolute", width: sz, height: sz, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
                              <div style={{ position: "absolute", inset: 0, borderRadius: sd < 0 ? "50%" : 3, border: `1.5px solid ${clr}` }} />
                              {(sd <= -2 || sd >= 2) && <div style={{ position: "absolute", inset: 3, borderRadius: sd < 0 ? "50%" : 2, border: `1px solid ${clr}` }} />}
                            </div>
                          )}
                          <span style={{ position: "relative", zIndex: 1 }}>{s}</span>
                        </button>
                      );
                    })}
                    {expandedScores !== p.id ? (
                      <button onClick={() => setExpandedScores(p.id)} style={{
                        flex: "0 0 32px", padding: "8px 0", borderRadius: 8, border: `1px solid ${K.bdr}`,
                        background: K.inp, color: K.t3, fontWeight: 700, fontSize: 12, cursor: "pointer", textAlign: "center",
                      }}>···</button>
                    ) : (
                      <div style={{ flex: "0 0 80px", display: "flex", gap: 2 }}>
                        <input type="number" inputMode="numeric" pattern="[0-9]*" autoFocus
                          defaultValue="" placeholder="#"
                          onKeyDown={e => { if (e.key === "Enter") { const v = parseInt(e.target.value); if (v > 0 && v <= 20) { onSaveHole(p.id, round, currentHole, v); setExpandedScores(null); } } }}
                          onBlur={e => { const v = parseInt(e.target.value); if (v > 0 && v <= 20) { onSaveHole(p.id, round, currentHole, v); } setExpandedScores(null); }}
                          style={{
                            width: 34, padding: "4px 2px", borderRadius: 6, border: `2px solid ${K.acc}`,
                            background: K.inp, color: K.t1, fontSize: 15, fontWeight: 800, textAlign: "center",
                          }} />
                        <button onClick={e => { e.stopPropagation(); setExpandedScores(null); setWdConfirm(p.id); }} style={{
                          padding: "4px 5px", borderRadius: 6, border: "1px solid #ef444460",
                          background: "transparent", color: K.danger, fontSize: 9, fontWeight: 700, cursor: "pointer",
                        }}>WD</button>
                        <button onClick={() => setExpandedScores(null)} style={{
                          padding: "0 3px", borderRadius: 4, border: "none",
                          background: "transparent", color: K.t3, fontSize: 10, cursor: "pointer",
                        }}>✕</button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
      )}

      </div>{/* end animated hole content */}

      {/* Footer */}
      <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
        {(() => {
          const groupKey = `${round}_${group.slice().sort().join(",")}`;
          const isGroupFinalized = finalizedRounds[groupKey] || finalizedRounds[round];
          if (isGroupFinalized) return (
            <div style={{ flex: 1, background: K.acc + "10", border: `1px solid ${K.acc}30`, borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 14 }}>🏆</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: K.acc }}>Group Finalized</span>
              </div>
              <div style={{ fontSize: 10, color: K.t3, lineHeight: 1.5, marginBottom: 8 }}>
                Scores are locked. The tournament director will advance the tournament to the next round.
              </div>
              {user.isDirector && onUnfinalizeRound && (
                <button onClick={() => { onUnfinalizeRound(groupKey); notify("Round unfinalized — scores unlocked"); }} style={{
                  width: "100%", padding: "7px 0", borderRadius: 8,
                  background: "transparent", border: `1px solid ${K.bdr}`,
                  color: K.t3, fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}>↩ Unfinalize to Edit Scores</button>
              )}
            </div>
          );
          const hole18Done = groupPlayers.every(p => ((holeData[`${p.id}_${round}`] || {})[17] > 0));
          if (!hole18Done) return null;
          const allComplete = groupPlayers.every(p => { for (let h = 0; h < 18; h++) { if (!((holeData[`${p.id}_${round}`] || {})[h] > 0)) return false; } return true; });
          return (
            <button onClick={() => setShowFinalize(true)} style={{
              flex: 1, padding: "8px 0", borderRadius: 8,
              background: allComplete ? K.acc : K.card,
              border: allComplete ? "none" : `1px solid ${K.bdr}`,
              color: allComplete ? K.bg : K.t2,
              fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}>✓ Finalize Group</button>
          );
        })()}
      </div>

      {/* WD confirmation modal */}
      {wdConfirm && (
          <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div style={{ background: K.card, borderRadius: 16, border: `1px solid ${K.danger}60`, width: "100%", maxWidth: 340, overflow: "hidden" }}>
              <div style={{ background: K.danger + "15", borderBottom: `1px solid ${K.danger}30`, padding: "16px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>⛳</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: K.danger }}>Withdraw Player</div>
              </div>
              <div style={{ padding: "16px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: K.t1, fontWeight: 600, marginBottom: 6 }}>
                  {players.find(p => p.id === wdConfirm)?.name} has withdrawn from the WBC.
                </div>
                <div style={{ fontSize: 11, color: K.t3, lineHeight: 1.5 }}>
                  Remaining holes will be marked WD. Any completed holes count toward the skins game. This cannot be undone.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, padding: "0 16px 16px" }}>
                <button onClick={() => setWdConfirm(null)} style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, background: K.inp, border: `1px solid ${K.bdr}`,
                  color: K.t2, fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>Cancel</button>
                <button onClick={() => { markPlayerWD(wdConfirm); setWdConfirm(null); }} style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, background: K.danger, border: "none",
                  color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>Confirm WD</button>
              </div>
            </div>
          </div>
      )}

      {/* Finalize confirmation modal with mini scorecards */}
      {showFinalize && (() => {
        const finalizeMissing = [];
        groupPlayers.forEach(p => {
          const scores = holeData[`${p.id}_${round}`] || {};
          const missingHoles = [];
          for (let h = 0; h < 18; h++) { if (!(scores[h] > 0)) missingHoles.push(h + 1); }
          if (missingHoles.length > 0) finalizeMissing.push({ name: p.name, holes: missingHoles });
        });
        return (
          <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
            <div style={{ background: K.card, borderRadius: 16, padding: 16, maxWidth: 400, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
              <div style={{ textAlign: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: K.t1 }}>Finalize Group — Round {round}</div>
                {course && <div style={{ fontSize: 11, color: K.acc, fontWeight: 600, marginTop: 2 }}>{course.name}</div>}
              </div>
              {finalizeMissing.length > 0 && (
                <div style={{ background: K.warn + "15", border: `1px solid ${K.warn}30`, borderRadius: 8, padding: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: K.warn, fontWeight: 600, marginBottom: 4 }}>⚠️ Missing scores</div>
                  {finalizeMissing.map(m => (
                    <div key={m.name} style={{ fontSize: 10, color: K.t2 }}>
                      <span style={{ fontWeight: 600 }}>{m.name}</span>: holes {m.holes.join(", ")}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ height: 4 }} />

              {/* Mini scorecards per player */}
              {groupPlayers.map(p => {
                const tp = tPlayers.find(t => t.player_id === p.id);
                const hi = parseFloat(tp?.handicap_index) || 0;
                const tee = getPlayerTee(round, p.id, course);
                const ch = calcCH(hi, tee?.slope || course.slope, tee?.rating || course.rating, tee?.par || course.par);
                const scores = holeData[`${p.id}_${round}`] || {};
                let gross = 0, net = 0, frontGross = 0, backGross = 0, frontNet = 0, backNet = 0;
                const sorted = holeHcps.map((h, i) => ({ idx: i, hcp: h })).sort((a, b) => a.hcp - b.hcp);
                const strokeMap = {};
                let rem = Math.abs(ch);
                for (let pass = 0; pass < 3 && rem > 0; pass++) {
                  for (const h of sorted) { if (rem <= 0) break; strokeMap[h.idx] = (strokeMap[h.idx] || 0) + 1; rem--; }
                }
                for (let h = 0; h < 18; h++) {
                  if (scores[h]) {
                    const g = scores[h]; const st = strokeMap[h] || 0;
                    gross += g; net += g - st;
                    if (h < 9) { frontGross += g; frontNet += g - st; } else { backGross += g; backNet += g - st; }
                  }
                }
                const parTotal = holePars.reduce((a, b) => a + b, 0);
                const cellBorder = `1px solid ${K.bdr}50`;
                const renderHalf = (startH, endH, subtotal) => (
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${endH - startH}, 1fr) 28px`, borderTop: cellBorder }}>
                    {/* Hole numbers row */}
                    {Array.from({ length: endH - startH }, (_, i) => startH + i).map(h => (
                      <div key={`n${h}`} style={{ textAlign: "center", fontSize: 7, fontWeight: 600, color: K.t3, padding: "2px 0", borderRight: cellBorder, borderBottom: cellBorder }}>
                        {h + 1}
                      </div>
                    ))}
                    <div style={{ textAlign: "center", fontSize: 7, fontWeight: 600, color: K.t3, padding: "2px 0", borderBottom: cellBorder }}>{startH === 0 ? "Out" : "In"}</div>
                    {/* Score row */}
                    {Array.from({ length: endH - startH }, (_, i) => startH + i).map(h => {
                      const s = scores[h];
                      const d = s ? s - holePars[h] : null;
                      return (
                        <div key={`s${h}`} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", borderRight: cellBorder, height: 26 }}>
                          {s && d != null && d !== 0 && (
                            <>
                              <div style={{
                                position: "absolute",
                                width: 18, height: 18,
                                borderRadius: d < 0 ? "50%" : 3,
                                border: `1px solid rgba(180,180,180,0.3)`,
                              }} />
                              {(d <= -2 || d >= 2) && (
                                <div style={{
                                  position: "absolute",
                                  width: 13, height: 13,
                                  borderRadius: d < 0 ? "50%" : 2,
                                  border: `1px solid rgba(180,180,180,0.3)`,
                                }} />
                              )}
                            </>
                          )}
                          <span style={{ position: "relative", fontSize: 12, fontWeight: 700, color: s ? K.t1 : K.t3 + "40" }}>
                            {s || "—"}
                          </span>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: K.t2, height: 26 }}>{subtotal || "—"}</div>
                  </div>
                );
                return (
                  <div key={p.id} style={{ background: K.inp, borderRadius: 8, marginBottom: 8, overflow: "hidden", border: `1px solid ${K.bdr}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", borderBottom: cellBorder }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: K.t1 }}>{p.name}</span>
                      <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
                        <span style={{ color: K.t3 }}>Gross <strong style={{ color: K.t2 }}>{gross || "—"}</strong></span>
                        <span style={{ color: K.t3 }}>Net <strong style={{ color: net && (net - parTotal) < 0 ? "#ef4444" : K.t1 }}>{net || "—"}</strong></span>
                      </div>
                    </div>
                    {renderHalf(0, 9, frontGross)}
                    {renderHalf(9, 18, backGross)}
                  </div>
                );
              })}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={() => setShowFinalize(false)} style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, background: K.inp, border: `1px solid ${K.bdr}`,
                  color: K.t2, fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>✏️ Edit Scores</button>
                <button onClick={() => { const gk = `${round}_${group.slice().sort().join(",")}`; onFinalizeRound(gk); setShowFinalize(false); notify("Group finalized! 🏆"); onNavigate("leaderboard"); }} style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, background: finalizeMissing.length > 0 ? K.warn : K.acc, border: "none",
                  color: K.bg, fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>{finalizeMissing.length > 0 ? "Finalize Anyway" : "✓ Confirm & Finalize"}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Advancing toast - fixed at bottom, outside animated container */}
      {allScored && currentHole < 17 && navSource === "auto" && !editingCompleted && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: K.acc, color: K.bg, padding: "12px 48px", borderRadius: 12,
          fontSize: 13, fontWeight: 700, zIndex: 1000, whiteSpace: "nowrap", minWidth: 280, textAlign: "center",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          animation: "toastUp 0.3s ease",
        }}>
          ✓ Hole {currentHole + 1} saved — advancing...
        </div>
      )}
    </div>
  );
}

// ── GROUP SETUP ──
function GroupSetup({ user, players, onStart, presetGroup }) {
  const [selected, setSelected] = useState(presetGroup || [user.id]);

  const toggle = (id) => {
    if (id === user.id) return;
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 4 ? [...prev, id] : prev);
  };

  return (
    <div>
      {presetGroup && (
        <button onClick={() => onStart(presetGroup)} style={{
          width: "100%", padding: "14px 0", borderRadius: 14, marginBottom: 12,
          background: `linear-gradient(135deg, ${K.acc}, ${K.accDim})`,
          color: K.bg, border: "none", fontSize: 16, fontWeight: 800, cursor: "pointer",
          boxShadow: `0 4px 20px ${K.accGlow}`,
        }}>
          Start Round — {presetGroup.length} Players ⛳
        </button>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 18, fontWeight: 800 }}>Group Setup</span>
          <span style={{ fontSize: 12, color: K.t3, marginLeft: 8 }}>{selected.length} player{selected.length !== 1 ? "s" : ""}</span>
        </div>
        {selected.length >= 2 && (
          <button onClick={() => onStart(selected)} style={{
            padding: "8px 20px", borderRadius: 10,
            background: `linear-gradient(135deg, ${K.acc}, ${K.accDim})`,
            color: K.bg, border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer",
            boxShadow: `0 2px 12px ${K.accGlow}`,
          }}>Done ⛳</button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {players.map(p => {
          const isSelf = p.id === user.id;
          const isSelected = selected.includes(p.id);
          return (
            <button key={p.id} onClick={() => toggle(p.id)} style={{
              background: isSelected ? K.accGlow : K.card,
              border: `1.5px solid ${isSelected ? K.acc : K.bdr}`,
              borderRadius: 10, padding: "10px 14px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              cursor: isSelf ? "default" : "pointer", color: K.t1,
              opacity: !isSelected && selected.length >= 4 ? 0.4 : 1,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: isSelected ? K.acc : K.inp,
                  border: `1.5px solid ${isSelected ? K.acc : K.bdr}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: isSelected ? K.bg : K.t3, fontSize: 12, fontWeight: 800,
                }}>{isSelected ? "✓" : ""}</div>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}{isSelf ? " (you)" : ""}</span>
              </div>
              <span style={{ fontSize: 10, color: K.t3 }}>HI: {p.handicap_index}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SkinsCtpView({ players, round, tRounds, courses, holeData, ctpData, onSetCtp, user, teeData, getPlayerTee }) {
  const [tab, setTab] = useState("skins");
  const tr = tRounds.find(t => t.round_number === round);
  const course = tr ? courses.find(c => c.id === tr.course_id) : null;

  if (!course) return (
    <div>
      <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 22, margin: "0 0 14px", fontWeight: 800 }}>Skins & CTP</h2>
      <div style={{ background: K.card, borderRadius: 14, border: `1px dashed ${K.warn}40`, padding: 32, textAlign: "center", color: K.warn }}>No course set for Round {round}</div>
    </div>
  );

  const holePars = course.hole_pars || [];
  const holeHcps = course.hole_handicaps || [];

  // No-carryover GROSS skins across all rounds: each hole = 1 skin, ties = no skin
  const calcAllSkins = () => {
    const allResults = [];
    for (let r = 1; r <= 4; r++) {
      const tr = tRounds.find(t => t.round_number === r);
      if (!tr) continue;
      const rCourse = courses.find(c => c.id === tr.course_id);
      if (!rCourse) continue;
      for (let hole = 0; hole < 18; hole++) {
        const scores = [];
        players.forEach(p => {
          const s = holeData[`${p.id}_${r}`]?.[hole];
          if (s) scores.push({ playerId: p.id, name: p.name, gross: s });
        });
        if (scores.length < 2) { allResults.push({ round: r, hole: hole + 1, winner: null }); continue; }
        const minGross = Math.min(...scores.map(s => s.gross));
        const winners = scores.filter(s => s.gross === minGross);
        allResults.push(winners.length === 1
          ? { round: r, hole: hole + 1, winner: winners[0].name, winnerId: winners[0].playerId, gross: minGross }
          : { round: r, hole: hole + 1, winner: null, tied: true }
        );
      }
    }
    return allResults;
  };

  const allSkinResults = calcAllSkins();
  const skinTotals = {};
  allSkinResults.filter(s => s.winner).forEach(s => { skinTotals[s.winner] = (skinTotals[s.winner] || 0) + 1; });
  const totalSkinsWon = Object.values(skinTotals).reduce((a, b) => a + b, 0);
  // Filter for current round view
  const roundSkinResults = allSkinResults.filter(s => s.round === round);
  const par3s = holePars.map((p, i) => p === 3 ? i + 1 : null).filter(Boolean);
  const roundCtps = ctpData[round] || {};

  return (
    <div>
      <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 22, margin: "0 0 14px", fontWeight: 800 }}>Skins & CTP</h2>
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {[["skins","💰 Skins"],["ctp","🎯 Closest to Pin"]].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: tab === k ? 700 : 500, background: tab === k ? K.acc : K.card, color: tab === k ? K.bg : K.t2, border: `1px solid ${tab === k ? K.acc : K.bdr}`, cursor: "pointer" }}>{l}</button>
        ))}
      </div>

      {tab === "skins" && (
        <div>
          {/* Tournament skins leaderboard */}
          {Object.keys(skinTotals).length > 0 && (
            <div style={{ background: K.card, borderRadius: 12, border: `1px solid ${K.bdr}`, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: K.t3, textTransform: "uppercase" }}>Tournament Skins</div>
                <span style={{ fontSize: 10, color: K.t3 }}>{totalSkinsWon} of {allSkinResults.length} holes won</span>
              </div>
              {Object.entries(skinTotals).sort((a,b) => b[1]-a[1]).map(([name, count]) => (
                <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${K.bdr}10` }}>
                  <span style={{ fontWeight: 600 }}>{name}</span>
                  <span style={{ color: K.acc, fontWeight: 800 }}>{count} skin{count !== 1 ? "s" : ""}</span>
                </div>
              ))}
            </div>
          )}
          {/* Skins won this round */}
          {(() => {
            const won = roundSkinResults.filter(r => r.winner);
            const tied = roundSkinResults.filter(r => r.tied).length;
            return (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: K.t3, textTransform: "uppercase" }}>Round {round} Skins</div>
                  <span style={{ fontSize: 10, color: K.t3 }}>{won.length} won · {tied} tied</span>
                </div>
                {won.length > 0 ? (
                  <div style={{ background: K.card, borderRadius: 12, border: `1px solid ${K.bdr}`, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", padding: "10px 14px", fontSize: 10, fontWeight: 600, color: K.t3, textTransform: "uppercase", borderBottom: `1px solid ${K.bdr}` }}>
                      <span>Hole</span><span>Winner</span><span style={{textAlign:"right"}}>Score</span>
                    </div>
                    {won.map(r => (
                      <div key={r.hole} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", padding: "9px 14px", borderBottom: `1px solid ${K.bdr}10`, alignItems: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{r.hole}</span>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{r.winner}</span>
                        <span style={{ fontWeight: 700, fontSize: 13, color: K.acc, minWidth: 28, textAlign: "right" }}>{r.gross}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ background: K.card, borderRadius: 12, border: `1px solid ${K.bdr}`, padding: 20, textAlign: "center", color: K.t3, fontSize: 12 }}>No skins won this round</div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {tab === "ctp" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {par3s.length === 0 ? <div style={{ background: K.card, borderRadius: 12, padding: 32, textAlign: "center", color: K.t3 }}>No par 3s</div> :
          par3s.map(hole => {
            const winnerId = roundCtps[hole];
            const winner = winnerId ? players.find(p => p.id === winnerId) : null;
            return (
              <div key={hole} style={{ background: K.card, borderRadius: 12, border: `1px solid ${K.bdr}`, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div><span style={{ fontSize: 15, fontWeight: 700 }}>Hole {hole}</span><span style={{ fontSize: 12, color: K.t3, marginLeft: 8 }}>Par 3</span></div>
                  {winner ? <span style={{ fontSize: 14, fontWeight: 700, color: K.acc }}>🎯 {winner.name}</span> : <span style={{ fontSize: 12, color: K.t3 }}>No winner yet</span>}
                </div>
                {user.isDirector && !winner && (
                  <select onChange={e => { if (e.target.value) onSetCtp(round, hole, e.target.value); }} style={{ width: "100%", padding: "8px 12px", background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: 8, color: K.t1, fontSize: 13, marginTop: 10 }}>
                    <option value="">Select CTP winner...</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── GROUPS ──
function GroupsView({ players, round, tRounds, courses, pairingsData, teeTimesData, teeData, getPlayerTee, user }) {
  const tr = tRounds.find(t => t.round_number === round);
  const course = tr ? courses.find(c => c.id === tr.course_id) : null;
  const groups = (pairingsData || {})[round] || [];
  const roundTeeTimes = (teeTimesData || {})[round] || [];

  const getTeeColor = (p) => {
    if (!course) return "#e8e8e8";
    const tee = getPlayerTee(round, p.id, course);
    return tee?.color || "#e8e8e8";
  };
  const getTeeName = (p) => {
    if (!course) return "";
    const tee = getPlayerTee(round, p.id, course);
    return tee?.name || "";
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 22, margin: 0, fontWeight: 800, display: "inline" }}>Round {round}</h2>
        {course && <span style={{ fontSize: 12, color: K.t3, marginLeft: 10 }}>{course.name} · Par {course.par}</span>}
      </div>
      {groups.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {groups.map((grp, gi) => {
            const teeTime = roundTeeTimes[gi];
            return (
            <div key={gi} style={{ background: K.card, borderRadius: 10, border: `1px solid ${K.bdr}`, overflow: "hidden" }}>
              <div style={{ padding: "6px 12px", fontSize: 11, fontWeight: 700, color: K.acc, borderBottom: `1px solid ${K.bdr}`, background: K.accGlow, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{teeTime || `Group ${gi + 1}`}</span>
                {teeTime && <span style={{ fontSize: 9, fontWeight: 500, color: K.t3 }}>Group {gi + 1}</span>}
              </div>
              {grp.map((pid, pi) => {
                const p = players.find(pl => pl.id === pid);
                if (!p) return null;
                const ch = course ? (() => { const tee = getPlayerTee(round, pid, course); return calcCH(p.handicap_index, tee?.slope || course.slope, tee?.rating || course.rating, tee?.par || course.par); })() : 0;
                const teeName = getTeeName(p);
                const teeClr = getTeeColor(p);
                const isMe = pid === user.id;
                return (
                  <div key={pid} style={{ padding: "5px 12px", display: "grid", gridTemplateColumns: "5fr 2fr 3fr", alignItems: "center", borderBottom: pi < grp.length - 1 ? `1px solid ${K.bdr}10` : "none", background: isMe ? "#8b9ec215" : "transparent" }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: isMe ? "#d4a843" : K.t1 }}>{p.name}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 9, fontWeight: 600, color: isLightTee(teeClr) ? K.t3 : teeClr, justifyContent: "center" }}>
                      {teeName && <>
                        <TeeColorSwatch color={teeClr} name={teeName} size={6} />
                        {teeName}
                      </>}
                    </span>
                    <span style={{ color: K.t2, fontSize: 9, textAlign: "right" }}>{course ? `HI ${p.handicap_index} · CH ${ch}` : `HI ${p.handicap_index}`}</span>
                  </div>
                );
              })}
            </div>
          )})}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: K.t1, marginBottom: 6 }}>No Pairings Set</div>
          <div style={{ fontSize: 12, color: K.t3 }}>Pairings will appear here once the tournament director sets them up.</div>
        </div>
      )}
    </div>
  );
}

// ── ADMIN ──
// ── PAIRINGS EDITOR ──
function PairingsEditor({ activePlayers, numRounds, pairingsData, setPairings, tRounds, courses, teeTimesData, setTeeTimesData, finalizedRounds, teeData, getPlayerTee, editRound, setEditRound }) {
  const [groups, setGroups] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [selected, setSelected] = useState(null);

  const numGroups = Math.ceil(activePlayers.length / 4);

  // Parse time string to minutes since midnight
  const parseTime = (str) => {
    if (!str) return null;
    const match = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) return null;
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const ampm = (match[3] || "").toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return h * 60 + m;
  };

  // Format minutes since midnight to time string
  const fmtTime = (mins) => {
    if (mins == null) return "";
    let h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    const ampm = h >= 12 ? "PM" : "AM";
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
  };

  // Normalize raw input like "800", "8:00", "130" into "8:00 AM", "1:30 PM"
  const normalizeTime = (raw) => {
    if (!raw) return "";
    const stripped = raw.replace(/[^0-9:]/g, "");
    if (!stripped) return raw;
    let h, m;
    if (stripped.includes(":")) {
      const parts = stripped.split(":");
      h = parseInt(parts[0]);
      m = parseInt(parts[1]) || 0;
    } else if (stripped.length <= 2) {
      h = parseInt(stripped);
      m = 0;
    } else {
      // "800" → 8:00, "130" → 1:30, "1030" → 10:30
      const num = parseInt(stripped);
      h = Math.floor(num / 100);
      m = num % 100;
    }
    if (isNaN(h) || h < 0 || h > 23 || m < 0 || m > 59) return raw;
    // Smart AM/PM: 1-6 = PM (afternoon tee times), 7-12 = AM
    const ampm = (h >= 1 && h <= 6) ? "PM" : (h >= 7 && h <= 11) ? "AM" : h === 12 ? "PM" : "AM";
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayH}:${m.toString().padStart(2, "0")} ${ampm}`;
  };

  const updateTeeTime = (gi, value) => {
    const normalized = normalizeTime(value);
    const current = (teeTimesData[editRound] || []).slice();
    while (current.length < numGroups) current.push("");
    current[gi] = normalized;

    // Auto-propagate to subsequent groups
    const newMins = parseTime(normalized);
    if (newMins != null && gi < numGroups - 1) {
      let interval = 8;
      if (gi > 0) {
        const prevMins = parseTime(current[gi - 1]);
        if (prevMins != null) {
          interval = newMins - prevMins;
          if (interval <= 0) interval = 8;
        }
      }
      for (let i = gi + 1; i < numGroups; i++) {
        const baseMins = parseTime(current[i - 1]);
        if (baseMins != null) {
          current[i] = fmtTime(baseMins + interval);
        }
      }
    }

    setTeeTimesData(prev => ({ ...prev, [editRound]: current }));
  };

  const isFirstRender = useRef(true);

  useEffect(() => {
    isFirstRender.current = true;
    const existing = (pairingsData || {})[editRound];
    if (existing && existing.length > 0) {
      const padded = [...existing.map(g => [...g])];
      while (padded.length < numGroups) padded.push([]);
      setGroups(padded);
      const assigned = new Set(existing.flat());
      setUnassigned(activePlayers.filter(p => !assigned.has(p.id)).map(p => p.id));
    } else {
      setGroups(Array.from({ length: numGroups }, () => []));
      setUnassigned(activePlayers.map(p => p.id));
    }
    setSelected(null);
  }, [editRound, activePlayers.length]);

  // Auto-save whenever groups change (skip initial mount load)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const nonEmpty = groups.filter(g => g.length > 0);
    if (nonEmpty.length > 0 || (pairingsData || {})[editRound]) {
      setPairings(editRound, nonEmpty);
    }
  }, [groups]);

  const getName = (pid) => activePlayers.find(p => p.id === pid)?.name || pid;
  const getShortName = (pid) => { const n = getName(pid); const parts = n.split(" "); return parts.length > 1 ? parts[0] + " " + parts[1][0] : n; };
  const getHI = (pid) => activePlayers.find(p => p.id === pid)?.handicap_index || 0;

  const tapPlayer = (pid) => {
    setSelected(selected === pid ? null : pid);
  };

  const tapSlot = (gi) => {
    if (!selected) return;
    if (groups[gi].length >= 4) return;
    // Remove from any other group first
    const newGroups = groups.map(g => g.filter(id => id !== selected));
    newGroups[gi] = [...newGroups[gi], selected];
    setGroups(newGroups);
    setSelected(null);
  };

  const removeFromGroup = (gi, pid) => {
    setGroups(prev => prev.map((g, i) => i === gi ? g.filter(id => id !== pid) : g));
    setSelected(null);
  };

  const isAssigned = (pid) => groups.some(g => g.includes(pid));

  const tapGroupPlayer = (gi, pid) => {
    if (selected === pid) {
      setSelected(null);
    } else if (selected) {
      // Swap: put selected into this group, send this player back
      removeFromGroup(gi, pid);
      setTimeout(() => {
        setGroups(prev => {
          const ng = prev.map(g => g.filter(id => id !== selected));
          if (ng[gi].length < 4) ng[gi] = [...ng[gi], selected];
          return ng;
        });
        setSelected(null);
      }, 0);
    } else {
      setSelected(pid);
    }
  };

  const clearPairings = () => {
    setGroups(Array.from({ length: numGroups }, () => []));
    setSelected(null);
  };

  const shuffleAssign = () => {
    const shuffled = [...activePlayers.map(p => p.id)].sort(() => Math.random() - 0.5);
    const ng = Array.from({ length: numGroups }, () => []);
    shuffled.forEach((pid, i) => ng[i % numGroups].push(pid));
    setGroups(ng);
    setUnassigned([]);
    setSelected(null);
  };

  return (
    <div>
      {finalizedRounds[editRound] && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: K.bdr + "15", borderRadius: 8, marginBottom: 10, border: `1px solid ${K.bdr}30` }}>
          <span style={{ fontSize: 12 }}>🔒</span>
          <span style={{ fontSize: 11, color: K.t3, fontWeight: 600 }}>Round {editRound} is finalized — view only</span>
        </div>
      )}
      <div style={{ opacity: finalizedRounds[editRound] ? 0.6 : 1, pointerEvents: finalizedRounds[editRound] ? "none" : "auto" }}>
      {/* Player pool - 4 per row */}
          <div style={{
            background: K.card, borderRadius: 12, padding: 10, marginBottom: 12,
            border: `1px solid ${K.bdr}`,
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
              {activePlayers.map(p => {
                const pid = p.id;
                const isSel = selected === pid;
                const assigned = isAssigned(pid);
                const _tc = (() => { const _tr = tRounds.find(t => t.round_number === editRound); const _c = _tr ? courses.find(c => c.id === _tr.course_id) : null; if (!_c || !getPlayerTee) return null; const _t = getPlayerTee(editRound, pid, _c); if (!_t) return null; const _col = (_t.color||"").toLowerCase(); const _real = _col && _col !== "#ffffff" && _col !== "white" && _col !== "#000000" && _col !== "black" && _col !== "#fff"; return _real ? _t.color : TEE_PALETTE[(_c.tee_boxes||[]).findIndex(tb=>tb.name===_t.name) % TEE_PALETTE.length] || null; })();
                return (
                  <button key={pid} onClick={() => tapPlayer(pid)} style={{
                    padding: "6px 4px", borderRadius: 6, cursor: "pointer", textAlign: "center",
                    background: isSel ? K.acc + "20" : "#162238",
                    border: `1.5px solid ${isSel ? K.acc : K.bdr}`,
                    color: isSel ? K.acc : K.t1,
                    opacity: assigned && !isSel ? 0.3 : 1,
                    transition: "opacity 0.2s",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                      {_tc && <span style={{ width: 7, height: 7, borderRadius: "50%", background: _tc, flexShrink: 0, display: "inline-block", boxShadow: "0 0 0 1px rgba(255,255,255,0.25)" }} />}
                      {getShortName(pid)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

      {/* Groups */}
      {groups.map((grp, gi) => {
        const canDrop = selected && grp.length < 4 && !grp.includes(selected);
        const teeTime = ((teeTimesData[editRound] || [])[gi]) || "";
        return (
          <div key={gi} onClick={() => { if (canDrop) tapSlot(gi); }} style={{
            background: K.card, borderRadius: 12, marginBottom: 8, padding: 10,
            border: `1.5px solid ${canDrop ? K.acc : K.bdr}`,
            cursor: canDrop ? "pointer" : "default",
            transition: "border-color 0.15s",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: grp.length > 0 ? 6 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: K.acc }}>Group {gi + 1} <span style={{ fontWeight: 400, color: K.t3, fontSize: 9 }}>({grp.length}/4)</span></span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Tee time"
                  value={teeTime}
                  onClick={e => e.stopPropagation()}
                  onChange={e => {
                    const current = (teeTimesData[editRound] || []).slice();
                    while (current.length < numGroups) current.push("");
                    current[gi] = e.target.value;
                    setTeeTimesData(prev => ({ ...prev, [editRound]: current }));
                  }}
                  onBlur={e => { updateTeeTime(gi, e.target.value); }}
                  onKeyDown={e => { if (e.key === "Enter") { e.target.blur(); } }}
                  style={{
                    width: 74, padding: "2px 4px", borderRadius: 5,
                    border: `1px solid ${teeTime ? K.acc + "40" : "#fbbf24"}`,
                    background: teeTime ? K.acc + "08" : "#fbbf2410",
                    color: teeTime ? K.acc : "#fbbf24",
                    fontSize: 9, fontWeight: 600, textAlign: "center",
                  }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {canDrop && <span style={{ fontSize: 9, color: K.acc, fontWeight: 600 }}>Tap to add {getShortName(selected)}</span>}
                {grp.length > 0 && (
                  <span onClick={e => { e.stopPropagation(); setGroups(prev => prev.map((g, i) => i === gi ? [] : g)); setSelected(null); }} style={{ fontSize: 8, color: K.danger, cursor: "pointer", border: `1px solid ${K.danger}40`, borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>Clear</span>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
              {grp.map(pid => {
                const isSel = selected === pid;
                const _tc2 = (() => { const _tr = tRounds.find(t => t.round_number === editRound); const _c = _tr ? courses.find(c => c.id === _tr.course_id) : null; if (!_c || !getPlayerTee) return null; const _t = getPlayerTee(editRound, pid, _c); if (!_t) return null; const _col = (_t.color||"").toLowerCase(); const _real = _col && _col !== "#ffffff" && _col !== "white" && _col !== "#000000" && _col !== "black" && _col !== "#fff"; return _real ? _t.color : TEE_PALETTE[(_c.tee_boxes||[]).findIndex(tb=>tb.name===_t.name) % TEE_PALETTE.length] || null; })();
                return (
                  <button key={pid} onClick={e => { e.stopPropagation(); tapGroupPlayer(gi, pid); }} style={{
                    padding: "6px 4px", borderRadius: 6, textAlign: "center", cursor: "pointer", position: "relative",
                    background: isSel ? K.acc + "20" : "#162238",
                    border: `1.5px solid ${isSel ? K.acc : K.bdr}`,
                    color: K.t1,
                  }}>
                    <span onClick={e => { e.stopPropagation(); removeFromGroup(gi, pid); }} style={{
                      position: "absolute", top: 1, right: 3, background: "transparent", border: "none",
                      color: K.t3, fontSize: 9, cursor: "pointer", padding: 0, lineHeight: 1,
                    }}>✕</span>
                    <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                      {_tc2 && <span style={{ width: 7, height: 7, borderRadius: "50%", background: _tc2, flexShrink: 0, display: "inline-block", boxShadow: "0 0 0 1px rgba(255,255,255,0.25)" }} />}
                      {getShortName(pid)}
                    </div>
                  </button>
                );
              })}
              {Array.from({ length: 4 - grp.length }).map((_, si) => (
                <div key={`e${si}`} onClick={e => { e.stopPropagation(); if (selected) tapSlot(gi); }} style={{
                  borderRadius: 6, border: `1.5px dashed ${canDrop ? K.acc + "50" : K.bdr}`,
                  minHeight: 38, display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: canDrop ? "pointer" : "default",
                }}>
                  <span style={{ fontSize: 14, color: canDrop ? K.acc + "60" : K.t3 + "30", fontWeight: 300 }}>+</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

// ── TEE ASSIGNER ──
function TeeAssigner({ activePlayers, numRounds, tRounds, courses, teeData, setTeeBulk, finalizedRounds, editRound, setEditRound, onOpenCourseSettings, teesSaved, onTeesSave, teesModified, onTeesModify }) {

  const tr = tRounds.find(t => t.round_number === editRound);
  const course = tr ? courses.find(c => c.id === tr.course_id) : null;
  const tees = course?.tee_boxes || [];
  const assignments = (teeData || {})[editRound] || {};
  const [chDeltas, setChDeltas] = useState({});

  const assign = (pid, teeName) => {
    // Compute delta vs current CH
    const oldTeeObj = tees.find(t => t.name === (assignments[pid] || getDefaultTee(tees)?.name || tees[0]?.name));
    const newTeeObj = tees.find(t => t.name === teeName);
    const player = activePlayers.find(p => p.id === pid);
    if (oldTeeObj && newTeeObj && player) {
      const oldCH = calcCH(player.handicap_index, oldTeeObj.slope, oldTeeObj.rating, oldTeeObj.par);
      const newCH = calcCH(player.handicap_index, newTeeObj.slope, newTeeObj.rating, newTeeObj.par);
      const delta = newCH - oldCH;
      if (delta !== 0) {
        setChDeltas(prev => ({ ...prev, [pid]: delta }));
        setTimeout(() => setChDeltas(prev => { const n = {...prev}; delete n[pid]; return n; }), 2000);
      }
    }
    setTeeBulk(editRound, { ...assignments, [pid]: teeName });
    if (teesSaved && teesSaved[editRound]) onTeesModify && onTeesModify(editRound);
  };

  const setAll = (teeName) => {
    const bulk = {};
    activePlayers.forEach(p => { bulk[p.id] = teeName; });
    setTeeBulk(editRound, bulk);
    if (teesSaved && teesSaved[editRound]) onTeesModify && onTeesModify(editRound);
  };

  const isSaved = teesSaved && teesSaved[editRound];
  const isModified = teesModified && teesModified[editRound];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {finalizedRounds[editRound] && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: K.bdr + "15", borderRadius: 8, marginBottom: 10, border: `1px solid ${K.bdr}30` }}>
          <span style={{ fontSize: 12 }}>🔒</span>
          <span style={{ fontSize: 11, color: K.t3, fontWeight: 600 }}>Round {editRound} is finalized — view only</span>
        </div>
      )}
      {!finalizedRounds[editRound] && !course ? null : (
        <div style={{ opacity: finalizedRounds[editRound] ? 0.6 : 1, pointerEvents: finalizedRounds[editRound] ? "none" : "auto", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          {/* Quick-set all buttons */}
          {tees.length > 0 && !finalizedRounds[editRound] && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: K.t3, textTransform: "uppercase", marginBottom: 4 }}>Set all players to:</div>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {tees.map(tee => (
                  <button key={tee.name} onClick={() => setAll(tee.name)} style={{
                    flex: 1, minWidth: 60, padding: "8px 6px", borderRadius: 8, cursor: "pointer", textAlign: "center",
                    background: K.inp, border: `1px solid ${K.bdr}`, color: K.t1,
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  }}>
                    <TeeColorSwatch color={tee.color} name={tee.name} size={18} style={{ borderRadius: 4 }} />
                    <span style={{ fontSize: 10, fontWeight: 700 }}>{tee.name}</span>
                    <div style={{ fontSize: 8, color: K.t3, lineHeight: 1.2 }}>{tee.slope}/{tee.rating}{tee.yardage ? <><br/>{tee.yardage.toLocaleString()}</> : ""}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Save confirmation button */}
          {!finalizedRounds[editRound] && (
            <button onClick={() => (!isSaved || isModified) && onTeesSave && onTeesSave(editRound)} style={{
              width: "100%", padding: "10px 0", borderRadius: 10, marginBottom: 8,
              background: isModified ? "#f59e0b" : isSaved ? K.inp : K.acc,
              border: `1px solid ${isModified ? "#f59e0b40" : isSaved ? "#22c55e40" : "transparent"}`,
              color: isModified ? K.bg : isSaved ? "#22c55e" : K.bg,
              fontSize: 12, fontWeight: 700, cursor: isSaved && !isModified ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              transition: "all 0.2s",
            }}>
              {isModified ? "⚠ Tee Changes — Confirm Again" : isSaved ? "✓ Tee Selections Confirmed" : "Confirm Tee Selections"}
            </button>
          )}

          {/* Per-player tee assignment */}
          <div style={{ background: K.card, borderRadius: 10, border: `1px solid ${K.bdr}`, overflow: "hidden", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ padding: "6px 12px", fontSize: 10, fontWeight: 600, color: K.t3, textTransform: "uppercase", borderBottom: `1px solid ${K.bdr}`, flexShrink: 0 }}>
              {course.name} — Tee Assignments
            </div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            {activePlayers.map((p, i) => {
              const defaultTee = getDefaultTee(tees);
              const currentTee = assignments[p.id] || defaultTee?.name || tees[0]?.name || "";
              const teeObj = tees.find(t => t.name === currentTee);
              const ch = teeObj ? calcCH(p.handicap_index, teeObj.slope, teeObj.rating, teeObj.par) : 0;
              return (
                <div key={p.id} style={{
                  padding: "5px 12px", display: "flex", justifyContent: "space-between", alignItems: "center",
                  borderBottom: i < activePlayers.length - 1 ? `1px solid ${K.bdr}10` : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{p.name}</span>
                    <span style={{ fontSize: 9, color: K.t2, display: "flex", alignItems: "center", gap: 3 }}>
                      HI {p.handicap_index} · CH {ch}
                      {chDeltas[p.id] !== undefined && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: chDeltas[p.id] > 0 ? "#22c55e" : "#ef4444", display: "flex", alignItems: "center", gap: 1 }}>
                          {chDeltas[p.id] > 0 ? "▲" : "▼"}{Math.abs(chDeltas[p.id])}
                        </span>
                      )}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 2 }}>
                    {tees.map(tee => {
                      const isActive = currentTee === tee.name;
                      return (
                        <button key={tee.name} onClick={() => assign(p.id, tee.name)} style={{
                          width: 34, padding: "4px 3px 3px", borderRadius: 6, cursor: "pointer",
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                          background: isActive ? K.acc + "18" : K.inp,
                          border: isActive ? `1px solid ${K.acc}` : `1px solid ${K.bdr}`,
                        }}>
                          <TeeColorSwatch color={tee.color} name={tee.name} size={14} style={{ borderRadius: 3 }} />
                          <span style={{ fontSize: 7, fontWeight: 700, color: isActive ? K.acc : K.t3, lineHeight: 1 }}>{tee.name.split("/")[0].substring(0,5)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PasswordRow({ player, password, onSave, isLast, ac }) {
  const [editing, setEditing] = useState(false);
  const [pw, setPw] = useState(password);
  const [show, setShow] = useState(false);
  const c = ac || K.acc;

  const save = () => {
    if (pw.trim()) onSave(player.id, pw.trim());
    setEditing(false);
  };

  return (
    <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", borderBottom: !isLast ? `1px solid ${K.bdr}10` : "none" }}>
      <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{player.name}</span>
      {editing ? (
        <>
          <div style={{ width: 120, display: "flex", justifyContent: "center" }}>
            <input value={pw} onChange={e => setPw(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === "Enter") save(); }}
              style={{ width: 110, padding: "5px 8px", background: K.inp, border: `1px solid ${c}40`, borderRadius: 6, color: K.t1, fontSize: 12, textAlign: "center", fontWeight: 600 }} />
          </div>
          <div style={{ width: 40, display: "flex", justifyContent: "center" }}>
            <button onClick={save} style={{ padding: "4px 8px", background: c, color: K.bg, border: "none", borderRadius: 5, fontWeight: 700, cursor: "pointer", fontSize: 10 }}>✓</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ width: 120, display: "flex", justifyContent: "center", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 12, color: K.t2, fontWeight: 500, fontFamily: "monospace" }}>{show ? password : "••••••"}</span>
            <button onClick={() => setShow(!show)} style={{ background: "transparent", border: "none", color: K.t3, fontSize: 9, cursor: "pointer", padding: "0 2px" }}>{show ? "hide" : "show"}</button>
          </div>
          <div style={{ width: 40, display: "flex", justifyContent: "center" }}>
            <button onClick={() => { setEditing(true); setPw(password); }} style={{ background: "transparent", border: "none", color: K.t3, fontSize: 10, cursor: "pointer" }}>Edit</button>
          </div>
        </>
      )}
    </div>
  );
}

function PlayerRow({ player, onUpdateHI, onUpdateName, onRemove, onSavePassword, password, isLast, ac }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [hi, setHi] = useState(String(player.handicap_index));
  const [name, setName] = useState(player.name);
  const [pw, setPw] = useState(password);
  const [showPw, setShowPw] = useState(false);
  const c = ac || K.acc;

  const save = () => {
    if (name.trim() && name.trim() !== player.name) onUpdateName(player.id, name.trim());
    if (parseFloat(hi) !== player.handicap_index) onUpdateHI(player.id, parseFloat(hi));
    if (pw.trim() && onSavePassword) onSavePassword(player.id, pw.trim());
    setEditing(false);
  };

  if (confirming) {
    return (
      <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: !isLast ? `1px solid ${K.bdr}10` : "none", background: K.danger + "08" }}>
        <span style={{ fontSize: 12, color: K.danger, fontWeight: 600 }}>Remove {player.name}?</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setConfirming(false)} style={{ padding: "5px 12px", borderRadius: 6, background: K.card, border: `1px solid ${K.bdr}`, color: K.t2, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>No</button>
          <button onClick={() => onRemove(player.id)} style={{ padding: "5px 12px", borderRadius: 6, background: K.danger, border: "none", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Yes</button>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 4, borderBottom: !isLast ? `1px solid ${K.bdr}10` : "none", background: c + "06" }}>
        <button onClick={() => setConfirming(true)} style={{ background: "transparent", border: "none", color: K.danger, fontSize: 14, cursor: "pointer", padding: 0, lineHeight: 1, flexShrink: 0, marginRight: 4 }}>✕</button>
        <div style={{ flex: "0 0 36%", minWidth: 0 }}>
          <input value={name} onChange={e => setName(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", background: K.inp, border: `1px solid ${c}40`, borderRadius: 6, color: K.t1, fontSize: 13, fontWeight: 600 }} />
        </div>
        <div style={{ flex: "0 0 13%", display: "flex", justifyContent: "center" }}>
          <input value={hi} onChange={e => setHi(e.target.value)} type="number" step="0.1" style={{ width: "85%", padding: "6px 2px", background: K.inp, border: `1px solid ${c}40`, borderRadius: 6, color: K.t1, fontSize: 12, textAlign: "center" }} />
        </div>
        <div style={{ flex: "0 0 28%", display: "flex", justifyContent: "center" }}>
          <input value={pw} onChange={e => setPw(e.target.value)} placeholder="password" style={{ width: "95%", padding: "6px 6px", background: K.inp, border: `1px solid ${c}40`, borderRadius: 6, color: K.t1, fontSize: 12 }} />
        </div>
        <div style={{ flex: "0 0 13%", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={save} style={{ padding: "5px 10px", background: c, color: K.bg, border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer", fontSize: 10 }}>Save</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", borderBottom: !isLast ? `1px solid ${K.bdr}10` : "none" }}>
      <span style={{ flex: "0 0 40%", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name}</span>
      <span style={{ flex: "0 0 15%", textAlign: "center", fontSize: 12, color: K.t2 }}>{player.handicap_index}</span>
      <div style={{ flex: "0 0 30%", display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
        <span style={{ fontSize: 11, color: K.t2, fontFamily: "monospace" }}>{showPw ? (password || "wbc2026") : "••••••"}</span>
        <button onClick={() => setShowPw(!showPw)} style={{ background: "transparent", border: "none", color: K.t3, fontSize: 9, cursor: "pointer", padding: "0 1px" }}>{showPw ? "hide" : "show"}</button>
      </div>
      <div style={{ flex: "0 0 15%", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => { setEditing(true); setHi(String(player.handicap_index)); setName(player.name); setPw(password || "wbc2026"); }} style={{ padding: "3px 10px", borderRadius: 6, background: "transparent", border: `1px solid ${K.bdr}`, color: K.t3, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>Edit</button>
      </div>
    </div>
  );
}

function AdminView({ players, activePlayers, tournament, tPlayers, tRounds, courses, setCourseForRound, addCourse, addPlayerToTournament, updateHI, updateName, removePlayer, pairingsData, setPairings, teeData, setTeeBulk, teeTimesData, setTeeTimesData, passwords, setPasswords, holeData, finalizedRounds, onFinalizeRound, onUnfinalizeRound, notify, getPlayerTee, startFresh, externalSettingsOpen, externalSettingsTab, onExternalSettingsHandled, currentUser, teesSaved, onTeesSave, teesModified, setTeesModified }) {
  const [tab, setTab] = useState("tees");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState("players");
  // Apply external open requests (e.g. from scoring tab)
  useEffect(() => {
    if (externalSettingsOpen) {
      setSettingsOpen(true);
      if (externalSettingsTab) setSettingsTab(externalSettingsTab);
      if (onExternalSettingsHandled) onExternalSettingsHandled();
    }
  }, [externalSettingsOpen]);
  const [selectedRound, setSelectedRound] = useState(1);
  const [newName, setNewName] = useState("");
  const [newHI, setNewHI] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmCourse, setConfirmCourse] = useState(null);
  const [searching, setSearching] = useState(false);
  const [courseSearch, setCourseSearch] = useState("");
  const [courseStateFilter, setCourseStateFilter] = useState("MI");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [expandedCourse, setExpandedCourse] = useState(null);
  const [editingCourse, setEditingCourse] = useState(null); // { courseId, draft: {...} }
  const [manualCourse, setManualCourse] = useState(null); // null | draft object when manually adding
  const [coursePreview, setCoursePreview] = useState(null); // course to preview before confirming add
  const [localDbPrompt, setLocalDbPrompt] = useState(null); // { sbCourse, query } — prompt user to use local or fetch fresh
  const [confirmRound, setConfirmRound] = useState(null);
  const [editRound, setEditRound] = useState(() => { for (let r = 1; r <= 4; r++) { if (!finalizedRounds[r]) return r; } return 4; });
  // Keep editRound pointing at the active round when finalization state changes
  useEffect(() => {
    setEditRound(r => {
      if (!finalizedRounds[r]) return r;
      for (let i = 1; i <= 4; i++) { if (!finalizedRounds[i]) return i; }
      return 4;
    });
  }, [JSON.stringify(finalizedRounds)]);
  const [finalizeModal, setFinalizeModal] = useState(null); // { round, scores[], missing[] }

  // On mount, check if any round is ready to finalize and show popup
  const buildFinalizeModal = (r) => {
    const tr = tRounds.find(t => t.round_number === r);
    const course = tr ? courses.find(c => c.id === tr.course_id) : null;
    const scores = activePlayers.map(p => {
      const key = `${p.id}_${r}`;
      const s = holeData[key] || {};
      const tee = getPlayerTee(r, p.id, course);
      const slope = tee?.slope || course?.slope || 113;
      const rating = tee?.rating || course?.rating || 72;
      const par = tee?.par || course?.par || 72;
      const ch = calcCH(p.handicap_index, slope, rating, par);
      const holePars = course?.hole_pars || [];
      let gross = 0, netToPar = 0;
      for (let h = 0; h < 18; h++) {
        if (s[h] > 0) { gross += s[h]; netToPar += s[h] - (holePars[h] || 4); }
      }
      netToPar -= ch;
      return { id: p.id, name: p.name, gross, netToPar };
    }).sort((a, b) => a.netToPar - b.netToPar);
    const missing = activePlayers.filter(p => {
      const wdTp = tPlayers.find(tp => tp.player_id === p.id);
      if (wdTp?.status === "WD") return false; // WD players not flagged as missing
      const s = holeData[`${p.id}_${r}`] || {};
      for (let h = 0; h < 18; h++) { if (!(s[h] > 0)) return true; }
      return false;
    }).map(p => p.name);
    return { round: r, course, scores, missing };
  };

  useEffect(() => {
    for (let r = 1; r <= (tournament?.num_rounds || 4); r++) {
      if (finalizedRounds[r]) continue;
      // Check if all groups for this round have been finalized by scoring groups
      const roundGroups = (pairingsData || {})[r] || [];
      const allGroupsFinalized = roundGroups.length > 0 && roundGroups.every(grp => {
        const key = `${r}_${grp.slice().sort().join(",")}`;
        return finalizedRounds[key];
      });
      // Also check if all players have all 18 holes filled
      const allHolesDone = activePlayers.length > 0 && activePlayers.every(p => {
        const scores = holeData[`${p.id}_${r}`] || {};
        for (let h = 0; h < 18; h++) { if (!(scores[h] > 0)) return false; }
        return true;
      });
      if (allGroupsFinalized || allHolesDone) {
        setFinalizeModal(buildFinalizeModal(r));
        break;
      }
    }
  }, []);

  // Keep legacy mode/tab refs for any code that still uses them
  const mode = "round";
  const ac = K.acc;
  const acGlow = K.accGlow;

  // Search GolfCourseAPI - debounced
  const searchTimerRef = useRef(null);
  const doCourseSearch = (query, stateOverride) => {
    setCourseSearch(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim() || query.trim().length < 2) { setSearchResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      const stateFilter = stateOverride !== undefined ? stateOverride : courseStateFilter;
      try {
        const q = query.trim();
        const stateParam = stateFilter ? `&state=${encodeURIComponent(stateFilter)}` : "";
        let results = [];

        const STATE_NAMES = { AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming" };
        const STATE_ABBREVS = Object.fromEntries(Object.entries(STATE_NAMES).map(([k,v]) => [v.toUpperCase(), k]));
        const stateMatches = (courseState, filter) => {
          if (!filter || !courseState) return true;
          const cs = courseState.trim().toUpperCase();
          const f = filter.trim().toUpperCase();
          if (cs === f) return true; // exact match (MI === MI)
          if (STATE_NAMES[f] && cs === STATE_NAMES[f].toUpperCase()) return true; // MI → Michigan
          if (STATE_ABBREVS[cs] && STATE_ABBREVS[cs] === f) return true; // Michigan → MI
          return false;
        };

        const decodeHtml = (str) => str ? str.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'") : str;
        const hasRealSlope = (c) => (c.tee_boxes || []).some(tb => parseInt(tb.slope) !== 113) || (parseInt(c.slope) !== 113 && !!c.slope);

        const parseRapidAPI = (rawCourses, stateFilter) => rawCourses
          .filter(c => stateMatches(c.state, stateFilter))
          .map((c, ci) => {
            // This API: top-level courseRating/slopeRating, scorecard[].tees.teeBox1/teeBox2...
            const sc = Array.isArray(c.scorecard) ? c.scorecard : [];
            const hole_pars = sc.map(h => parseInt(h.Par) || 4);
            const hole_handicaps = sc.map(h => parseInt(h.Handicap) || 0);
            const par = hole_pars.reduce((a, b) => a + b, 0) || 72;
            // Collect all tee box keys across all holes
            const teeKeys = [...new Set(sc.flatMap(h => h.tees ? Object.keys(h.tees) : []))];
            const tees = teeKeys.length ? teeKeys.map((key, ti) => {
              const sample = sc.find(h => h.tees?.[key]);
              const color = sample?.tees?.[key]?.color || key;
              const yardage = sc.reduce((a, h) => a + (parseInt(h.tees?.[key]?.yards) || 0), 0);
              const hole_yards = sc.map(h => parseInt(h.tees?.[key]?.yards) || 0);
              return {
                name: color || key,
                color: resolveTeeColor({ name: color || key, color: color || "" }, ti),
                slope: parseInt(c.slopeRating) || 113,
                rating: parseFloat(c.courseRating) || 72.0,
                par, yardage, hole_yards,
              };
            }) : [{
              name: "Default",
              color: resolveTeeColor({ name: "Default", color: "" }, 0),
              slope: parseInt(c.slopeRating) || 113,
              rating: parseFloat(c.courseRating) || 72.0,
              par, yardage: 0, hole_yards: [],
            }];
            return {
              id: `rapid_${c._id || ci}`,
              name: decodeHtml(c.name) || "Unknown",
              city: c.city || "", state: c.state || "",
              par, slope: parseInt(c.slopeRating) || 113,
              rating: parseFloat(c.courseRating) || 72.0,
              hole_pars, hole_handicaps, tee_boxes: tees,
              _source: "RapidAPI",
            };
          });

        const parseGolfCourseAPI = (rawCourses) => {
          const arr = Array.isArray(rawCourses) ? rawCourses : (rawCourses.courses || []);
          return arr.map((c, ci) => {
            const teesObj = c.tees || {};
            const allTees = Array.isArray(teesObj.male) && teesObj.male.length ? teesObj.male : (teesObj.female || []);
            const tees = allTees.map((t, ti) => ({
              name: t.tee_name || "Default",
              color: resolveTeeColor({ name: t.tee_name || "", color: "" }, ti),
              rating: parseFloat(t.course_rating) || 72.0,
              slope: parseInt(t.slope_rating) || 113,
              par: parseInt(t.par_total) || 72,
              yardage: parseInt(t.total_yards) || 0,
              hole_yards: (t.holes || []).map(h => parseInt(h.yardage) || 0),
            }));
            const firstTee = allTees[0]; const holes = firstTee?.holes || [];
            return {
              id: `gc_${c.id || ci}`,
              name: decodeHtml([c.club_name, c.course_name].filter(Boolean).join(" – ") || c.name || "Unknown"),
              city: c.location?.city || c.city || "", state: c.location?.state || c.state || "",
              par: parseInt(firstTee?.par_total) || 72,
              slope: parseInt(firstTee?.slope_rating) || 113,
              rating: parseFloat(firstTee?.course_rating) || 72.0,
              hole_pars: holes.map(h => parseInt(h.par) || 4),
              hole_handicaps: holes.map(h => parseInt(h.handicap) || 0),
              tee_boxes: tees,
              _source: "GolfCourseAPI",
            };
          });
        };

        // 1. Supabase FIRST — local WBC history takes priority
        let sbCourseNames = new Set();
        try {
          const qEnc = encodeURIComponent(`*${q}*`);
          const rows = await sb.get("courses", `or=(name.ilike.${qEnc},city.ilike.${qEnc})&order=name&limit=40`);
          if (rows?.length) {
            const filtered = stateFilter ? rows.filter(r => stateMatches(r.state, stateFilter)) : rows;
            const ids = filtered.map(r => r.id).join(",");
            const tbRows = ids ? await sb.get("tee_boxes", `course_id=in.(${ids})`) : [];
            const sbCourses = filtered.map((c) => ({
              ...c, hole_pars: c.hole_pars || [], hole_handicaps: c.hole_handicaps || [],
              _source: "WBC History",
              tee_boxes: (tbRows || []).filter(t => t.course_id === c.id).map((t, ti) => {
                const tbSlope = parseInt(t.slope), courseSlope = parseInt(c.slope);
                const slope = (tbSlope === 113 && courseSlope && courseSlope !== 113) ? courseSlope : t.slope;
                return { ...t, slope, color: resolveTeeColor(t, ti) };
              }),
            }));
            for (const sbC of sbCourses) {
              results.push(sbC);
              sbCourseNames.add(sbC.name.toLowerCase());
            }
          }
        } catch(e) { console.log("[Supabase] failed:", e); }

        // 2. RapidAPI — only for courses NOT already in local DB
        let apiResults = [];
        try {
          const r = await fetch(`/api/courses2?search=${encodeURIComponent(q)}${stateParam}`);
          if (r.ok) {
            const data = await r.json();
            const raw = Array.isArray(data) ? data : (data.courses || data.data || []);
            apiResults = parseRapidAPI(raw, stateFilter).filter(c => !sbCourseNames.has(c.name.toLowerCase()));
            results = [...results, ...apiResults];
          }
        } catch(e) { console.log("[RapidAPI] failed:", e); }

        // 3. GolfCourseAPI — fill gaps not covered by Supabase or RapidAPI
        try {
          const r2 = await fetch(`/api/courses?search=${encodeURIComponent(q)}${stateParam}`);
          if (r2.ok) {
            const data2 = await r2.json();
            const gcParsed = parseGolfCourseAPI(data2);
            for (const gc of gcParsed) {
              if (!stateMatches(gc.state, stateFilter)) continue;
              const nameLower = gc.name.toLowerCase();
              if (sbCourseNames.has(nameLower)) continue; // already have local version
              const rapidMatch = results.find(r => r.name.toLowerCase() === nameLower);
              if (rapidMatch) {
                const rapidReal = hasRealSlope(rapidMatch), gcReal = hasRealSlope(gc);
                if (gcReal && !rapidReal) {
                  results = results.map(r => r.name.toLowerCase() === nameLower
                    ? { ...rapidMatch, tee_boxes: gc.tee_boxes, slope: gc.slope, rating: gc.rating } : r);
                }
              } else {
                results.push(gc);
              }
            }
          }
        } catch(e) { console.log("[GolfCourseAPI] failed:", e); }

        // 4. Flag courses where neither API had real data
        results = results.map(c => ({ ...c, _incompleteData: !hasRealSlope(c) }));

        setSearchResults(results);
      } catch (err) {
        console.log("Course search failed:", err);
        setSearchResults([]);
      }
      setSearchLoading(false);
    }, 400);
  };

  const addCourseToLibrary = (c) => {
    addCourse(c);
    setSearching(false);
  };
  const numRounds = tournament?.num_rounds || 4;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

      {/* Finalize round popup modal */}
      {finalizeModal && (
        <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto" }}>
          <div style={{ background: K.card, borderRadius: 16, border: `1px solid ${K.bdr}`, width: "100%", maxWidth: 420, overflow: "hidden", marginTop: "auto", marginBottom: "auto" }}>
            {/* Header */}
            <div style={{ background: "#fde04710", borderBottom: `1px solid #d4a84330`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>⚡</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#d4a843" }}>Round {finalizeModal.round} Complete</div>
                <div style={{ fontSize: 10, color: K.t3 }}>{finalizeModal.course?.name || "Review scores before finalizing"}</div>
              </div>
            </div>
            {/* Column headers */}
            <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 56px 56px", padding: "6px 16px", borderBottom: `1px solid ${K.bdr}`, background: K.inp }}>
              <span style={{ fontSize: 8, color: K.t3, textTransform: "uppercase" }}>#</span>
              <span style={{ fontSize: 8, color: K.t3, textTransform: "uppercase" }}>Player</span>
              <span style={{ fontSize: 8, color: K.t3, textTransform: "uppercase", textAlign: "center" }}>Net</span>
              <span style={{ fontSize: 8, color: K.t3, textTransform: "uppercase", textAlign: "center" }}>Gross</span>
            </div>
            {/* Net scores list */}
            <div style={{ padding: "8px 0" }}>
              {finalizeModal.scores.map((p, i) => {
                // Compute tied positions
                const tiedAbove = i > 0 && finalizeModal.scores[i-1].netToPar === p.netToPar;
                const tiedBelow = i < finalizeModal.scores.length - 1 && finalizeModal.scores[i+1].netToPar === p.netToPar;
                const isTied = tiedAbove || tiedBelow;
                let pos = i + 1;
                if (tiedAbove) { let j = i - 1; while (j >= 0 && finalizeModal.scores[j].netToPar === p.netToPar) j--; pos = j + 2; }
                const posLabel = isTied ? `T${pos}` : `${pos}`;
                return (
                  <div key={p.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr 56px 56px", alignItems: "center", padding: "7px 12px", margin: "3px 8px", borderRadius: 8, border: `1px solid ${K.bdr}`, background: K.card }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: pos === 1 && !tiedAbove ? K.acc : K.t3 }}>{posLabel}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: K.t1 }}>{p.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, textAlign: "center", color: p.netToPar < 0 ? "#ef4444" : p.netToPar > 0 ? K.t2 : K.t1 }}>
                      {p.netToPar === 0 ? "E" : p.netToPar > 0 ? `+${p.netToPar}` : p.netToPar}
                    </span>
                    <span style={{ fontSize: 10, textAlign: "center", color: K.t3 }}>{p.gross > 0 ? p.gross : "—"}</span>
                  </div>
                );
              })}
            </div>
            {/* Missing scores warning */}
            {finalizeModal.missing.length > 0 && (
              <div style={{ padding: "8px 16px", background: K.warn + "10", borderTop: `1px solid ${K.warn}20` }}>
                <span style={{ fontSize: 10, color: K.warn }}>⚠️ Missing scores: {finalizeModal.missing.join(", ")}</span>
              </div>
            )}
            {/* Actions */}
            <div style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${K.bdr}` }}>
              <button onClick={() => setFinalizeModal(null)} style={{
                flex: 1, padding: "10px 0", borderRadius: 10, background: K.inp, border: `1px solid ${K.bdr}`,
                color: K.t2, fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>Review Later</button>
              <button onClick={() => { onFinalizeRound(finalizeModal.round); if (finalizeModal.round < numRounds) { setEditRound(finalizeModal.round + 1); setTab("tees"); } setFinalizeModal(null); }} style={{
                flex: 1, padding: "10px 0", borderRadius: 10,
                background: finalizeModal.missing.length > 0 ? K.warn : K.acc,
                border: "none", color: K.bg, fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>{finalizeModal.missing.length > 0 ? "Finalize Anyway" : "✓ Finalize Round"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Round cards + gear */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10, alignItems: "center" }}>
        {Array.from({ length: numRounds }, (_, i) => i + 1).map(r => {
          const isFinal = finalizedRounds[r];
          const tr = tRounds.find(t => t.round_number === r);
          const course = tr ? courses.find(c => c.id === tr.course_id) : null;
          const roundGroups = (pairingsData || {})[r] || [];
          const allAssigned = roundGroups.length > 0 && roundGroups.flat().length === activePlayers.length;
          const roundTeeTimes = (teeTimesData[r] || []);
          const allTeeTimes = roundGroups.length > 0 && roundGroups.every((_, gi) => roundTeeTimes[gi] && roundTeeTimes[gi].trim() !== "");
          const allTees = activePlayers.length > 0 && activePlayers.every(p => ((teeData[r] || {})[p.id]));
          const isActive = editRound === r;
          const hasCourse = !!course;
          const allDone = hasCourse && allAssigned && allTeeTimes && allTees;
          const teesDone = hasCourse && teesSaved[r] && !teesModified[r] && allTees;
          const pairingsDone = hasCourse && allAssigned && allTeeTimes;
          return (
            <button key={r} onClick={() => { setEditRound(r); setTab("tees"); }} style={{
              flex: 1, padding: "7px 4px 6px", borderRadius: 10, cursor: "pointer",
              background: isActive ? acGlow : K.card,
              border: `${isActive ? "2px" : "1px"} solid ${isActive ? ac : isFinal ? K.bdr + "20" : K.bdr + "60"}`,
              color: isFinal ? K.t3 : isActive ? ac : K.t2,
              opacity: isFinal && !isActive ? 0.4 : 1,
              transition: "all 0.15s",
            }}>
              <div style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, marginBottom: 3 }}>
                {isFinal ? "🔒 " : ""}Rd {r}
              </div>
              {isFinal ? (
                <div style={{ fontSize: 8, color: K.t3 }}>Final</div>
              ) : (
                <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
                  {[["T", teesDone], ["P", pairingsDone]].map(([lbl, done]) => (
                    <div key={lbl} style={{
                      display: "flex", alignItems: "center", gap: 2,
                      fontSize: 7, fontWeight: 700,
                      color: done ? "#22c55e" : "#ef444480",
                    }}>
                      <div style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: done ? "#22c55e" : "transparent",
                        border: `1px solid ${done ? "#22c55e" : "#ef444460"}`,
                      }} />
                      {lbl}
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
        <button onClick={() => setSettingsOpen(true)} title="Tournament Settings" style={{
          width: 38, height: 38, borderRadius: 10, background: K.card, border: `1px solid ${K.bdr}`,
          color: K.t3, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>⚙️</button>
      </div>

      {/* Sub-tabs: Tees / Pairings for selected round */}
      {(() => {
        const _rg = (pairingsData || {})[editRound] || [];
        const _rt = (teeTimesData[editRound] || []);
        const _hasCourse = !!tRounds.find(t => t.round_number === editRound && courses.find(c => c.id === t.course_id));
        const _teeDone = _hasCourse && teesSaved[editRound] && !teesModified[editRound] && activePlayers.length > 0 && activePlayers.every(p => ((teeData[editRound] || {})[p.id]));
        const _groupsDone = _rg.length > 0 && _rg.flat().length === activePlayers.length;
        const _teeTimesDone = _rg.length > 0 && _rg.every((_, gi) => _rt[gi] && _rt[gi].trim() !== "");
        const _pairingsDone = _hasCourse && _groupsDone && _teeTimesDone;
        const _isFinal = finalizedRounds[editRound];
        const _finalizePending = Object.entries(pairingsData || {}).some(([rnd, groups]) =>
          groups.some(grp => {
            const gk = `${rnd}_${grp.slice().sort().join(",")}`;
            if (finalizedRounds[gk] || finalizedRounds[parseInt(rnd)]) return false;
            return grp.every(pid => {
              const pd = holeData[`${pid}_${rnd}`] || {};
              return Object.values(pd).filter(s => s > 0).length === 18;
            });
          })
        );
        const subDone = { tees: _teeDone, pairings: _pairingsDone, finalize: !_finalizePending };
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ position: "relative", display: "flex", flex: 1, background: K.card, borderRadius: 10, border: `1px solid ${K.bdr}`, padding: 3, gap: 0 }}>
              {/* Sliding pill */}
              <div style={{
                position: "absolute", top: 3, bottom: 3,
                left: tab === "tees" ? 3 : "calc(50% + 1.5px)",
                width: "calc(50% - 4.5px)",
                background: acGlow, borderRadius: 8,
                border: `1px solid ${ac}50`,
                transition: "left 0.2s ease",
                pointerEvents: "none",
              }} />
              {[["tees","Tees"],["pairings","Pairings"]].map(([k,l]) => {
                const isActive = tab === k;
                const isDone = !_isFinal && subDone[k];
                return (
                  <button key={k} onClick={() => setTab(k)} style={{
                    flex: 1, padding: "8px 6px", borderRadius: 8, fontSize: 12,
                    fontWeight: isActive ? 700 : 500,
                    background: "transparent",
                    color: isActive ? ac : K.t2,
                    border: "none", cursor: "pointer", position: "relative", zIndex: 1,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  }}>
                    <span>{l}</span>
                    {!_isFinal && <span style={{
                      width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                      background: isDone ? "#22c55e" : "transparent",
                      border: `1.5px solid ${isDone ? "#22c55e" : K.t3 + "60"}`,
                    }} />}
                  </button>
                );
              })}
            </div>
            {/* Finalize button — opens modal */}
            <button onClick={() => setShowFinalizeModal(true)} style={{
              padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700,
              background: _finalizePending ? ac : K.card,
              border: `1px solid ${_finalizePending ? ac : K.bdr}`,
              color: _finalizePending ? K.bg : K.t2,
              cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              {_finalizePending && <span style={{ width: 6, height: 6, borderRadius: "50%", background: K.bg, flexShrink: 0 }} />}
              Finalize
            </button>
          </div>
        );
      })()}

      {/* Warning banner for incomplete round setup */}
      {!finalizedRounds[editRound] && (() => {
        const _tr = tRounds.find(t => t.round_number === editRound);
        const _course = _tr ? courses.find(c => c.id === _tr.course_id) : null;
        const _rg = (pairingsData || {})[editRound] || [];
        const _rt = (teeTimesData[editRound] || []);
        const items = [];
        if (!_course) items.push({ text: "No course assigned", action: "Set course", onClick: () => { setSettingsOpen(true); setSettingsTab("course"); } });
        else {
          const teesSet = teesSaved[editRound] && !teesModified[editRound] && activePlayers.every(p => ((teeData[editRound] || {})[p.id]));
          const groupsDone = _rg.length > 0 && _rg.flat().length === activePlayers.length;
          const teeTimesDone = _rg.length > 0 && _rg.every((_, gi) => _rt[gi] && _rt[gi].trim() !== "");
          if (!teesSet) items.push({ text: "Tee assignments incomplete", action: "Go to Tees", onClick: () => setTab("tees") });
          if (!groupsDone) items.push({ text: "Pairings not set", action: "Go to Pairings", onClick: () => setTab("pairings") });
          if (!teeTimesDone) items.push({ text: "Tee times missing", action: "Go to Pairings", onClick: () => setTab("pairings") });
        }
        if (items.length === 0) return null;
        return (
          <div style={{ marginBottom: 12, background: "#fbbf2408", border: "1px solid #fbbf2425", borderRadius: 10, padding: "9px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 1 }}>Round {editRound} needs setup</div>
            {items.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#fbbf2460", flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: K.t2 }}>{item.text}</span>
                </div>
                {item.action && (
                  <button onClick={item.onClick} style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>{item.action} →</button>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Settings modal */}
      {settingsOpen && (
        <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, background: "#00000080", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setSettingsOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, height: "85vh", background: K.bg, borderRadius: "16px 16px 0 0", border: `1px solid ${K.bdr}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Modal header */}
            <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${K.bdr}` }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: K.t1 }}>Tournament Settings</span>
              <button onClick={() => setSettingsOpen(false)} style={{ background: "transparent", border: "none", color: K.t3, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
            {/* Settings sub-tabs */}
            <div style={{ display: "flex", gap: 4, padding: "10px 16px 0" }}>
              {[["players","Players"],["course","Courses"]].map(([k,l]) => {
                const isActive = settingsTab === k;
                return (
                  <button key={k} onClick={() => setSettingsTab(k)} style={{
                    flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: isActive ? 700 : 500,
                    background: isActive ? K.tourn + "20" : K.card,
                    color: isActive ? K.tourn : K.t2,
                    border: `1px solid ${isActive ? K.tourn + "40" : K.bdr}`,
                    cursor: "pointer",
                  }}>{l}</button>
                );
              })}
            </div>
            {/* Settings content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 24px" }}>
              {settingsTab === "players" && (
                <div>
                  <div style={{ background: K.card, borderRadius: 12, border: `1px solid ${K.bdr}`, overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", borderBottom: `1px solid ${K.bdr}` }}>
                      <span style={{ flex: "0 0 40%", fontSize: 10, fontWeight: 600, color: K.t3, textTransform: "uppercase" }}>Name</span>
                      <span style={{ flex: "0 0 15%", fontSize: 10, fontWeight: 600, color: K.t3, textTransform: "uppercase", textAlign: "center" }}>Idx</span>
                      <span style={{ flex: "0 0 30%", fontSize: 10, fontWeight: 600, color: K.t3, textTransform: "uppercase", textAlign: "center" }}>Password</span>
                      <div style={{ flex: "0 0 15%", textAlign: "right" }}>
                        <button onClick={() => setAdding(true)} style={{ padding: "3px 8px", borderRadius: 6, background: "transparent", border: `1px solid ${ac}50`, color: ac, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>+ Add</button>
                      </div>
                    </div>
                    {adding && (
                      <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", borderBottom: `1px solid ${K.bdr}10`, background: ac + "06" }}>
                        <div style={{ flex: "0 0 40%" }}>
                          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name" autoFocus style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", background: K.inp, border: `1px solid ${ac}40`, borderRadius: 6, color: K.t1, fontSize: 13, fontWeight: 600 }} />
                        </div>
                        <div style={{ flex: "0 0 15%", display: "flex", justifyContent: "center" }}>
                          <input value={newHI} onChange={e => setNewHI(e.target.value)} placeholder="0" type="number" step="0.1" style={{ width: "80%", padding: "6px 4px", background: K.inp, border: `1px solid ${ac}40`, borderRadius: 6, color: K.t1, fontSize: 12, textAlign: "center" }} />
                        </div>
                        <div style={{ flex: "0 0 30%" }} />
                        <div style={{ flex: "0 0 15%", display: "flex", justifyContent: "flex-end", gap: 4 }}>
                          <button onClick={() => { if (newName.trim()) { addPlayerToTournament(newName.trim(), parseFloat(newHI) || 0); setNewName(""); setNewHI(""); setAdding(false); } }} style={{ padding: "4px 8px", background: ac, color: K.bg, border: "none", borderRadius: 5, fontWeight: 700, cursor: "pointer", fontSize: 10 }}>✓</button>
                          <button onClick={() => { setAdding(false); setNewName(""); setNewHI(""); }} style={{ padding: "4px 6px", background: "transparent", border: "none", color: K.t3, fontSize: 12, cursor: "pointer" }}>✕</button>
                        </div>
                      </div>
                    )}
                    {[...activePlayers].sort((a,b) => a.name.localeCompare(b.name)).map((p, i) => <PlayerRow key={p.id} player={p} password={passwords[p.id] || "wbc2026"} onUpdateHI={updateHI} onUpdateName={updateName} onRemove={removePlayer} onSavePassword={(pid, pw) => setPasswords(prev => ({ ...prev, [pid]: pw }))} isLast={i === activePlayers.length - 1} ac={ac} />)}
                  </div>
                </div>
              )}

              {settingsTab === "course" && (
                <div>
                  <div style={{ background: K.card, borderRadius: 12, border: `1px solid ${K.bdr}`, overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${K.bdr}` }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: K.t3, textTransform: "uppercase" }}>Courses <span style={{ fontWeight: 400 }}>({courses.length})</span></span>
                      <button onClick={() => { setSearching(!searching); setCourseSearch(""); setSearchResults([]); }} style={{ padding: "3px 8px", borderRadius: 6, background: "transparent", border: `1px solid ${ac}50`, color: ac, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>{searching ? "Done" : "+ Add"}</button>
                    </div>
                    {courses.map((c, i) => {
                      const assignedRounds = Array.from({ length: numRounds }, (_, ri) => ri + 1).filter(r => { const tr = tRounds.find(t => t.round_number === r); return tr && tr.course_id === c.id; });
                      return (
                        <div key={c.id} style={{ borderBottom: i < courses.length - 1 || searching ? `1px solid ${K.bdr}10` : "none" }}>
                          <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                            <button onClick={() => setExpandedCourse(expandedCourse === c.id ? null : c.id)} style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", color: K.t1, padding: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                              <div style={{ fontSize: 10, color: K.t3 }}>{c.city}, {c.state} · Par {c.par} · Slope {c.slope}</div>
                            </button>
                            <div style={{ display: "flex", gap: 3 }}>
                              {Array.from({ length: numRounds }, (_, ri) => ri + 1).map(r => {
                                const isAssigned = assignedRounds.includes(r);
                                const tr = tRounds.find(t => t.round_number === r);
                                const trCourseId = tr?.course_id;
                                const otherCourse = trCourseId && trCourseId !== "null" && trCourseId !== "undefined" && String(trCourseId).trim() !== "" && trCourseId !== c.id && courses.find(x => x.id === trCourseId);
                                return (
                                  <button key={r} onClick={() => {
                                    if (isAssigned) { setCourseForRound(r, { id: null, name: "" }); }
                                    else if (otherCourse) { setConfirmCourse({ course: c, round: r }); }
                                    else { setCourseForRound(r, c); }
                                  }} style={{
                                    padding: "4px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, cursor: "pointer", minWidth: 26, textAlign: "center",
                                    background: isAssigned ? ac : "transparent",
                                    color: isAssigned ? K.bg : K.t3,
                                    border: `1px solid ${isAssigned ? ac : K.bdr}`,
                                  }}>R{r}</button>
                                );
                              })}
                            </div>
                            <button onClick={() => setConfirmCourse({ course: c, delete: true, assignedRounds })} style={{ background: "transparent", border: "none", color: K.t3, cursor: "pointer", fontSize: 14, padding: "2px 4px", lineHeight: 1 }} title="Remove course">✕</button>
                          </div>
                          {expandedCourse === c.id && (() => {
                            const isEditing = editingCourse?.courseId === c.id;
                            const d = isEditing ? editingCourse.draft : c;
                            const inpStyle = { background: K.inp, border: `1px solid ${ac}40`, borderRadius: 4, color: K.t1, fontSize: 9, textAlign: "center", width: "100%", padding: "2px 0", boxSizing: "border-box" };
                            const readStyle = { textAlign: "center", color: K.t1, fontWeight: 700, padding: "3px 0", fontSize: 9 };
                            const startEdit = () => setEditingCourse({ courseId: c.id, draft: { ...c, hole_pars: [...(c.hole_pars||Array(18).fill(4))], hole_handicaps: [...(c.hole_handicaps||Array(18).fill(0))], tee_boxes: (c.tee_boxes||[]).map(t=>({...t})) } });
                            const saveEdit = () => {
                              const updated = { ...editingCourse.draft };
                              addCourse(updated);
                              setEditingCourse(null);
                            };
                            return (
                              <div style={{ padding: "0 14px 12px", background: ac + "04" }}>
                                {/* Rating / Slope row */}
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, marginTop: 4 }}>
                                  {["rating","slope"].map(field => (
                                    <div key={field} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                      <span style={{ fontSize: 9, color: K.t3, textTransform: "capitalize" }}>{field}:</span>
                                      {isEditing
                                        ? <input value={d[field]||""} onChange={e => setEditingCourse(prev => ({ ...prev, draft: { ...prev.draft, [field]: e.target.value } }))} style={{ ...inpStyle, width: 44 }} />
                                        : <span style={{ fontSize: 9, color: K.t2, fontWeight: 700 }}>{d[field]}</span>}
                                    </div>
                                  ))}
                                  <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
                                    {!isEditing
                                      ? <button onClick={startEdit} style={{ padding: "3px 8px", borderRadius: 4, background: "transparent", border: `1px solid ${ac}60`, color: ac, fontSize: 9, fontWeight: 700, cursor: "pointer" }}>✏️ Edit</button>
                                      : <>
                                          <button onClick={saveEdit} style={{ padding: "3px 8px", borderRadius: 4, background: ac, border: "none", color: K.bg, fontSize: 9, fontWeight: 700, cursor: "pointer" }}>Save</button>
                                          <button onClick={() => setEditingCourse(null)} style={{ padding: "3px 8px", borderRadius: 4, background: "transparent", border: `1px solid ${K.bdr}`, color: K.t3, fontSize: 9, cursor: "pointer" }}>Cancel</button>
                                        </>}
                                    <button onClick={() => { setExpandedCourse(null); setEditingCourse(null); }} style={{ padding: "2px 6px", borderRadius: 4, background: "transparent", border: "none", color: K.t3, fontSize: 14, cursor: "pointer", lineHeight: 1 }} title="Collapse">✕</button>
                                  </div>
                                </div>
                                {/* Tee boxes */}
                                {(d.tee_boxes||[]).length > 0 && (
                                  <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 8, color: K.t3, fontWeight: 600, marginBottom: 3, textTransform: "uppercase" }}>Tee Boxes</div>
                                    {(d.tee_boxes||[]).map((tb, tbi) => (
                                      <div key={tbi} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3, fontSize: 9 }}>
                                        <TeeColorSwatch color={tb.color} name={tb.name} size={10} />
                                        <span style={{ color: K.t2, fontWeight: 600, width: 52 }}>{tb.name}</span>
                                        {["rating","slope","par"].map(f => (
                                          <div key={f} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                                            <span style={{ color: K.t3, fontSize: 8 }}>{f[0].toUpperCase()+f.slice(1)}:</span>
                                            {isEditing
                                              ? <input value={tb[f]||""} onChange={e => setEditingCourse(prev => { const tbs = prev.draft.tee_boxes.map((t,i) => i===tbi ? {...t,[f]:e.target.value} : t); return {...prev, draft:{...prev.draft,tee_boxes:tbs}}; })} style={{...inpStyle, width: f==="rating"?34:28}} />
                                              : <span style={{ color: K.t2 }}>{tb[f]}</span>}
                                          </div>
                                        ))}
                                        {isEditing && (
                                          <button onClick={() => setEditingCourse(prev => ({ ...prev, draft: { ...prev.draft, tee_boxes: prev.draft.tee_boxes.filter((_,i) => i !== tbi) } }))}
                                            style={{ marginLeft: "auto", background: "transparent", border: "none", color: K.t3, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "0 2px" }} title="Remove tee">✕</button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {/* Hole par / HCP grid */}
                                {[["Front", 0, 9], ["Back", 9, 9]].map(([label, start, count]) => {
                                  const pars = (d.hole_pars||[]).slice(start, start+count);
                                  const hcps = (d.hole_handicaps||[]).slice(start, start+count);
                                  return (
                                    <div key={label} style={{ marginBottom: 4 }}>
                                      <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: 8 }}>
                                        <div style={{ color: K.t3, fontWeight: 600, padding: "2px 0" }}>Hole</div>
                                        {Array.from({length:count},(_,i)=><div key={i} style={{ textAlign:"center", color:K.t2, fontWeight:700, padding:"2px 0" }}>{start+i+1}</div>)}
                                        <div />
                                      </div>
                                      <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: 8, background: K.inp, borderRadius: 3 }}>
                                        <div style={{ color: K.t3, fontWeight: 600, padding: "3px 2px" }}>Par</div>
                                        {Array.from({length:count},(_,i) => isEditing
                                          ? <input key={i} value={pars[i]??""} onChange={e => setEditingCourse(prev => { const hp=[...(prev.draft.hole_pars||[])]; hp[start+i]=parseInt(e.target.value)||0; return {...prev,draft:{...prev.draft,hole_pars:hp}}; })} style={inpStyle} />
                                          : <div key={i} style={readStyle}>{pars[i]}</div>)}
                                        <div style={{ textAlign:"center", color:ac, fontWeight:800, padding:"3px 0", fontSize:9 }}>{pars.reduce((a,b)=>a+(+b||0),0)}</div>
                                      </div>
                                      <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: 8 }}>
                                        <div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px" }}>HCP</div>
                                        {Array.from({length:count},(_,i) => isEditing
                                          ? <input key={i} value={hcps[i]??""} onChange={e => setEditingCourse(prev => { const hh=[...(prev.draft.hole_handicaps||[])]; hh[start+i]=parseInt(e.target.value)||0; return {...prev,draft:{...prev.draft,hole_handicaps:hh}}; })} style={{...inpStyle, color:K.t3}} />
                                          : <div key={i} style={{ textAlign:"center", color:K.t3, padding:"2px 0", fontSize:9 }}>{hcps[i]}</div>)}
                                        <div />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                    {searching && (
                      <div style={{ padding: 14, borderTop: `1px solid ${K.bdr}` }}>
                        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                          <select value={courseStateFilter} onChange={e => { setCourseStateFilter(e.target.value); if (courseSearch.trim().length >= 2) doCourseSearch(courseSearch, e.target.value); }} style={{ width: 70, padding: "8px 6px", background: K.inp, border: `1px solid ${ac}40`, borderRadius: 8, color: K.t1, fontSize: 12, flexShrink: 0 }}>
                            <option value="">All</option>
                            {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <input value={courseSearch} onChange={e => doCourseSearch(e.target.value)} placeholder="Search by name or city..." autoFocus style={{ flex: 1, padding: "8px 12px", background: K.inp, border: `1px solid ${ac}40`, borderRadius: 8, color: K.t1, fontSize: 13, boxSizing: "border-box" }} />
                        </div>
                        {searchLoading && <div style={{ textAlign: "center", padding: 12, color: K.t3, fontSize: 11 }}>Searching GolfCourseAPI...</div>}
                        {!searchLoading && courseSearch.trim().length >= 2 && searchResults.length === 0 && !manualCourse && (
                          <div style={{ textAlign: "center", padding: "10px 0" }}>
                            <div style={{ color: K.t3, fontSize: 11, marginBottom: 8 }}>No courses found</div>
                            <button onClick={() => setManualCourse({
                              id: `manual_${Date.now()}`,
                              name: courseSearch.trim(),
                              city: "", state: courseStateFilter || "",
                              par: 72, slope: 113, rating: 72.0,
                              hole_pars: Array(18).fill(4),
                              hole_handicaps: Array(18).fill(0).map((_,i)=>i+1),
                              tee_boxes: [
                                { name: "Black", color: "#222222", rating: 74.0, slope: 130, par: 72, yardage: 6800 },
                                { name: "Blue",  color: "#1a56db", rating: 72.0, slope: 120, par: 72, yardage: 6400 },
                                { name: "White", color: "#e5e7eb", rating: 70.0, slope: 113, par: 72, yardage: 6000 },
                                { name: "Red",   color: "#e02424", rating: 68.0, slope: 108, par: 72, yardage: 5400 },
                              ],
                            })} style={{ padding: "7px 16px", borderRadius: 8, background: "transparent", border: `1px solid ${ac}`, color: ac, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                              + Add Course Manually
                            </button>
                          </div>
                        )}
                        {!searchLoading && manualCourse && (() => {
                          const mc = manualCourse;
                          const setMc = fn => setManualCourse(prev => fn(prev));
                          const inpBase = { background: K.inp, border: `1px solid ${ac}40`, borderRadius: 6, color: K.t1, padding: "6px 8px", fontSize: 12, boxSizing: "border-box" };
                          const tinyInp = { background: K.inp, border: `1px solid ${ac}30`, borderRadius: 4, color: K.t1, fontSize: 9, textAlign: "center", width: "100%", padding: "2px 1px", boxSizing: "border-box" };
                          const label = (txt) => <div style={{ fontSize: 9, color: K.t3, fontWeight: 600, marginBottom: 2, textTransform: "uppercase" }}>{txt}</div>;
                          const canSave = mc.name.trim().length > 1;
                          return (
                            <div style={{ background: K.card, border: `1px solid ${ac}30`, borderRadius: 10, padding: 14, marginBottom: 8 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                <span style={{ fontSize: 12, fontWeight: 800, color: K.t1 }}>Manual Course Entry</span>
                                <button onClick={() => setManualCourse(null)} style={{ background: "transparent", border: "none", color: K.t3, fontSize: 16, cursor: "pointer", lineHeight: 1 }}>✕</button>
                              </div>

                              {/* Name / City / State */}
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 60px", gap: 6, marginBottom: 8 }}>
                                <div>
                                  {label("Course Name")}
                                  <input value={mc.name} onChange={e => setMc(p=>({...p,name:e.target.value}))} style={{...inpBase, width:"100%"}} placeholder="e.g. Treetops Resort" />
                                </div>
                                <div>
                                  {label("City")}
                                  <input value={mc.city} onChange={e => setMc(p=>({...p,city:e.target.value}))} style={{...inpBase, width:"100%"}} placeholder="e.g. Gaylord" />
                                </div>
                                <div>
                                  {label("State")}
                                  <select value={mc.state} onChange={e => setMc(p=>({...p,state:e.target.value}))} style={{...inpBase, width:"100%"}}>
                                    <option value="">—</option>
                                    {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s=><option key={s} value={s}>{s}</option>)}
                                  </select>
                                </div>
                              </div>

                              {/* Tee Boxes */}
                              <div style={{ marginBottom: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                                  {label("Tee Boxes")}
                                  <button onClick={() => setMc(p=>({...p, tee_boxes:[...p.tee_boxes, {name:"", color:"#888888", rating:72.0, slope:113, par:72, yardage:0}]}))}
                                    style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "transparent", border: `1px solid ${ac}60`, color: ac, cursor: "pointer", fontWeight: 700 }}>+ Tee</button>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "12px 70px 50px 44px 32px 32px 40px 20px", gap: 3, fontSize: 8, color: K.t3, fontWeight: 600, marginBottom: 2, paddingLeft: 2 }}>
                                  <div/>
                                  <div>Name</div><div>Color</div><div>Rating</div><div>Slope</div><div>Par</div><div>Yards</div><div/>
                                </div>
                                {mc.tee_boxes.map((tb, tbi) => (
                                  <div key={tbi} style={{ display: "grid", gridTemplateColumns: "12px 70px 50px 44px 32px 32px 40px 20px", gap: 3, marginBottom: 3, alignItems: "center" }}>
                                    <TeeColorSwatch color={tb.color} name={tb.name} size={10} />
                                    <input value={tb.name} onChange={e => setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],name:e.target.value}; return {...p,tee_boxes:t};})} style={{...tinyInp, textAlign:"left", padding:"2px 4px"}} placeholder="Name" />
                                    <div style={{ position:"relative", width:"100%", height:22, flexShrink:0 }}>
                                      <div style={{ position:"absolute", inset:0, borderRadius:3, background:tb.color||"#888", border:"1px solid #ffffff25", pointerEvents:"none" }} />
                                      <select value={Object.entries(TEE_COLOR_MAP).find(([,v])=>v===(tb.color||""))?.[0] || "black"}
                                        onChange={e => { const clr = TEE_COLOR_MAP[e.target.value] || tb.color || "#888888"; setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],color:clr}; return {...p,tee_boxes:t};}); }}
                                        style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0, cursor:"pointer", fontSize:12 }}>
                                        {[["Black","#2c2c2c"],["Blue","#2d8fd4"],["White","#e8e8e8"],["Gold","#d4a843"],["Red","#9b2335"],["Green","#2d8a4e"],["Silver","#a8b2bd"],["Yellow","#e6c619"],["Orange","#e67e22"],["Purple","#7b2d8b"],["Maroon","#6b1c2a"],["Teal","#1a8a7a"],["Platinum","#c0c0c0"]].map(([n,c])=><option key={n} value={n.toLowerCase()}>{n}</option>)}
                                      </select>
                                    </div>
                                    <input value={tb.rating} onChange={e => setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],rating:e.target.value}; return {...p,tee_boxes:t};})} style={tinyInp} />
                                    <input value={tb.slope} onChange={e => setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],slope:e.target.value}; return {...p,tee_boxes:t};})} style={tinyInp} />
                                    <input value={tb.par} onChange={e => setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],par:e.target.value}; return {...p,tee_boxes:t};})} style={tinyInp} />
                                    <input value={tb.yardage} onChange={e => setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],yardage:e.target.value}; return {...p,tee_boxes:t};})} style={tinyInp} />
                                    <button onClick={() => setMc(p=>({...p,tee_boxes:p.tee_boxes.filter((_,i)=>i!==tbi)}))} style={{ background:"transparent", border:"none", color:K.t3, fontSize:11, cursor:"pointer", padding:0, lineHeight:1 }}>✕</button>
                                  </div>
                                ))}
                              </div>

                              {/* Hole Pars & Handicaps */}
                              {[["Front 9", 0, 9], ["Back 9", 9, 9]].map(([label9, start, count]) => (
                                <div key={label9} style={{ marginBottom: 6 }}>
                                  <div style={{ fontSize: 9, color: K.t3, fontWeight: 600, marginBottom: 3, textTransform: "uppercase" }}>{label9}</div>
                                  <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: 8 }}>
                                    <div style={{ color: K.t3, fontWeight: 600, padding: "2px 0" }}>Hole</div>
                                    {Array.from({length:count},(_,i) => <div key={i} style={{ textAlign:"center", color:K.t2, fontWeight:700, padding:"2px 0" }}>{start+i+1}</div>)}
                                    <div />
                                  </div>
                                  <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: 8, background: K.inp, borderRadius: 3, marginBottom: 2 }}>
                                    <div style={{ color: K.t3, fontWeight: 600, padding: "3px 2px" }}>Par</div>
                                    {Array.from({length:count},(_,i) => (
                                      <input key={i} value={mc.hole_pars[start+i]??""} onChange={e => setMc(p=>{const hp=[...p.hole_pars]; hp[start+i]=e.target.value; return {...p,hole_pars:hp};})}
                                        style={{ background:"transparent", border:"none", color:K.t1, fontSize:9, fontWeight:700, textAlign:"center", width:"100%", padding:"3px 0" }} />
                                    ))}
                                    <div style={{ textAlign:"center", color:ac, fontWeight:800, padding:"3px 0", fontSize:9 }}>
                                      {mc.hole_pars.slice(start,start+count).reduce((a,b)=>a+(parseInt(b)||0),0)}
                                    </div>
                                  </div>
                                  <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: 8 }}>
                                    <div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px" }}>HCP</div>
                                    {Array.from({length:count},(_,i) => (
                                      <input key={i} value={mc.hole_handicaps[start+i]??""} onChange={e => setMc(p=>{const hh=[...p.hole_handicaps]; hh[start+i]=e.target.value; return {...p,hole_handicaps:hh};})}
                                        style={{ background:"transparent", border:"none", color:K.t3, fontSize:9, textAlign:"center", width:"100%", padding:"2px 0" }} />
                                    ))}
                                    <div />
                                  </div>
                                </div>
                              ))}

                              {/* Save button */}
                              <button onClick={() => {
                                const firstTee = mc.tee_boxes[0];
                                const course = {
                                  ...mc,
                                  par: parseInt(firstTee?.par) || 72,
                                  slope: parseInt(firstTee?.slope) || 113,
                                  rating: parseFloat(firstTee?.rating) || 72.0,
                                  hole_pars: mc.hole_pars.map(v=>parseInt(v)||4),
                                  hole_handicaps: mc.hole_handicaps.map(v=>parseInt(v)||0),
                                  tee_boxes: mc.tee_boxes.map(tb=>({...tb, rating:parseFloat(tb.rating)||72.0, slope:parseInt(tb.slope)||113, par:parseInt(tb.par)||72, yardage:parseInt(tb.yardage)||0})),
                                };
                                addCourseToLibrary(course);
                                setManualCourse(null);
                              }} disabled={!canSave} style={{ width:"100%", padding:"10px 0", borderRadius:8, background: canSave ? ac : K.bdr, border:"none", color: canSave ? K.bg : K.t3, fontSize:13, fontWeight:700, cursor: canSave ? "pointer" : "default", marginTop:4 }}>
                                ✓ Add Course
                              </button>
                            </div>
                          );
                        })()}
                        {!searchLoading && searchResults.filter(c => !courses.find(ex => ex.id === c.id)).map(c => (
                          <button key={c.id} onClick={() => {
                            const sbVer = c._sbVersion || (c.updated_at ? c : null);
                            const hasLocalData = !!(sbVer && (sbVer.updated_at || c.updated_at));
                            if (hasLocalData) {
                              // Course exists in local DB — prompt user to use local or fetch fresh
                              const localCourse = sbVer || c;
                              setLocalDbPrompt({ sbCourse: localCourse, apiCourse: c._apiVersion || null, fullCourse: c });
                            } else if (c._apiVersion) {
                              if (c._apiHasReal && !c._sbHasReal) {
                                const { _apiVersion, _sbHasReal, _apiHasReal, ...sbBase } = c;
                                setCoursePreview({ ...sbBase, ...c._apiVersion, _apiVersion: c._apiVersion, _apiHasReal: true, _sbHasReal: false });
                              } else {
                                setCoursePreview(c);
                              }
                            } else {
                              setCoursePreview(c);
                            }
                          }} style={{ display: "block", width: "100%", background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", textAlign: "left", color: K.t1, marginBottom: 6 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                                  {c._incompleteData && <span style={{ fontSize: 8, background: "#d4584520", border: "1px solid #d4584540", color: "#d45845", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>⚠ incomplete data</span>}
                                  {!c._incompleteData && (c.tee_boxes?.length || 0) < 2 && <span style={{ fontSize: 8, background: "#d4a84320", border: "1px solid #d4a84340", color: "#d4a843", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>⚠ 1 tee</span>}
                                  {c._source && c._source !== "WBC History" && <span style={{ fontSize: 8, background: `${ac}15`, border: `1px solid ${ac}30`, color: ac, borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>{c._source}</span>}
                                  {c.updated_at && (() => {
                                    const d = new Date(c.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                                    return (
                                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 8, background: "#2d8a4e20", border: "1px solid #2d8a4e40", color: "#2d8a4e", borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>
                                        <img src={TROPHY_SVG_URL} alt="" style={{ width: 9, height: 9, filter: "brightness(0) saturate(100%) invert(42%) sepia(73%) saturate(400%) hue-rotate(100deg) brightness(95%)" }} />
                                        {d}{c.updated_by && c.updated_by !== "Unknown" ? ` · ${c.updated_by}` : ""}
                                      </span>
                                    );
                                  })()}
                                </div>
                                <div style={{ fontSize: 10, color: K.t3 }}>{c.city}{c.state ? `, ${c.state}` : ""}{c.par ? ` · Par ${c.par}` : ""}{(() => { const realTbSlope = (c.tee_boxes || []).find(t => parseInt(t.slope) !== 113)?.slope; const displaySlope = realTbSlope || (c.slope && parseInt(c.slope) !== 113 ? c.slope : null); return displaySlope ? ` · Slope ${displaySlope}` : ""; })()}</div>
                              </div>
                              <span style={{ color: ac, fontSize: 11, fontWeight: 700 }}>Preview →</span>
                            </div>
                          </button>
                        ))}
                        {/* Local DB prompt modal */}
                        {localDbPrompt && (() => {
                          const { sbCourse, apiCourse, fullCourse } = localDbPrompt;
                          const tbs = sbCourse.tee_boxes || [];
                          const updatedAt = sbCourse.updated_at;
                          const updatedBy = sbCourse.updated_by || "Unknown";
                          const formattedDate = updatedAt ? new Date(updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
                          const ScorecardPreview = ({ course }) => {
                            const hp = course.hole_pars || [];
                            const hh = course.hole_handicaps || [];
                            if (!hp.length) return <div style={{ fontSize: 10, color: K.t3, fontStyle: "italic", marginBottom: 8 }}>No hole data available</div>;
                            return (
                              <div style={{ marginBottom: 10 }}>
                                {[["Front", 0, 9], ["Back", 9, 9]].map(([lbl, start, count]) => {
                                  const pars = hp.slice(start, start + count);
                                  const hcps = hh.slice(start, start + count);
                                  const firstTee = (course.tee_boxes || [])[0];
                                  const yds = (firstTee?.hole_yards || []).slice(start, start + count);
                                  const hasYds = yds.some(y => y > 0);
                                  return (
                                    <div key={lbl} style={{ marginBottom: 4 }}>
                                      <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: 8 }}>
                                        <div style={{ color: K.t3, fontWeight: 600, padding: "2px 0" }}>Hole</div>
                                        {Array.from({length: count}, (_, i) => <div key={i} style={{ textAlign: "center", color: K.t2, fontWeight: 700, padding: "2px 0" }}>{start + i + 1}</div>)}
                                        <div style={{ textAlign: "center", color: K.t3, fontSize: 7, padding: "2px 0" }}>Tot</div>
                                      </div>
                                      <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: 8, background: K.inp, borderRadius: 3, marginBottom: 1 }}>
                                        <div style={{ color: K.t3, fontWeight: 600, padding: "3px 2px" }}>Par</div>
                                        {pars.map((p, i) => <div key={i} style={{ textAlign: "center", color: K.t1, fontWeight: 700, padding: "3px 0" }}>{p || "–"}</div>)}
                                        <div style={{ textAlign: "center", color: ac, fontWeight: 800, padding: "3px 0", fontSize: 9 }}>{pars.reduce((a, b) => a + (parseInt(b) || 0), 0)}</div>
                                      </div>
                                      {hcps.some(h => h > 0) && (
                                        <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: 8, marginBottom: 1 }}>
                                          <div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px" }}>HCP</div>
                                          {hcps.map((h, i) => <div key={i} style={{ textAlign: "center", color: K.t3, padding: "2px 0" }}>{h || "–"}</div>)}
                                          <div />
                                        </div>
                                      )}
                                      {hasYds && (
                                        <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: 8 }}>
                                          <div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px" }}>Yds</div>
                                          {yds.map((y, i) => <div key={i} style={{ textAlign: "center", color: K.t3, padding: "2px 0" }}>{y || "–"}</div>)}
                                          <div style={{ textAlign: "center", color: K.t3, padding: "2px 0" }}>{yds.reduce((a, b) => a + (parseInt(b) || 0), 0) || ""}</div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          };
                          return (
                            <CoursePreviewPortal>
                            <div style={{ position: "fixed", inset: 0, background: "#00000088", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                              <div style={{ background: K.card, borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto", padding: "20px 18px 28px" }}>
                                {/* Header */}
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                                  <div>
                                    <div style={{ fontWeight: 700, fontSize: 16, color: K.t1, marginBottom: 2 }}>{sbCourse.name}</div>
                                    <div style={{ fontSize: 11, color: K.t3 }}>{[sbCourse.city, sbCourse.state].filter(Boolean).join(", ")} · Par {sbCourse.par} · Slope {sbCourse.slope}</div>
                                  </div>
                                  <span onClick={() => setLocalDbPrompt(null)} style={{ fontSize: 20, color: K.t3, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>✕</span>
                                </div>

                                {/* Local DB notice */}
                                <div style={{ background: `${ac}12`, border: `1px solid ${ac}35`, borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
                                  <div style={{ fontWeight: 700, fontSize: 12, color: ac, marginBottom: 4 }}>📁 Course exists in local database</div>
                                  <div style={{ fontSize: 11, color: K.t2 }}>
                                    Last saved {formattedDate ? `on ${formattedDate}` : ""} by <strong>{updatedBy}</strong>
                                  </div>
                                  <div style={{ fontSize: 10, color: K.t3, marginTop: 2 }}>
                                    {tbs.length} tee {tbs.length === 1 ? "box" : "boxes"}{tbs.length > 0 ? ` — ${tbs.map(t => t.name).join(", ")}` : ""}
                                  </div>
                                </div>

                                {/* Tee boxes preview */}
                                {tbs.length > 0 && (
                                  <div style={{ marginBottom: 14 }}>
                                    <div style={{ fontSize: 9, color: K.t3, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Tee Boxes</div>
                                    <div style={{ display: "grid", gridTemplateColumns: "14px 1fr 44px 38px 30px 46px", gap: "3px 4px", fontSize: 8, color: K.t3, fontWeight: 600, marginBottom: 3, paddingLeft: 2 }}>
                                      <div/><div>Name</div><div style={{textAlign:"center"}}>Rating</div><div style={{textAlign:"center"}}>Slope</div><div style={{textAlign:"center"}}>Par</div><div style={{textAlign:"center"}}>Yards</div>
                                    </div>
                                    {tbs.map((tb, i) => (
                                      <div key={i} style={{ display: "grid", gridTemplateColumns: "14px 1fr 44px 38px 30px 46px", gap: "3px 4px", marginBottom: 3, alignItems: "center", fontSize: 11 }}>
                                        <TeeColorSwatch color={tb.color} name={tb.name} size={12} />
                                        <div style={{ color: K.t1, fontWeight: 600 }}>{tb.name}</div>
                                        <div style={{ textAlign: "center", color: K.t2 }}>{tb.rating}</div>
                                        <div style={{ textAlign: "center", color: K.t2 }}>{tb.slope}</div>
                                        <div style={{ textAlign: "center", color: K.t2 }}>{tb.par}</div>
                                        <div style={{ textAlign: "center", color: K.t2 }}>{tb.yardage ? tb.yardage.toLocaleString() : "–"}</div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Scorecard preview */}
                                <div style={{ marginBottom: 16 }}>
                                  <div style={{ fontSize: 9, color: K.t3, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Scorecard</div>
                                  <ScorecardPreview course={sbCourse} />
                                </div>

                                {/* Action buttons */}
                                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                                  <button onClick={() => {
                                    // Use local data — open preview with Supabase course
                                    setLocalDbPrompt(null);
                                    setCoursePreview({ ...sbCourse, _source: "WBC History" });
                                  }} style={{ flex: 1, padding: "12px 0", borderRadius: 10, background: ac, border: "none", color: "#0a1628", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                                    ✓ Use Local Data
                                  </button>
                                  <button onClick={async () => {
                                    // Fetch fresh from API — run search and open preview with API data
                                    setLocalDbPrompt(null);
                                    setSearchLoading(true);
                                    try {
                                      const q = sbCourse.name;
                                      const stateParam = sbCourse.state ? `&state=${encodeURIComponent(sbCourse.state)}` : "";
                                      const [r1, r2] = await Promise.allSettled([
                                        fetch(`/api/courses2?search=${encodeURIComponent(q)}${stateParam}`).then(r => r.json()),
                                        fetch(`/api/courses?search=${encodeURIComponent(q)}`).then(r => r.json()),
                                      ]);
                                      const rapidRaw = r1.status === "fulfilled" ? r1.value : [];
                                      const gcRaw = r2.status === "fulfilled" ? r2.value : [];
                                      // Simple: find best match by name
                                      const allApi = [...(Array.isArray(rapidRaw) ? rapidRaw : rapidRaw.courses || []), ...(Array.isArray(gcRaw) ? gcRaw : gcRaw.courses || [])];
                                      const match = allApi.find(c => (c.name || c.club_name || "").toLowerCase().includes(q.toLowerCase().split(" ")[0]));
                                      if (match) {
                                        setCoursePreview({ ...sbCourse, ...match, id: sbCourse.id, _source: match.source || "API", _freshFetch: true });
                                      } else {
                                        // No API match — fall back to local
                                        setCoursePreview({ ...sbCourse, _source: "WBC History" });
                                      }
                                    } catch(e) {
                                      setCoursePreview({ ...sbCourse, _source: "WBC History" });
                                    }
                                    setSearchLoading(false);
                                  }} style={{ flex: 1, padding: "12px 0", borderRadius: 10, background: "transparent", border: `1px solid ${K.bdr}`, color: K.t2, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                                    🔄 Fetch Fresh
                                  </button>
                                </div>
                              </div>
                            </div>
                            </CoursePreviewPortal>
                          );
                        })()}

                        {/* Course preview/confirm modal */}
                        {coursePreview && (() => {
                          const draft = coursePreview;
                          const setDraft = fn => setCoursePreview(prev => fn(prev));
                          const tbs = draft.tee_boxes || [];
                          const hasConflict = !!draft._apiVersion;
                          const ti = { background: K.bg, border: `1px solid ${ac}30`, borderRadius: 4, color: K.t1, fontSize: 9, textAlign: "center", width: "100%", padding: "3px 2px", boxSizing: "border-box" };
                          const tiL = { ...ti, textAlign: "left", padding: "3px 5px" };
                          return (
                            <CoursePreviewPortal>
                            <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.82)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                              <div style={{ background: K.card, borderRadius: 16, border: `1px solid ${ac}40`, width: "100%", maxWidth: 420, maxHeight: "calc(100vh - 48px)", overflowY: "auto", padding: 0 }}>

                                {/* Header */}
                                <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${K.bdr}`, position: "sticky", top: 0, background: K.card, zIndex: 1 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                    <div style={{ flex: 1, marginRight: 8 }}>
                                      <input value={draft.name} onChange={e => setDraft(p => ({...p, name: e.target.value}))}
                                        style={{ background: "transparent", border: "none", borderBottom: `1px solid ${ac}40`, color: K.t1, fontSize: 14, fontWeight: 800, width: "100%", padding: "2px 0" }} />
                                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                                        <input value={draft.city} onChange={e => setDraft(p => ({...p, city: e.target.value}))} placeholder="City"
                                          style={{ ...tiL, fontSize: 10, flex: 1 }} />
                                        <select value={draft.state} onChange={e => setDraft(p => ({...p, state: e.target.value}))}
                                          style={{ ...ti, fontSize: 10, width: 52 }}>
                                          <option value="">—</option>
                                          {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                      </div>
                                    </div>
                                    <button onClick={() => setCoursePreview(null)} style={{ background: "transparent", border: "none", color: K.t3, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
                                  </div>

                                  {/* Source conflict banner */}
                                  {hasConflict && (() => {
                                    const sbHasReal = draft._sbHasReal;
                                    const apiHasReal = draft._apiHasReal;
                                    const sbSlope = draft.tee_boxes?.find(t => parseInt(t.slope) !== 113)?.slope || draft.slope;
                                    const apiSlope = draft._apiVersion?.tee_boxes?.find(t => parseInt(t.slope) !== 113)?.slope || draft._apiVersion?.slope;
                                    const bothReal = sbHasReal && apiHasReal;
                                    const bannerColor = bothReal ? "#d4a843" : "#5b9bd5";
                                    const bannerMsg = bothReal
                                      ? "⚡ Both sources have real slope data — review each and pick the most accurate:"
                                      : "ℹ️ One source has real slope data — selecting the better one:";
                                    return (
                                      <div style={{ marginTop: 8, padding: "8px 10px", background: `${bannerColor}10`, border: `1px solid ${bannerColor}40`, borderRadius: 8 }}>
                                        <div style={{ fontSize: 9, color: bannerColor, fontWeight: 700, marginBottom: 6 }}>{bannerMsg}</div>
                                        <div style={{ display: "flex", gap: 6 }}>
                                          <button onClick={() => setDraft(p => { const {_apiVersion, _sbHasReal, _apiHasReal, ...sb} = p; return sb; })}
                                            style={{ flex: 1, padding: "6px 4px", borderRadius: 6, background: sbHasReal ? ac+"22" : "transparent", border: `1px solid ${sbHasReal ? ac : K.bdr}`, color: sbHasReal ? ac : K.t3, fontSize: 9, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                                            📦 WBC History
                                            <div style={{ fontSize: 8, fontWeight: 400, color: K.t3, marginTop: 2 }}>{draft.tee_boxes?.length || 0} tees · Slope {sbSlope || "?"}</div>
                                            {sbHasReal && <div style={{ fontSize: 7, color: ac, marginTop: 1 }}>✓ real data</div>}
                                            {!sbHasReal && <div style={{ fontSize: 7, color: "#d4584580", marginTop: 1 }}>placeholder</div>}
                                          </button>
                                          <button onClick={() => setDraft(p => { const api = p._apiVersion; return { ...p, par: api.par, slope: api.slope, rating: api.rating, hole_pars: api.hole_pars, hole_handicaps: api.hole_handicaps, tee_boxes: api.tee_boxes, _apiVersion: undefined, _sbHasReal: undefined, _apiHasReal: undefined }; })}
                                            style={{ flex: 1, padding: "6px 4px", borderRadius: 6, background: apiHasReal && !sbHasReal ? ac+"22" : "transparent", border: `1px solid ${apiHasReal ? ac : K.bdr}`, color: apiHasReal ? ac : K.t3, fontSize: 9, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                                            🌐 API (Fresh)
                                            <div style={{ fontSize: 8, fontWeight: 400, color: K.t3, marginTop: 2 }}>{draft._apiVersion?.tee_boxes?.length || 0} tees · Slope {apiSlope || "?"}</div>
                                            {apiHasReal && <div style={{ fontSize: 7, color: ac, marginTop: 1 }}>✓ real data</div>}
                                            {!apiHasReal && <div style={{ fontSize: 7, color: "#d4584580", marginTop: 1 }}>placeholder</div>}
                                          </button>
                                        </div>
                                        <div style={{ fontSize: 8, color: K.t3, marginTop: 5, fontStyle: "italic" }}>You can edit any field after selecting a source</div>
                                      </div>
                                    );
                                  })()}
                                  {!hasConflict && draft._incompleteData && (
                                    <div style={{ marginTop: 8, padding: "8px 10px", background: "#d4584510", border: "1px solid #d4584540", borderRadius: 8, fontSize: 9, color: "#d45845" }}>
                                      ⚠ Neither API has complete data for this course. Slope, rating, and tee boxes may be missing or inaccurate — please enter them manually before adding.
                                    </div>
                                  )}
                                  {!hasConflict && !draft._incompleteData && (draft.tee_boxes?.length || 0) < 2 && (
                                    <div style={{ marginTop: 8, padding: "8px 10px", background: "#d4a84310", border: "1px solid #d4a84340", borderRadius: 8, fontSize: 9, color: "#d4a843" }}>
                                      ⚠ Only {draft.tee_boxes?.length || 0} tee box found — most courses have multiple tees. Tap <strong>+ Tee</strong> above to add Black, Blue, White, Red etc. with their ratings and slopes.
                                    </div>
                                  )}
                                  {!hasConflict && !draft._incompleteData && (draft.tee_boxes?.length || 0) >= 2 && (
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                                      <div style={{ fontSize: 9, color: K.t3, fontStyle: "italic" }}>Review and edit before adding — tap any field to change it</div>
                                      {draft._source && <span style={{ fontSize: 8, background: `${ac}15`, border: `1px solid ${ac}30`, color: ac, borderRadius: 4, padding: "1px 6px", fontWeight: 600, flexShrink: 0 }}>{draft._source}</span>}
                                      {!draft._source && <span style={{ fontSize: 8, background: "#88888815", border: "1px solid #88888830", color: K.t3, borderRadius: 4, padding: "1px 6px", fontWeight: 600, flexShrink: 0 }}>WBC History</span>}
                                    </div>
                                  )}
                                </div>

                                <div style={{ padding: "12px 16px" }}>

                                  {/* Tee Boxes — fully editable */}
                                  <div style={{ marginBottom: 14 }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                      <div style={{ fontSize: 9, color: K.t3, fontWeight: 700, textTransform: "uppercase" }}>Tee Boxes</div>
                                      <button onClick={() => setDraft(p => ({ ...p, tee_boxes: [...(p.tee_boxes||[]), { name: "", color: "#888888", rating: 72.0, slope: 113, par: 72, yardage: 0 }] }))}
                                        style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: "transparent", border: `1px solid ${ac}60`, color: ac, cursor: "pointer", fontWeight: 700 }}>+ Tee</button>
                                    </div>
                                    {tbs.length === 0 && <div style={{ fontSize: 10, color: K.warn, marginBottom: 8, fontStyle: "italic" }}>⚠ No tees from API — add them manually below</div>}
                                    {/* Column headers */}
                                    <div style={{ display: "grid", gridTemplateColumns: "18px 1fr 44px 38px 30px 46px 18px", gap: "3px 4px", fontSize: 8, color: K.t3, fontWeight: 600, marginBottom: 3, paddingLeft: 2 }}>
                                      <div/><div>Name</div><div style={{textAlign:"center"}}>Rating</div><div style={{textAlign:"center"}}>Slope</div><div style={{textAlign:"center"}}>Par</div><div style={{textAlign:"center"}}>Yards</div><div/>
                                    </div>
                                    {tbs.map((tb, i) => (
                                      <div key={i} style={{ display: "grid", gridTemplateColumns: "18px 1fr 44px 38px 30px 46px 18px", gap: "3px 4px", marginBottom: 4, alignItems: "center" }}>
                                        <div style={{ position:"relative", width:18, height:18, flexShrink:0 }}>
                                          <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}><TeeColorSwatch color={tb.color} name={tb.name} size={18} style={{ borderRadius:3, width:"100%", height:"100%" }} /></div>
                                          <select value={Object.entries(TEE_COLOR_MAP).find(([,v])=>v===(tb.color||""))?.[0] || "black"}
                                            onChange={e => { const clr = TEE_COLOR_MAP[e.target.value] || "#888888"; setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],color:clr,name:t[i].name||e.target.value.charAt(0).toUpperCase()+e.target.value.slice(1)}; return {...p,tee_boxes:t}; }); }}
                                            style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0, cursor:"pointer", fontSize:12 }}>
                                            {[["Black","#2c2c2c"],["Blue","#2d8fd4"],["White","#e8e8e8"],["Gold","#d4a843"],["Red","#9b2335"],["Green","#2d8a4e"],["Silver","#a8b2bd"],["Yellow","#e6c619"],["Orange","#e67e22"],["Purple","#7b2d8b"],["Maroon","#6b1c2a"],["Teal","#1a8a7a"],["Platinum","#c0c0c0"]].map(([n,c])=><option key={n} value={n.toLowerCase()}>{n}</option>)}
                                          </select>
                                        </div>
                                        <input value={tb.name} onChange={e => setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],name:e.target.value}; return {...p,tee_boxes:t}; })}
                                          style={tiL} placeholder="Name" />
                                        <input value={tb.rating} onChange={e => setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],rating:e.target.value}; return {...p,tee_boxes:t}; })}
                                          style={ti} />
                                        <input value={tb.slope} onChange={e => setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],slope:e.target.value}; return {...p,tee_boxes:t}; })}
                                          style={ti} />
                                        <input value={tb.par} onChange={e => setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],par:e.target.value}; return {...p,tee_boxes:t}; })}
                                          style={ti} />
                                        <input value={tb.yardage} onChange={e => setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],yardage:e.target.value}; return {...p,tee_boxes:t}; })}
                                          style={ti} />
                                        <button onClick={() => setDraft(p => ({...p, tee_boxes: p.tee_boxes.filter((_,j) => j!==i)}))}
                                          style={{ background: "transparent", border: "none", color: K.t3, fontSize: 11, cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Scorecard — editable pars & handicaps */}
                                  <div style={{ marginBottom: 14 }}>
                                    <div style={{ fontSize: 9, color: K.t3, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Scorecard</div>
                                    {(draft.hole_pars?.length === 0) && <div style={{ fontSize: 10, color: K.warn, marginBottom: 6, fontStyle: "italic" }}>⚠ No hole data from API — enter pars below</div>}
                                    {[["Front", 0, 9], ["Back", 9, 9]].map(([lbl, start, count]) => {
                                      const pars = (draft.hole_pars || Array(18).fill(4)).slice(start, start+count);
                                      const hcps = (draft.hole_handicaps || Array(18).fill(0)).slice(start, start+count);
                                      return (
                                        <div key={lbl} style={{ marginBottom: 6 }}>
                                          <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: 8 }}>
                                            <div style={{ color: K.t3, fontWeight: 600, padding: "2px 0" }}>Hole</div>
                                            {Array.from({length:count},(_,i) => <div key={i} style={{ textAlign:"center", color:K.t2, fontWeight:700, padding:"2px 0" }}>{start+i+1}</div>)}
                                            <div style={{ textAlign:"center", color:K.t3, fontSize:7, padding:"2px 0" }}>Tot</div>
                                          </div>
                                          <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: 8, background: K.inp, borderRadius: 3, marginBottom: 1 }}>
                                            <div style={{ color: K.t3, fontWeight: 600, padding: "3px 2px" }}>Par</div>
                                            {Array.from({length:count},(_,i) => (
                                              <input key={i} value={pars[i] ?? ""} onChange={e => setDraft(p => { const hp=[...(p.hole_pars||Array(18).fill(4))]; hp[start+i]=e.target.value; return {...p,hole_pars:hp}; })}
                                                style={{ background:"transparent", border:"none", color:K.t1, fontSize:9, fontWeight:700, textAlign:"center", width:"100%", padding:"3px 0" }} />
                                            ))}
                                            <div style={{ textAlign:"center", color:ac, fontWeight:800, padding:"3px 0", fontSize:9 }}>{pars.reduce((a,b)=>a+(parseInt(b)||0),0)}</div>
                                          </div>
                                          <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: 8 }}>
                                            <div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px" }}>HCP</div>
                                            {Array.from({length:count},(_,i) => (
                                              <input key={i} value={hcps[i] ?? ""} onChange={e => setDraft(p => { const hh=[...(p.hole_handicaps||Array(18).fill(0))]; hh[start+i]=e.target.value; return {...p,hole_handicaps:hh}; })}
                                                style={{ background:"transparent", border:"none", color:K.t3, fontSize:9, textAlign:"center", width:"100%", padding:"2px 0" }} />
                                            ))}
                                            <div />
                                          </div>
                                          {(() => {
                                            const activeTee = (draft.tee_boxes || [])[0];
                                            const hy = activeTee?.hole_yards || [];
                                            if (!hy.some(y => y > 0)) return null;
                                            const yds = hy.slice(start, start+count);
                                            const tot = yds.reduce((a,b) => a+(parseInt(b)||0), 0);
                                            return (
                                              <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: 8 }}>
                                                <div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px" }}>Yds</div>
                                                {yds.map((y, i) => <div key={i} style={{ textAlign: "center", color: K.t3, padding: "2px 0", fontSize: 8 }}>{y || "–"}</div>)}
                                                <div style={{ textAlign: "center", color: K.t3, padding: "2px 0", fontSize: 8 }}>{tot || ""}</div>
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Action buttons */}
                                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                    <button onClick={() => setCoursePreview(null)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: "transparent", border: `1px solid ${K.bdr}`, color: K.t3, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                                    <button onClick={() => {
                                      const firstTee = draft.tee_boxes?.[0];
                                      const finalCourse = {
                                        ...draft,
                                        par: parseInt(firstTee?.par) || draft.par || 72,
                                        slope: parseInt(firstTee?.slope) || draft.slope || 113,
                                        rating: parseFloat(firstTee?.rating) || draft.rating || 72.0,
                                        hole_pars: (draft.hole_pars||[]).map(v => parseInt(v)||4),
                                        hole_handicaps: (draft.hole_handicaps||[]).map(v => parseInt(v)||0),
                                        tee_boxes: (draft.tee_boxes||[]).map(tb => ({...tb, rating:parseFloat(tb.rating)||72.0, slope:parseInt(tb.slope)||113, par:parseInt(tb.par)||72, yardage:parseInt(tb.yardage)||0})),
                                      };
                                      addCourseToLibrary(finalCourse);
                                      setSearchResults(prev => prev.filter(r => r.id !== draft.id));
                                      setCoursePreview(null);
                                    }} style={{ flex: 2, padding: "10px 0", borderRadius: 8, background: ac, border: "none", color: K.bg, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>✓ Add Course</button>
                                  </div>
                                </div>
                              </div>
                            </div>
                            </CoursePreviewPortal>
                          );
                        })()}
                        {!courseSearch.trim() && <div style={{ color: K.t3, fontSize: 10, textAlign: "center", padding: 4 }}>Type at least 2 characters to search</div>}
                        <div style={{ fontSize: 9, color: K.t3, textAlign: "center", marginTop: 6 }}>Powered by GolfCourseAPI.com · 35,000+ courses</div>
                      </div>
                    )}
                  </div>
                  {/* Done button when all rounds have courses assigned */}
                  {Array.from({ length: numRounds }, (_, ri) => ri + 1).every(r => tRounds.find(t => t.round_number === r && t.course_id)) && !searching && (
                    <button onClick={() => setSettingsOpen(false)} style={{
                      width: "100%", marginTop: 10, padding: "12px 0", borderRadius: 10,
                      background: ac, border: "none", color: K.bg,
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                    }}>✓ All Rounds Set — Done</button>
                  )}
                  {confirmCourse && confirmCourse.round && (
                    <div style={{ background: K.warn + "10", border: `1px solid ${K.warn}40`, borderRadius: 10, padding: 12, marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: K.warn, fontWeight: 600 }}>Move R{confirmCourse.round} to {confirmCourse.course.name}?</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setConfirmCourse(null)} style={{ padding: "5px 12px", borderRadius: 6, background: K.card, border: `1px solid ${K.bdr}`, color: K.t2, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>No</button>
                        <button onClick={() => { setCourseForRound(confirmCourse.round, confirmCourse.course); setConfirmCourse(null); }} style={{ padding: "5px 12px", borderRadius: 6, background: ac, border: "none", color: K.bg, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Yes</button>
                      </div>
                    </div>
                  )}
                  {confirmCourse && confirmCourse.delete && (
                    <div style={{ background: K.danger + "10", border: `1px solid ${K.danger}40`, borderRadius: 10, padding: 12, marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: K.danger, fontWeight: 600 }}>
                        Remove "{confirmCourse.course.name}"?{confirmCourse.assignedRounds.length > 0 ? ` (unassigns R${confirmCourse.assignedRounds.join(", R")})` : ""}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setConfirmCourse(null)} style={{ padding: "5px 12px", borderRadius: 6, background: K.card, border: `1px solid ${K.bdr}`, color: K.t2, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>No</button>
                        <button onClick={() => { confirmCourse.assignedRounds.forEach(r => setCourseForRound(r, { id: null, name: "" })); addCourse({ _delete: true, id: confirmCourse.course.id }); setConfirmCourse(null); }} style={{ padding: "5px 12px", borderRadius: 6, background: K.danger, border: "none", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Reset options */}
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${K.bdr}30`, display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={() => { if (confirm("Clear all scores, rounds, pairings and tee assignments? Player roster and handicaps will be preserved. This cannot be undone.")) { startFresh(); setSettingsOpen(false); } }} style={{
                  width: "100%", padding: "10px 0", borderRadius: 8,
                  background: K.danger + "15", border: `1px solid ${K.danger}60`,
                  color: K.danger, fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>🗑 Start Fresh — Clear All Data</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Round operation tabs */}
      {tab === "pairings" && (
        <PairingsEditor activePlayers={activePlayers} numRounds={numRounds} pairingsData={pairingsData} setPairings={setPairings} tRounds={tRounds} courses={courses} teeTimesData={teeTimesData} setTeeTimesData={async (updater) => {
              setTeeTimesData(prev => {
                const next = typeof updater === "function" ? updater(prev) : updater;
                // Fire-and-forget: update tee times on pairings rows in Supabase
                Object.keys(next).forEach(async rnd => {
                  const groups = pairingsData[rnd] || [];
                  groups.forEach(async (grp, gi) => {
                    const teeTime = (next[rnd] || [])[gi] || null;
                    grp.forEach(async pid => {
                      const row = { id: `pair_2026_r${rnd}_g${gi+1}_${pid}`, tournament_id: TOURNAMENT_ID, round_number: parseInt(rnd), group_number: gi+1, player_id: pid, tee_time: teeTime };
                      await sb.upsert("pairings", row, "id");
                    });
                  });
                });
                return next;
              });
            }} finalizedRounds={finalizedRounds} teeData={teeData} getPlayerTee={getPlayerTee} editRound={editRound} setEditRound={r => { setEditRound(r); setTab("tees"); }} />
      )}

      {tab === "tees" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <TeeAssigner activePlayers={activePlayers} numRounds={numRounds} tRounds={tRounds} courses={courses} teeData={teeData} setTeeBulk={setTeeBulk} finalizedRounds={finalizedRounds} editRound={editRound} setEditRound={r => { setEditRound(r); setTab("tees"); }} onOpenCourseSettings={() => { setSettingsOpen(true); setSettingsTab("course"); }} teesSaved={teesSaved} onTeesSave={onTeesSave} teesModified={teesModified} onTeesModify={r => setTeesModified(prev => ({ ...prev, [r]: true }))} />
        </div>
      )}

      {showFinalizeModal && (
        <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, background: "#00000090", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setShowFinalizeModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "80vh", background: K.bg, borderRadius: "16px 16px 0 0", border: `1px solid ${K.bdr}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${K.bdr}`, flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: K.t1 }}>Finalize Rounds</span>
              <button onClick={() => setShowFinalizeModal(false)} style={{ background: "transparent", border: "none", color: K.t3, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", padding: "12px 16px 32px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, color: K.t3, marginBottom: 2 }}>
              Finalize a group once all 18 holes are entered and scores are confirmed. Finalized scores are locked on the leaderboard.
            </div>
          {[1,2,3,4].map(rnd => {
            const rndGroups = (pairingsData || {})[rnd] || [];
            const tr = tRounds.find(t => t.round_number === rnd);
            const courseName = tr ? (courses.find(c => c.id === tr.course_id)?.name || "No course") : "No course";
            if (rndGroups.length === 0) return null;
            return (
              <div key={rnd}>
                <div style={{ fontSize: 10, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                  Round {rnd} · {courseName}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {rndGroups.map((grp, gi) => {
                    const groupKey = `${rnd}_${grp.slice().sort().join(",")}`;
                    const isFinalized = finalizedRounds[groupKey] || finalizedRounds[rnd];
                    const holesComplete = grp.every(pid => {
                      const pd = holeData[`${pid}_${rnd}`] || {};
                      return Object.keys(pd).length === 18 && Object.values(pd).every(s => s > 0);
                    });
                    const holesEntered = grp.reduce((total, pid) => {
                      const pd = holeData[`${pid}_${rnd}`] || {};
                      return Math.max(total, Object.values(pd).filter(s => s > 0).length);
                    }, 0);
                    const playerNames = grp.map(pid => {
                      const p = activePlayers.find(x => x.id === pid);
                      return p ? p.name.split(" ")[0] : pid;
                    }).join(", ");
                    return (
                      <div key={gi} style={{
                        background: isFinalized ? K.acc + "10" : K.card,
                        border: `1px solid ${isFinalized ? K.acc + "40" : K.bdr}`,
                        borderRadius: 10, padding: "10px 12px",
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: K.t1, marginBottom: 2 }}>
                            Group {gi + 1}
                            {isFinalized && <span style={{ marginLeft: 6, fontSize: 10, color: K.acc, fontWeight: 700 }}>✓ FINAL</span>}
                          </div>
                          <div style={{ fontSize: 11, color: K.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{playerNames}</div>
                          <div style={{ fontSize: 10, color: holesComplete ? "#22c55e" : "#fbbf24", marginTop: 3 }}>
                            {holesComplete ? "All 18 holes entered" : `${holesEntered}/18 holes entered`}
                          </div>
                        </div>
                        {isFinalized ? (
                          <button onClick={() => { onUnfinalizeRound(groupKey); notify("Round unfinalized"); }} style={{
                            padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                            background: "transparent", border: `1px solid ${K.bdr}`,
                            color: K.t3, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                          }}>↩ Unfinalize</button>
                        ) : (
                          <button
                            onClick={() => { if (!holesComplete) return; onFinalizeRound(groupKey); notify(`Group ${gi+1} Round ${rnd} finalized`); }}
                            disabled={!holesComplete}
                            style={{
                              padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                              background: holesComplete ? K.acc : K.card,
                              border: holesComplete ? "none" : `1px solid ${K.bdr}`,
                              color: holesComplete ? K.bg : K.t3,
                              cursor: holesComplete ? "pointer" : "not-allowed", whiteSpace: "nowrap", flexShrink: 0,
                              opacity: holesComplete ? 1 : 0.5,
                            }}>✓ Finalize</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
            </div>
          </div>
        </div>
      )}




    </div>
  );
}



// ── MAIN APP ──
export default function WBCApp() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("leaderboard");
  const [round, setRound] = useState(1);
  const [notif, setNotif] = useState(null);

  // Set favicon and page title
  useEffect(() => {
    // Set tab title
    document.title = "WBC 2026";
    // Set favicon to WBC trophy
    const FAVICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAALtUlEQVR4nO1ba2xcRxX+zpn72rU3u36QxHZaTF4tgbZJ2jxESVtRKBRaJNSWqsAP3g8BfxAgAQJBqcRDCImHUAW/kKgoBVRQSaGIQkJTQtOmbVrq0CYliZ04dvxY76737r1778zhx+46juPH2t61KugnrbS+ez1zzjfnzJxzZoawQvAyPQYEAUhAAAABAKp9QeVXiBAACibO8ErIRc1q2Et3CwhCzFqMqKpi9YPJgMhAGwsAgtxgU2RtXKPMAAFeujuGADBGXfBz0pvktpYsZVrznHRD8twIVB17LSR+6OrJUkJyxVUmV8xIGHkXtK9YA0CQG7RgBBBpiNgNI8BLd18oEZFQq5drveO6Z73dl3fw2rbVnG5p54RrQzFITbNwAURrIIph/NA3E8WsHhwbLj32r4L/+4M7JYwSM/trlEVYy23Ay/QYiFDqgzftc3dsSsEIlV86Xcj/+KE93q7L+9q++v4b9GgO0AaiNSQIBQKR6UNIAIQJipgSbtJqTSTtDV093vVXITx49KQZL3Ss+uIdL3Cm1SXFcfHBx2M8WnGvUvb0snRY8kTjpbvFS3cLmAwAeG/aslqtzrSJbdmt773+Wohw1Nd/STQwUha/pKUcGWgjYCYoZiilpj6sFBRVZIljkSDUUgp19NLAYDww0qs60yOpO2/YjUk/dLdvfKO9qadcIY5kSo4lYknsTe+Qqt6oS6WwtO/ISOlvz61f+9DXrfbvfuRJ8hxbomgNeY6q22eZCUZYQATP8Tp+8IlnyHMtPTRaGv/Kz3d3/DB5RPLFWWVailssmoC52JacH1ibe2zzwP618fD4WOvt1+2QUhmmUIREMUCLkI2JEMWwu9rbndetbedVLSg8sP8wiLap1Zk2ky0WAEBw4cqyFBLqJmBuM6v0p0fyZeeynozExp742i/605+/fczkJsuqp3Ot9Zp0p5SjivnXAyOGEi4HB184Qo5jG23Kue/9Zg2IhDzH1eOFiybFmXLWS0RdBNTjY+bsONE1m5IAEB4+tu3cXd8SANRx72f/Zfd0dkq5bACo+VupQMQYTrhcOtA3Ubx///W157QqmSVL2Xokl66+OKeS9VrDgpPgQsrXzDA+M5JQmZY0FGswGzAbAJCgHIFoKtyrG8ZAwpgAgBwrBJGxOtOjUMx6NNdR7XxeBesZuOWHm9VRiPtH1iDhtKjO9DCMYVKV1UEKQYA6Lb8GAggikNykPa0fVpd0jkkx8CXvt1WfLVv8eQmoa3kxVQKGJroRRL61oesMAIAqBJhcIQIzZFE2wCSxhslOTvd1ca7oDfXQ+AiAWmS4ILML6TAnAYtYWwnMGlpb8enRs+41m3wQpJrawIwWTJ3tVCAiUMRSCkVP+K0AAGMYADlX9HaER05mK51S3YTOp8usBCw2sCCqCBMeenHc27n5EggIupIL6JFcNQao0w1EAMUwxcA3E4UMAEhsbPaconXpmnXhE0fbK68tLrmaS6eGpJwihgEg2Pfcpaq7s1utzgxKbGwA0MPZVoliEKjOvkhIKUi+mJVJP40KuWJv39gncRxHfadeD6BmFcvGRY0sKaw0wiCS6OTwejM6MZJ467ZjtZ/0ULZNiiUNixlSx6wlRshS0Ofy4xIZmyyOAFDi7duj8jPHj0lsbFIcYwmJ3Gy6NazoQFxJV/0/PvVy4tZdvbXnemRibTxaOEe2AmThiVAAgaUQnRrOAYBoY7Hn+N7Oy7f4Dx5MAIAssPwtBhcQsJykQqr5f/HBf1xpdbV3O1etPwIikTD2dP/wWbJtQEx97RMQvzhQ+W6EEzdtP6xzxVz4zMtbQWRm1hoWg5k6Nq7sJEKkWJuJYnvw1yOHUh++SWoxQtTXn4el6loKiUiJH6L80ukOVN9vuev6S/z7950CAKoGWI3CFAHLGf0aRIRAJPmfPtzrbt1wpX3Zun+DSMLnTrSinonQiCHPpWjg3GD8n+FeAOS95aqDlHAT/t5Du0EkovWSR7+G6bo2tvBohMFk9FC2p/i7gwfSn7tNQ4TKff3ro8GxcXJthpnbDUSMIceW8vOnTko5TkCxTn/61tfmf7L3uETaqdYeGlobZKAxoz8FIwxmk//JH65RPR1diRu3HpS83x719b9MriMQ6Hn+m0Cg8OBRgQilPn7zgfjM2LnSnw9fC8W6Fls0AjWdG196rvi9SFhOTtx934nMl+/axgm36O99QsNWJDCzj6Axwo6t9LlsMfj781vtzev+3XLLriuzd9/XBSZTC7kbjebU3o1RUByHh168uvjA/n92/OhTp4L9z+8uHx8c5mRCwchFE5kY0Zxuhf/wU4dhhDu+99GOiXt+edyM5tcAJBBpiqwENNgFpjeuVCxaW5kv3XmAFFP5pdNx25fet8cUCgJW581ZREAEifTk+Bd+diz18Ztd/5Gnx/zfHrgOSsXQetnF29kQ5AaJmqV8FQLFBtqo1Kdu2e9c9boOZ1PPenIsF0TnCTBGyLZMfGZ0UA/nsv6fnsz5Dz2xp0ZgE+VrkgucB1UnRV249w/X6f5zEyAuc0tCzVwNyHMVeS6XHqkqb6mo2coDDdgXqAvGsFrbNihRLMVf7XvWWt+VSN64dacpBgYEgrJk8jePPS7lSERZgtp22gqg+QRUo0E9lO3xf/14SY9MrHHe0Pti8uYdJMWSJlYWRCR/797N3OIVTcFPwRhVzQKbjpWxgAokOjm0EQCiE2fXxWdHc9yaTJPrIHz62FGZLG2Ix/Krz7/dnGVvJlZkC7oKguIYXC2a2k6iMg8IyFa2hJEHxXqlRr6GlSOASEixhjHKuaL3pNW5yhFttJRCsTf1rFdd7QPQRpHFUa2cthJYGQKYDERIyrFrrevoT33s5i4phULELMYYbklYqU++c4Bc25dIOxDQSllCs+OASnVYhNXqzGDqwzcdT7xt+zZOJVNSCgWqWi83RijpUXRquL+098n/TN736G4JYw9E0uy5oLkE1Op5r11zou3bH4K7deMGPTYBxOa88jVoY8hzmDOt8B8+9FT2nl9earKFzkp9uXkkNM8FiEzNlzPf+IA4W3o3RGdGytBysfIAoJgljEx0eiRMvmvXNas+8+7jEBAUxc10h8Yug0TVM0GGIcJTp58stsQPDVuWBZ5nm5iJ2WJLiiVNrlU5VxRLZXeIWRNBpJISN8wirCA32Dg3EKFa+MotXl4UG0BEmFE9AFFfOYtIkbKYUokJWMpQELmmFLY02gyC3CA1Jhusmii3p0aS77j6qLP78lXO+q51ILJARNzipC7I/hZuDxLFkRSDSRBBYl2O+vpPBo+/UA7+8ux2E5ST1X3BZVlCwwioZW3JW3Y91vnjz+zRozkgjqd+F60XvztMVDlIJQCYQK4NcmwM3fbNvuho/xZwJaZYjtxBbpAaOwfEhnQ2H+tCUbNiZ+p5vQcjpkMEUo6maJNSqMmxG74iVLa0GnUIkQBSyiJmBWaa+ixZumltMCkobliGWNN5JXOBVySmCGjWUdRXIqbr+qoFTP/j/8EKZur4qgXMfPC/bAWz6faqBcz2cMlWsIwlv/4+6swnZmAunea0gKWQIEFZNe8OShV+5C22ZDafLvO6wKJIIDLuzss0YgNQMwoYYsi24O7ZMlApmdVHwkI6LH8OYNaitWX1dPS3vOfaN5tJX+o/EbaojkjCsqQ+9PYd3OLmoY1VO4y5rFYXemFeBis1O1Zr2gbbv/ORGEYMDOo/Fb4YMLGUY+EWL9n+/U+c4rbW0SkZliJ7rdl6+p6rIWLWECF3x+aX3as3bzRBqKdufjQDilmC0HhvfuMV9qbufkjlRMpiZJ6JutPhWoOz1g60IQlCDRDmOwLTKEgx0NCzH7Ro2oWJ6R1cRIIxRI6tyLHUBbfBmgEjilx71q2zpaxcS/bV2sVICIiT3qTqXT2A5g/+FOITQ73Tr9MtNXZZ9mTV9I2VBbDc0L1hlSAvsy5e+MXGIVjmfcEaGr5cNdsiGp2sNffydAPxyr88vQAWS8hKpeX/BZSK55mkEfxcAAAAAElFTkSuQmCC";
    const link = document.querySelector("link[rel*='icon']") || document.createElement("link");
    link.type = "image/png"; link.rel = "shortcut icon"; link.href = FAVICON;
    document.head.appendChild(link);
    const apple = document.querySelector("link[rel='apple-touch-icon']") || document.createElement("link");
    apple.rel = "apple-touch-icon"; apple.href = FAVICON;
    document.head.appendChild(apple);
  }, []);

  // Set viewport meta to prevent zoom on mobile
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';

    // Inject global style to prevent iOS zoom on inputs
    const style = document.createElement('style');
    style.textContent = `
      body { touch-action: manipulation; -ms-touch-action: manipulation; }
      * { -webkit-text-size-adjust: 100%; }
      input:focus, select:focus, textarea:focus { font-size: 16px !important; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  const [tPlayers, setTPlayers] = useState([]);
  const [tRounds, setTRounds] = useState([
    { id: "tr1", tournament_id: "wbc_2026", round_number: 1, course_id: "demo_course_1" },
  ]);
  const [courseList, setCourseList] = useState([]);
  const [holeData, setHoleData] = useState({});
  const [ctpData, setCtpData] = useState({});
  const [pairingsData, setPairingsData] = useState({});
  const [teeData, setTeeData] = useState({});
  const [teesSaved, setTeesSaved] = useState({});
  const [teesModified, setTeesModified] = useState({});
  const [teeTimesData, setTeeTimesData] = useState({});
  const [finalizedRounds, setFinalizedRounds] = useState({});
  // Auto-advance round when finalization changes
  useEffect(() => {
    setRound(r => {
      if (!finalizedRounds[r]) return r;
      for (let i = 1; i <= 4; i++) { if (!finalizedRounds[i]) return i; }
      return 4;
    });
  }, [JSON.stringify(finalizedRounds)]);
  const [adminSettingsOpen, setAdminSettingsOpen] = useState(false);
  const [adminSettingsTab, setAdminSettingsTab] = useState("players");
  const [passwords, setPasswords] = useState({});
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // ── Load all WBC 2026 data from Supabase on mount ──
  useEffect(() => {
    (async () => {
      try {
        setSyncing(true);

        // Load player registry (names) from players table
        const playerRows = await sb.get("players", "order=name");
        if (playerRows?.length) {
          DEMO_PLAYERS = playerRows.map(r => ({ id: r.id, name: r.name }));
        }

        // Load tournament players
        const tpRows = await sb.get("tournament_players", `tournament_id=eq.${TOURNAMENT_ID}&order=player_id`);
        if (tpRows?.length) {
          setTPlayers(tpRows.map(r => ({ id: r.id, tournament_id: r.tournament_id, player_id: r.player_id, handicap_index: parseFloat(r.handicap_index) || 0, status: r.status || "active" })));
        } else if (playerRows?.length) {
          // No tournament_players yet — seed from players table with HI=0
          const seeded = playerRows.map(r => ({ id: `tp_2026_${r.id}`, tournament_id: TOURNAMENT_ID, player_id: r.id, handicap_index: 0, status: "active" }));
          setTPlayers(seeded);
          for (const tp of seeded) await sb.upsert("tournament_players", tp, "id");
        }

        // Load tournament rounds
        const trRows = await sb.get("tournament_rounds", `tournament_id=eq.${TOURNAMENT_ID}&order=round_number`);
        if (trRows?.length) setTRounds(trRows.map(r => ({ id: r.id, tournament_id: r.tournament_id, round_number: r.round_number, course_id: r.course_id })));

        // Load courses used by this tournament
        const courseIds = (trRows || []).map(r => r.course_id).filter(Boolean);
        if (courseIds.length) {
          const cRows = await sb.get("courses", `id=in.(${courseIds.join(",")})`);
          if (cRows?.length) {
            // Also load tee boxes for each course
            const tbRows = await sb.get("tee_boxes", `course_id=in.(${courseIds.join(",")})`);
            const coursesWithTees = cRows.map(c => ({
              ...c,
              hole_pars: c.hole_pars || [],
              hole_handicaps: c.hole_handicaps || [],
              tee_boxes: (tbRows || []).filter(t => t.course_id === c.id).map(t => ({ name: t.name, color: t.color, rating: parseFloat(t.rating), slope: t.slope, par: t.par, yardage: t.yardage })),
            }));
            setCourseList(prev => sortCoursesByRound(coursesWithTees, tRounds));
          }
        }

        // Load hole scores
        const hsRows = await sb.get("hole_scores", `tournament_id=eq.${TOURNAMENT_ID}`);
        if (hsRows?.length) setHoleData(rowsToHoleData(hsRows));

        // Load pairings
        const pairRows = await sb.get("pairings", `tournament_id=eq.${TOURNAMENT_ID}&order=round_number,group_number,player_id`);
        if (pairRows?.length) {
          setPairingsData(rowsToPairings(pairRows));
          setTeeTimesData(rowsToTeeTimes(pairRows));
        }

        // Load tee assignments
        const teeRows = await sb.get("tee_assignments", `tournament_id=eq.${TOURNAMENT_ID}`);
        if (teeRows?.length) setTeeData(rowsToTeeData(teeRows));

        // Load tournament state (finalized rounds, passwords)
        const stateRows = await sb.get("tournament_state", `tournament_id=eq.${TOURNAMENT_ID}`);
        if (stateRows?.length) {
          const s = stateRows[0];
          if (s.finalized_rounds) setFinalizedRounds(s.finalized_rounds);
          if (s.passwords) setPasswords(s.passwords);
          if (s.tees_saved) setTeesSaved(s.tees_saved);
        }

      } catch(e) { console.error("Load failed:", e); }
      finally { setSyncing(false); setStorageLoaded(true); }
    })();

    // ── Real-time subscriptions ──
    const unsubs = [];

    // Hole scores — most critical, update immediately
    unsubs.push(sb.subscribe("hole_scores", null, (data) => {
      const { new: row, eventType } = data;
      if (!row || row.tournament_id !== TOURNAMENT_ID) return;
      setSyncing(true);
      setHoleData(prev => {
        const rnd = row.round_number || extractRound(row.round_score_id);
        const key = `${row.player_id}_${rnd}`;
        return { ...prev, [key]: { ...(prev[key] || {}), [row.hole_number - 1]: row.score } };
      });
      setTimeout(() => setSyncing(false), 600);
    }));

    // Pairings
    unsubs.push(sb.subscribe("pairings", null, async (data) => {
      const rows = await sb.get("pairings", `tournament_id=eq.${TOURNAMENT_ID}&order=round_number,group_number,player_id`);
      if (rows) { setPairingsData(rowsToPairings(rows)); setTeeTimesData(rowsToTeeTimes(rows)); }
    }));

    // Tee assignments
    unsubs.push(sb.subscribe("tee_assignments", null, async (data) => {
      const rows = await sb.get("tee_assignments", `tournament_id=eq.${TOURNAMENT_ID}`);
      if (rows) setTeeData(rowsToTeeData(rows));
    }));

    // Tournament state (finalized rounds)
    unsubs.push(sb.subscribe("tournament_state", null, async (data) => {
      const rows = await sb.get("tournament_state", `tournament_id=eq.${TOURNAMENT_ID}`);
      if (rows?.length) {
        if (rows[0].finalized_rounds) setFinalizedRounds(rows[0].finalized_rounds);
        if (rows[0].passwords) setPasswords(rows[0].passwords);
        if (rows[0].tees_saved) setTeesSaved(rows[0].tees_saved);
      }
    }));

    // Tournament players
    unsubs.push(sb.subscribe("tournament_players", null, async (data) => {
      const rows = await sb.get("tournament_players", `tournament_id=eq.${TOURNAMENT_ID}`);
      if (rows) setTPlayers(rows.map(r => ({ id: r.id, tournament_id: r.tournament_id, player_id: r.player_id, handicap_index: parseFloat(r.handicap_index) || 0, status: r.status || "active" })));
    }));

    return () => unsubs.forEach(u => u && u());
  }, []);

  // Save tournament state (finalized rounds + passwords) to Supabase
  const saveTournamentState = async (finalized, pwds, savedTees) => {
    const tsSaved = savedTees !== undefined ? savedTees : teesSaved;
    await sb.upsert("tournament_state", {
      id: `ts_${TOURNAMENT_ID}`,
      tournament_id: TOURNAMENT_ID,
      finalized_rounds: finalized,
      passwords: pwds,
      tees_saved: tsSaved,
      updated_at: new Date().toISOString(),
    }, "tournament_id");
  };


  const startFresh = async () => {
    // Clear scores, rounds, pairings, tees — keep tournament_players (roster + HIs)
    try {
      await sb.delete("hole_scores", `tournament_id=eq.${TOURNAMENT_ID}`);
      await sb.delete("pairings", `tournament_id=eq.${TOURNAMENT_ID}`);
      await sb.delete("tee_assignments", `tournament_id=eq.${TOURNAMENT_ID}`);
      await sb.delete("tournament_rounds", `tournament_id=eq.${TOURNAMENT_ID}`);
      await sb.delete("tournament_state", `tournament_id=eq.${TOURNAMENT_ID}`);
      await sb.delete("skins", `tournament_round_id=like.tr_2026%`);
    } catch(e) { console.error("Start fresh clear failed:", e); }
    // Keep tPlayers (roster + HIs) and passwords intact — clear everything else
    setTRounds([]);
    setCourseList([]);
    setHoleData({});
    setCtpData({});
    setPairingsData({});
    setTeeData({});
    setTeeTimesData({});
    setFinalizedRounds({});
    setRound(1);
    await saveTournamentState({}, passwords);
    notify("Scorecards cleared — player roster preserved");
  };

  const notify = m => { setNotif(m); setTimeout(() => setNotif(null), 2500); };

  const activePlayers = useMemo(() => {
    return tPlayers.filter(tp => tp.status !== "WD").map(tp => {
      const p = DEMO_PLAYERS.find(pl => pl.id === tp.player_id);
      return p ? { ...p, handicap_index: parseFloat(tp.handicap_index) || 0, tp_id: tp.id } : null;
    }).filter(Boolean).sort((a,b) => a.name.localeCompare(b.name));
  }, [tPlayers]);

  // All players including WD — used for leaderboard display
  const allPlayers = useMemo(() => {
    return tPlayers.map(tp => {
      const p = DEMO_PLAYERS.find(pl => pl.id === tp.player_id);
      return p ? { ...p, handicap_index: parseFloat(tp.handicap_index) || 0, tp_id: tp.id, isWD: tp.status === "WD" } : null;
    }).filter(Boolean).sort((a,b) => a.name.localeCompare(b.name));
  }, [tPlayers]);

  const currentTR = tRounds.find(r => r.round_number === round);
  const currentCourse = currentTR ? courseList.find(c => c.id === currentTR.course_id) : null;

  // Get a player's tee box for a round (returns tee object or null)
  const getPlayerTee = (rnd, pid, course) => {
    if (!course || !course.tee_boxes || course.tee_boxes.length === 0) return null;
    const assigned = (teeData[rnd] || {})[pid];
    if (assigned) {
      const tee = course.tee_boxes.find(t => t.name === assigned);
      if (tee) return tee;
    }
    return getDefaultTee(course.tee_boxes) || course.tee_boxes[0];
  };

  const getLeaderboard = useMemo(() => {
    return allPlayers.map(p => {
      let totalNetToPar = 0, roundsPlayed = 0, totalThru = 0;
      const rds = [];
      for (let r = 1; r <= 4; r++) {
        const tr = tRounds.find(t => t.round_number === r);
        if (!tr) { rds.push({ netToPar: null, thru: 0, wd: false }); continue; }
        const course = courseList.find(c => c.id === tr.course_id);
        if (!course) { rds.push({ netToPar: null, thru: 0, wd: false }); continue; }
        const tee = getPlayerTee(r, p.id, course);
        const slope = tee?.slope || course.slope;
        const rating = tee?.rating || course.rating;
        const par = tee?.par || course.par;
        const key = `${p.id}_${r}`;
        const scores = holeData[key] || {};
        // Only count real scores (not WD sentinel 99) for net calculation
        const realEntries = Object.entries(scores).filter(([_, s]) => s !== 99);
        const thru = realEntries.length;
        const isWDRound = Object.values(scores).some(s => s === 99);
        if (thru > 0 || isWDRound) {
          const gross = realEntries.reduce((a, [_, s]) => a + s, 0);
          const parForHoles = realEntries.reduce((a, [h]) => a + ((course.hole_pars || [])[parseInt(h)] || 4), 0);
          // Distribute handicap strokes by hole difficulty order, only count strokes for played holes
          const ch = calcCH(p.handicap_index, slope, rating, par);
          const holeHcps = course.hole_handicaps || [];
          const sorted = holeHcps.length
            ? holeHcps.map((h, i) => ({ idx: i, hcp: h })).sort((a, b) => a.hcp - b.hcp)
            : Array.from({ length: 18 }, (_, i) => ({ idx: i, hcp: i + 1 }));
          const strokeMap = {};
          let rem = Math.abs(ch);
          for (let pass = 0; pass < 3 && rem > 0; pass++) {
            for (const h of sorted) { if (rem <= 0) break; strokeMap[h.idx] = (strokeMap[h.idx] || 0) + 1; rem--; }
          }
          // Only sum strokes for holes that were actually played
          const strokesForPlayedHoles = realEntries.reduce((a, [h]) => a + (strokeMap[parseInt(h)] || 0), 0);
          const netToPar = ch >= 0
            ? gross - parForHoles - strokesForPlayedHoles
            : gross - parForHoles + strokesForPlayedHoles;
          if (!p.isWD) { roundsPlayed++; totalNetToPar += netToPar; totalThru += thru; }
          rds.push({ netToPar, thru, wd: p.isWD && r >= round });
        } else { rds.push({ netToPar: null, thru: 0, wd: false }); }
      }
      return { ...p, totalNetToPar, roundsPlayed, totalThru, rds };
    }).sort((a, b) => {
      // WD players always sort to the bottom
      if (a.isWD && b.isWD) return 0;
      if (a.isWD) return 1;
      if (b.isWD) return -1;
      if (!a.roundsPlayed && !b.roundsPlayed) return 0;
      if (!a.roundsPlayed) return 1; if (!b.roundsPlayed) return -1;
      return a.totalNetToPar - b.totalNetToPar;
    });
  }, [allPlayers, tRounds, courseList, holeData, teeData]);

  const onSaveHole = async (pid, rnd, holeIdx, score) => {
    // Optimistic update
    setHoleData(prev => {
      const key = `${pid}_${rnd}`;
      return { ...prev, [key]: { ...(prev[key] || {}), [holeIdx]: score } };
    });
    // Persist to Supabase
    const tr = tRounds.find(t => t.round_number === rnd);
    const row = holeDataToRow(pid, rnd, holeIdx, score, tr?.course_id);
    await sb.upsert("hole_scores", row, "id");
  };

  // Mark player as WD: set status, fill all unfilled holes in current and future rounds with sentinel 99
  const markPlayerWD = async (pid) => {
    // Fill remaining holes with 99 and persist each
    const updates = [];
    for (let r = round; r <= 4; r++) {
      const tr = tRounds.find(t => t.round_number === r);
      const key = `${pid}_${r}`;
      const existing = holeData[key] || {};
      for (let h = 0; h < 18; h++) {
        if (!(existing[h] > 0)) {
          updates.push(holeDataToRow(pid, r, h, 99, tr?.course_id));
        }
      }
    }
    setHoleData(prev => {
      const updated = { ...prev };
      for (let r = round; r <= 4; r++) {
        const key = `${pid}_${r}`;
        const existing = updated[key] || {};
        const filled = { ...existing };
        for (let h = 0; h < 18; h++) { if (!(filled[h] > 0)) filled[h] = 99; }
        updated[key] = filled;
      }
      return updated;
    });
    // Update player status in Supabase
    const tp = tPlayers.find(t => t.player_id === pid);
    if (tp) await sb.upsert("tournament_players", { ...tp, status: "WD" }, "id");
    setTPlayers(prev => prev.map(tp => tp.player_id === pid ? { ...tp, status: "WD" } : tp));
    // Persist WD hole scores
    for (const row of updates) await sb.upsert("hole_scores", row, "id");
    notify(`Player withdrawn from tournament`);
  };

  const sortCoursesByRound = (list, rounds) => {
    return [...list].sort((a, b) => {
      const ra = rounds.find(r => r.course_id === a.id)?.round_number ?? 99;
      const rb = rounds.find(r => r.course_id === b.id)?.round_number ?? 99;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name); // fallback alpha for unassigned
    });
  };

  const setCourseForRound = async (rnd, course) => {
    if (course.id) {
      setCourseList(prev => prev.find(c => c.id === course.id) ? prev : [...prev, course]);
      // Upsert course to Supabase
      const { tee_boxes, ...courseData } = course;
      await sb.upsert("courses", courseData, "id");
      // Upsert tee boxes
      if (tee_boxes?.length) {
        for (const tb of tee_boxes) {
          const { hole_yards: hy2, _source: _s2, color: _c2, ...tbData2 } = tb;
          const tbPayload2 = {
            id: `tb_${course.id}_${(tb.name || "default").toLowerCase().replace(/\s+/g,"_")}`,
            course_id: course.id,
            color: tb.color || _c2,
            name: tbData2.name, rating: tbData2.rating, slope: tbData2.slope,
            par: tbData2.par, yardage: tbData2.yardage || 0,
          };
          if (Array.isArray(hy2) && hy2.some(y => y > 0)) tbPayload2.hole_yards = hy2;
          await sb.upsert("tee_boxes", tbPayload2, "id");
        }
      }
    }
    const trRow = { id: `tr_2026_r${rnd}`, tournament_id: TOURNAMENT_ID, round_number: rnd, course_id: course.id || null };
    setTRounds(prev => {
      const existing = prev.find(t => t.round_number === rnd);
      const updated = existing
        ? prev.map(t => t.round_number === rnd ? { ...t, course_id: course.id } : t)
        : (course.id ? [...prev, trRow] : prev);
      setCourseList(cl => sortCoursesByRound(cl, updated));
      return updated;
    });
    // Only upsert to Supabase if assigning a real course — skip if unassigning (course_id null violates NOT NULL)
    if (course.id) {
      await sb.upsert("tournament_rounds", trRow, "id");
    }
    // Auto-assign default tee
    if (course.id && course.tee_boxes?.length) {
      const defaultTee = getDefaultTee(course.tee_boxes);
      if (defaultTee) {
        const bulk = {};
        activePlayers.forEach(p => { bulk[p.id] = defaultTee.name; });
        setTeeData(prev => ({ ...prev, [rnd]: bulk }));
        const rows = activePlayers.map(p => ({ id: `ta_2026_r${rnd}_${p.id}`, tournament_id: TOURNAMENT_ID, round_number: rnd, player_id: p.id, tee_name: defaultTee.name }));
        for (const row of rows) await sb.upsert("tee_assignments", row, "id");
      }
    }
    notify(course.id ? `Round ${rnd}: ${course.name}` : `Round ${rnd} unassigned`);
  };

  const addCourse = async (course) => {
    if (course._delete) {
      // Remove from tournament's active course list (local state only)
      // Do NOT delete from Supabase — courses table is a permanent library
      setCourseList(prev => prev.filter(c => c.id !== course.id));
      notify("Course removed from tournament");
      return;
    }
    // Strip all internal UI flags and tee_boxes before saving course row
    const { tee_boxes, _incompleteData, _apiVersion, _sbVersion, _gcVersion,
            _sbHasReal, _apiHasReal, _rapidHasReal, _gcHasReal, _source, _freshFetch, ...rawCourseData } = course;
    // Ensure course has a stable id (not a temporary rapid_/gc_ prefixed one if Supabase has it)
    const courseId = rawCourseData.id || `course_${Date.now()}`;
    const courseData = { ...rawCourseData, id: courseId };
    // Save course FIRST and wait for it before saving tee boxes (foreign key requirement)
    const now = new Date().toISOString();
    const savedBy = typeof currentUser !== "undefined" ? currentUser?.name || "Unknown" : "Unknown";
    await sb.upsert("courses", { ...courseData, updated_at: now, updated_by: savedBy }, "id");
    if (tee_boxes?.length) {
      let tbErrors = 0;
      for (const tb of tee_boxes) {
        const { color: _c, _source: _s, ...tbData } = tb;
        const tbPayload = {
          id: `tb_${courseId}_${(tb.name || "default").toLowerCase().replace(/\s+/g,"_")}`,
          course_id: courseId,
          color: tb.color,
          name: tbData.name,
          rating: tbData.rating,
          slope: tbData.slope,
          par: tbData.par,
          yardage: tbData.yardage || 0,
        };
        if (Array.isArray(tb.hole_yards) && tb.hole_yards.some(y => y > 0)) {
          tbPayload.hole_yards = tb.hole_yards;
        }
        try {
          await sb.upsert("tee_boxes", tbPayload, "id");
        } catch(tbErr) {
          console.error("Tee box save failed:", tbErr, tbPayload);
          tbErrors++;
        }
      }
      if (tbErrors > 0) {
        notify(`⚠ Course saved but ${tbErrors} tee box${tbErrors > 1 ? "es" : ""} failed to save — open and re-save to retry`);
      }
    }
    // Update local state with clean version (always, even if tee saves had errors)
    const cleanCourse = { ...courseData, tee_boxes: tee_boxes || [] };
    setCourseList(prev => sortCoursesByRound(
      prev.find(c => c.id === courseId) ? prev.map(c => c.id === courseId ? cleanCourse : c) : [...prev, cleanCourse],
      tRounds
    ));
    notify(`Added ${course.name}`);
  };

  const addPlayerToTournament = async (name, hi) => {
    const id = name.toLowerCase().replace(/\s+/g, "_");
    if (!DEMO_PLAYERS.find(p => p.id === id)) DEMO_PLAYERS.push({ id, name });
    await sb.upsert("players", { id, name }, "id").catch(() => {});
    const newTp = { id: `tp_2026_${id}`, tournament_id: TOURNAMENT_ID, player_id: id, handicap_index: hi, status: "active" };
    setTPlayers(prev => [...prev, newTp]);
    await sb.upsert("tournament_players", newTp, "id");
    const newPw = { ...passwords, [id]: "wbc2026" };
    setPasswords(newPw);
    // Seed default tee assignments
    const teeUpdates = [];
    tRounds.forEach(tr => {
      const course = courseList.find(c => c.id === tr.course_id);
      if (!course) return;
      const defaultTee = getDefaultTee(course.tee_boxes);
      if (!defaultTee) return;
      teeUpdates.push({ id: `ta_2026_r${tr.round_number}_${id}`, tournament_id: TOURNAMENT_ID, round_number: tr.round_number, player_id: id, tee_name: defaultTee.name });
    });
    if (teeUpdates.length) {
      setTeeData(prev => {
        const updated = { ...prev };
        teeUpdates.forEach(u => { updated[u.round_number] = { ...(updated[u.round_number] || {}), [id]: u.tee_name }; });
        return updated;
      });
      for (const row of teeUpdates) await sb.upsert("tee_assignments", row, "id");
    }
    await saveTournamentState(finalizedRounds, newPw);
    notify(`${name} added`);
  };

  const updateHI = async (pid, newHI) => {
    setTPlayers(prev => prev.map(tp => tp.player_id === pid ? { ...tp, handicap_index: newHI } : tp));
    const tp = tPlayers.find(t => t.player_id === pid);
    if (tp) await sb.upsert("tournament_players", { ...tp, handicap_index: newHI }, "id");
    notify("Handicap updated");
  };

  const updateName = async (pid, newName) => {
    const p = DEMO_PLAYERS.find(pl => pl.id === pid);
    if (p) p.name = newName;
    else DEMO_PLAYERS.push({ id: pid, name: newName });
    setTPlayers(prev => [...prev]); // trigger re-render
    await sb.upsert("players", { id: pid, name: newName }, "id").catch(() => {});
    notify("Name updated");
  };

  const removePlayer = async (pid) => {
    const tp = tPlayers.find(t => t.player_id === pid);
    setTPlayers(prev => prev.filter(tp => tp.player_id !== pid));
    if (tp) await sb.delete("tournament_players", `id=eq.${tp.id}`);
    // Remove from pairings
    setPairingsData(prev => {
      const updated = {};
      Object.keys(prev).forEach(rnd => {
        updated[rnd] = prev[rnd].map(grp => grp.filter(id => id !== pid)).filter(grp => grp.length > 0);
      });
      return updated;
    });
    await sb.delete("pairings", `tournament_id=eq.${TOURNAMENT_ID}&player_id=eq.${pid}`);
    notify("Player removed");
  };

  // Compute gross skin wins for scorecard highlighting: { "round_holeIdx": playerId }
  const skinWins = useMemo(() => {
    const wins = {};
    for (let r = 1; r <= 4; r++) {
      const tr = tRounds.find(t => t.round_number === r);
      if (!tr) continue;
      const rCourse = courseList.find(c => c.id === tr.course_id);
      if (!rCourse) continue;
      for (let hole = 0; hole < 18; hole++) {
        const scores = [];
        activePlayers.forEach(p => {
          const s = holeData[`${p.id}_${r}`]?.[hole];
          if (s) scores.push({ pid: p.id, gross: s });
        });
        if (scores.length < 2) continue;
        const minG = Math.min(...scores.map(s => s.gross));
        const winners = scores.filter(s => s.gross === minG);
        if (winners.length === 1) wins[`${r}_${hole}`] = winners[0].pid;
      }
    }
    return wins;
  }, [activePlayers, holeData, tRounds, courseList]);

  const onSetCtp = async (rnd, hole, pid) => {
    setCtpData(prev => ({ ...prev, [rnd]: { ...(prev[rnd] || {}), [hole]: pid } }));
    // Store CTP as a skin type in the skins table
    const tr = tRounds.find(t => t.round_number === rnd);
    if (tr) {
      await sb.upsert("skins", { id: `ctp_2026_r${rnd}_h${hole}`, tournament_round_id: tr.id, hole_number: hole, player_id: pid, skin_type: "ctp" }, "id");
    }
    notify(`CTP Hole ${hole} set`);
  };

  const setPairings = async (rnd, groups) => {
    const existing = JSON.stringify(pairingsData[rnd] || []);
    const incoming = JSON.stringify(groups);
    if (existing === incoming) return;
    setPairingsData(prev => ({ ...prev, [rnd]: groups }));
    // Delete old pairings for this round and reinsert
    await sb.delete("pairings", `tournament_id=eq.${TOURNAMENT_ID}&round_number=eq.${rnd}`);
    const rows = [];
    groups.forEach((grp, gi) => {
      grp.forEach(pid => {
        rows.push({ id: `pair_2026_r${rnd}_g${gi+1}_${pid}`, tournament_id: TOURNAMENT_ID, round_number: rnd, group_number: gi + 1, player_id: pid, tee_time: (teeTimesData[rnd] || [])[gi] || null });
      });
    });
    for (const row of rows) await sb.upsert("pairings", row, "id");
    notify(`Round ${rnd} pairings saved`);
  };

  const setTee = async (rnd, pid, teeName) => {
    setTeeData(prev => ({ ...prev, [rnd]: { ...(prev[rnd] || {}), [pid]: teeName } }));
    await sb.upsert("tee_assignments", { id: `ta_2026_r${rnd}_${pid}`, tournament_id: TOURNAMENT_ID, round_number: rnd, player_id: pid, tee_name: teeName }, "id");
  };

  const setTeeBulk = async (rnd, assignments) => {
    setTeeData(prev => ({ ...prev, [rnd]: { ...(prev[rnd] || {}), ...assignments } }));
    const rows = Object.entries(assignments).map(([pid, teeName]) => ({ id: `ta_2026_r${rnd}_${pid}`, tournament_id: TOURNAMENT_ID, round_number: rnd, player_id: pid, tee_name: teeName }));
    for (const row of rows) await sb.upsert("tee_assignments", row, "id");
  };

  // ── LOGIN ──
  const [loginAnim, setLoginAnim] = useState(null);
  const [loginPrompt, setLoginPrompt] = useState(null); // { id, name, isDirector }
  const [loginPin, setLoginPin] = useState("");
  const [loginError, setLoginError] = useState(false);

  const tryLogin = () => {
    const playerPw = passwords[loginPrompt.id] || "wbc2026";
    if (loginPin.toLowerCase() === playerPw.toLowerCase()) {
      setLoginPrompt(null);
      setLoginPin("");
      setLoginError(false);
      setLoginAnim({ id: loginPrompt.id, name: loginPrompt.name, isDirector: loginPrompt.isDirector });
    } else {
      setLoginError(true);
      setTimeout(() => setLoginError(false), 1500);
    }
  };

  // Check if any round needs admin finalization
  const adminActionNeeded = useMemo(() => {
    for (let r = 1; r <= 4; r++) {
      if (finalizedRounds[r]) continue;
      const tr = tRounds.find(t => t.round_number === r);
      if (!tr) continue;
      const allDone = activePlayers.length > 0 && activePlayers.every(p => {
        const wdTp = tPlayers.find(tp => tp.player_id === p.id);
        if (wdTp?.status === "WD") return true; // WD players count as done
        const scores = holeData[`${p.id}_${r}`] || {};
        for (let h = 0; h < 18; h++) { if (!(scores[h] > 0)) return false; }
        return true;
      });
      if (allDone) return true;
    }
    return false;
  }, [activePlayers, holeData, finalizedRounds, tRounds]);

  if (!user) {
    return (
      <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse at 20% 50%, #0d1f3c 0%, ${K.bg} 70%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Montserrat', sans-serif", fontVariantNumeric: "lining-nums tabular-nums", padding: 20 }}>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <style>{`:root { --sab: env(safe-area-inset-bottom, 0px); }`}</style>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <style>{`
          @keyframes loginPulse { 0% { transform: scale(0.8); opacity: 0; } 50% { transform: scale(1.05); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
          @keyframes loginCheck { 0% { stroke-dashoffset: 24; } 100% { stroke-dashoffset: 0; } }
          @keyframes loginFade { 0% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
          @keyframes toastUp { 0% { transform: translateX(-50%) translateY(20px); opacity: 0; } 100% { transform: translateX(-50%) translateY(0); opacity: 1; } }
          @keyframes shake { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-6px); } 40%,80% { transform: translateX(6px); } }
          @keyframes finalizeGlow { 0%,100% { box-shadow: 0 0 4px rgba(212,168,67,0.2); } 50% { box-shadow: 0 0 14px rgba(212,168,67,0.5); } }
          @keyframes pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 0.2; } }
          @keyframes syncPing { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2); opacity: 0; } }
        `}</style>

        {loginAnim && (
          <div style={{
            position: "fixed", top: 0, bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, zIndex: 999,
            background: `radial-gradient(ellipse at 50% 50%, #0d1f3c 0%, ${K.bg} 70%)`,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            animation: "loginFade 1.4s ease forwards",
          }} onAnimationEnd={() => { setUser({ id: loginAnim.id, name: loginAnim.name, isDirector: loginAnim.isDirector }); setLoginAnim(null); }}>
            <div style={{ animation: "loginPulse 0.5s ease forwards", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <div style={{
                width: 72, height: 72, borderRadius: "50%", background: K.acc + "20",
                border: `3px solid ${K.acc}`, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={K.acc} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" style={{ strokeDasharray: 24, animation: "loginCheck 0.4s 0.3s ease forwards", strokeDashoffset: 24 }} />
                </svg>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: K.t1 }}>{loginAnim.name}</div>
                <div style={{ fontSize: 12, color: K.acc, fontWeight: 600, marginTop: 4 }}>Welcome back</div>
              </div>
            </div>
          </div>
        )}

        <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          <div style={{ width: 80, height: 100, margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src={WBC_LOGO} alt="WBC" style={{ height: 90, filter: "drop-shadow(0 4px 16px rgba(34,211,167,0.3))" }} />
          </div>
          <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 32, color: K.t1, margin: "0 0 4px", fontWeight: 800, letterSpacing: "-0.03em" }}>WBC 2026</h1>
          <p style={{ color: K.t2, fontSize: 14, margin: "0 0 32px" }}>Wannabes. For Life.</p>

          <div>
            <p style={{ color: K.t3, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, margin: "0 0 8px" }}>Login</p>
            {!storageLoaded ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {Array.from({length: 12}).map((_, i) => (
                  <div key={i} style={{ background: K.card, border: `1px solid ${K.bdr}`, borderRadius: 10, padding: "12px 6px", height: 44,
                    animation: "pulse 1.5s ease-in-out infinite", opacity: 0.5 }} />
                ))}
              </div>
            ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {activePlayers.map(p => {
                const isDirector = p.id === "aaron_j" || p.id === "scott_r";
                return (
                  <button key={p.id} onClick={() => setLoginAnim({ id: p.id, name: p.name, isDirector })}
                    style={{ background: K.card, border: `1px solid ${K.bdr}`, borderRadius: 10, padding: "12px 6px", cursor: "pointer", color: K.t1, fontSize: 13, fontWeight: 600, textAlign: "center", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = K.acc; e.currentTarget.style.background = K.hover; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = K.bdr; e.currentTarget.style.background = K.card; }}>
                    {p.name}
                  </button>
                );
              })}
            </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN ──
  const navItems = [
    { key: "groups", label: "Pairings", icon: "pairings" },
    { key: "scoring", label: "Scoring", icon: "score" },
    { key: "leaderboard", label: "Board", icon: "trophy" },
    { key: "skins", label: "Betting", icon: "betting" },
    { key: "admin", label: "Admin", icon: "admin" },
  ];

  return (
    <div style={{ minHeight: "100dvh", background: "#030810", display: "flex", justifyContent: "center", overflow: "hidden" }}>
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: K.bg, fontFamily: "'Montserrat', sans-serif", fontVariantNumeric: "lining-nums tabular-nums", color: K.t1, width: "100%", maxWidth: 480, position: "relative", boxShadow: "0 0 80px rgba(0,0,0,0.8)", flexShrink: 0, overflow: "hidden" }}>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <style>{`:root { --sab: env(safe-area-inset-bottom, 0px); }`}</style>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />

      {notif && <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: K.accDim, color: "white", padding: "10px 24px", borderRadius: 12, fontSize: 13, fontWeight: 600, zIndex: 1000, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>{notif}</div>}

      <div style={{ padding: "10px 20px", paddingTop: "max(10px, calc(env(safe-area-inset-top, 0px) + 10px))", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${K.bdr}`, background: "rgba(14,24,41,0.95)", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={WBC_LOGO} alt="WBC" style={{ height: 32 }} />
          <div>
            <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 18, margin: 0, fontWeight: 800 }}>WBC 2026</h1>
            <p style={{ color: K.t2, fontSize: 11, margin: 0 }}>Gaylord, MI · Aug 26–29</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ position: "relative", width: 6, height: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: syncing ? K.acc : "#22c55e" }} />
              {syncing && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: K.acc, animation: "syncPing 0.8s ease-out" }} />}
            </div>
          </div>
          <button onClick={() => setUser(null)} style={{ background: "transparent", border: `1px solid ${K.bdr}`, color: K.t3, padding: "4px 10px", borderRadius: 8, fontSize: 10, cursor: "pointer", textAlign: "center", lineHeight: 1.3 }}>
            Logout<br/><span style={{ fontSize: 9, color: K.t2, fontWeight: 600 }}>{user.name}</span>
          </button>
        </div>
      </div>

      {view !== "admin" && view !== "scoring" && view !== "leaderboard" && (
      <div style={{ display: "flex", gap: 6, padding: "10px 20px", borderBottom: `1px solid ${K.bdr}` }}>
        {[1,2,3,4].map(r => {
          const tr = tRounds.find(t => t.round_number === r);
          const c = tr ? courseList.find(cs => cs.id === tr.course_id) : null;
          return (
            <button key={r} onClick={() => setRound(r)} style={{
              flex: 1, padding: "8px 4px", fontSize: 12, fontWeight: round === r ? 700 : 500,
              color: round === r ? K.bg : K.t2,
              background: round === r ? `linear-gradient(135deg, ${K.acc}, ${K.accDim})` : K.card,
              border: `1px solid ${round === r ? "transparent" : K.bdr}`, borderRadius: 8, cursor: "pointer",
              lineHeight: 1.2,
            }}>
              <div>Rd {r}</div>
              {c && <div style={{ fontSize: 9, opacity: 0.8, marginTop: 2, whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.3 }}>
                {c.name.replace(/^treetops\s*[–-]\s*/i, "").replace(/^(.*?)\s+GC$/i, "$1").replace(/^(.*?)\s+Golf\s+Club$/i, "$1")}
              </div>}
            </button>
          );
        })}
      </div>
      )}

      <div style={{ padding: (view === "leaderboard" || view === "admin") ? "14px 20px 0 20px" : "14px 20px", paddingBottom: "calc(60px + env(safe-area-inset-bottom, 0px))", flex: 1, overflowY: (view === "leaderboard" || view === "admin") ? "hidden" : "auto", overflowX: "hidden", display: (view === "leaderboard" || view === "admin") ? "flex" : "block", flexDirection: "column", minHeight: 0 }}>
        {view === "leaderboard" && <LeaderboardView lb={getLeaderboard} round={round} holeData={holeData} tRounds={tRounds} courses={courseList} tPlayers={tPlayers} teeData={teeData} getPlayerTee={getPlayerTee} finalizedRounds={finalizedRounds} skinWins={skinWins} />}
        <div style={{ display: view === "scoring" ? "block" : "none" }}>
          <OnCourseScoring user={user} players={allPlayers} round={round} tRounds={tRounds} courses={courseList} holeData={holeData} tPlayers={tPlayers} onSaveHole={onSaveHole} notify={notify} pairingsData={pairingsData} teeData={teeData} setTee={setTee} getPlayerTee={getPlayerTee} finalizedRounds={finalizedRounds} onFinalizeRound={async key => { const nf = { ...finalizedRounds, [key]: true }; setFinalizedRounds(nf); await saveTournamentState(nf, passwords); }} onUnfinalizeRound={async key => { const nf = { ...finalizedRounds }; delete nf[key]; setFinalizedRounds(nf); await saveTournamentState(nf, passwords); }} onNavigate={setView} onGoToAdminCourses={() => { setView("admin"); setAdminSettingsOpen(true); setAdminSettingsTab("course"); }} markPlayerWD={markPlayerWD} />
        </div>
        {view === "skins" && <SkinsCtpView players={activePlayers} round={round} tRounds={tRounds} courses={courseList} holeData={holeData} ctpData={ctpData} onSetCtp={onSetCtp} user={user} teeData={teeData} getPlayerTee={getPlayerTee} />}
        {view === "groups" && <GroupsView players={activePlayers} round={round} tRounds={tRounds} courses={courseList} pairingsData={pairingsData} teeTimesData={teeTimesData} teeData={teeData} getPlayerTee={getPlayerTee} user={user} />}
        {view === "admin" && (user.isDirector ? <AdminView players={DEMO_PLAYERS} activePlayers={activePlayers} tournament={TOURNAMENT} tPlayers={tPlayers} tRounds={tRounds} courses={courseList} setCourseForRound={setCourseForRound} addCourse={addCourse} addPlayerToTournament={addPlayerToTournament} updateHI={updateHI} updateName={updateName} removePlayer={removePlayer} pairingsData={pairingsData} setPairings={setPairings} teeData={teeData} setTeeBulk={setTeeBulk} teeTimesData={teeTimesData} setTeeTimesData={async (updater) => {
              setTeeTimesData(prev => {
                const next = typeof updater === "function" ? updater(prev) : updater;
                // Fire-and-forget: update tee times on pairings rows in Supabase
                Object.keys(next).forEach(async rnd => {
                  const groups = pairingsData[rnd] || [];
                  groups.forEach(async (grp, gi) => {
                    const teeTime = (next[rnd] || [])[gi] || null;
                    grp.forEach(async pid => {
                      const row = { id: `pair_2026_r${rnd}_g${gi+1}_${pid}`, tournament_id: TOURNAMENT_ID, round_number: parseInt(rnd), group_number: gi+1, player_id: pid, tee_time: teeTime };
                      await sb.upsert("pairings", row, "id");
                    });
                  });
                });
                return next;
              });
            }} passwords={passwords} setPasswords={async pw => { setPasswords(pw); await saveTournamentState(finalizedRounds, pw); }} holeData={holeData} finalizedRounds={finalizedRounds} onFinalizeRound={async rnd => { const nf = { ...finalizedRounds, [rnd]: true }; setFinalizedRounds(nf); await saveTournamentState(nf, passwords); if (rnd < 4) setRound(rnd + 1); }} onUnfinalizeRound={async key => { const nf = { ...finalizedRounds }; delete nf[key]; setFinalizedRounds(nf); await saveTournamentState(nf, passwords); }} notify={notify} getPlayerTee={getPlayerTee} startFresh={startFresh} externalSettingsOpen={adminSettingsOpen} externalSettingsTab={adminSettingsTab} onExternalSettingsHandled={() => { setAdminSettingsOpen(false); setAdminSettingsTab("players"); }} currentUser={user} teesSaved={teesSaved} onTeesSave={async r => { const next = { ...teesSaved, [r]: true }; setTeesSaved(next); setTeesModified(prev => ({ ...prev, [r]: false })); await saveTournamentState(finalizedRounds, passwords, next); }} teesModified={teesModified} setTeesModified={setTeesModified} /> : (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: K.t1, marginBottom: 6 }}>Directors Only</div>
            <div style={{ fontSize: 12, color: K.t3 }}>Admin settings are managed by tournament directors.</div>
          </div>
        ))}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, display: "flex", background: "rgba(14,24,41,0.97)", borderTop: `1px solid ${K.bdr}`, zIndex: 100, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {navItems.map(item => {
          const active = view === item.key;
          const clr = active ? K.acc : K.t3;
          const iconSz = 18;
          const navIcon = () => {
            if (item.icon === "trophy") return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2"/>
              <path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2"/>
              <path d="M6 3h12v8a6 6 0 0 1-12 0V3z"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
            </svg>;
            if (item.icon === "pairings") return <svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M21 21v-2a3 3 0 00-2-2.83"/></svg>;
            if (item.icon === "score") return <svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>;
            if (item.icon === "betting") return <svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
            if (item.icon === "admin") return <svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
            return null;
          };
          return (
            <button key={item.key} onClick={() => {
              if (item.key === "scoring") {
                // Find the correct active round: first after consecutive finalized rounds
                let activeRound = 1;
                for (let i = 1; i <= 4; i++) {
                  if (finalizedRounds[i]) { activeRound = i + 1; } else { break; }
                }
                activeRound = Math.min(activeRound, 4);
                // Only call setRound if we actually need to change it — avoids
                // triggering the group/hole reset chain unnecessarily
                setRound(prev => prev === activeRound ? prev : activeRound);
              }
              setView(item.key);
            }} style={{
              flex: 1, padding: "10px 4px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              background: "transparent", border: "none", cursor: "pointer", color: clr, position: "relative",
            }}>
              {navIcon()}
              {item.key === "admin" && adminActionNeeded && user.isDirector && (
                <span style={{
                  position: "absolute", top: 6, right: "50%", marginRight: -14,
                  width: 8, height: 8, borderRadius: "50%", background: "#ef4444",
                  border: "2px solid rgba(14,24,41,0.97)",
                }} />
              )}
              <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, color: clr }}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
    </div>
  );
}