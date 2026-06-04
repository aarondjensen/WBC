# WBC Historical Data — Guide for Analysis

This project contains the complete recorded history of the **Wannabe Cup (WBC)** — an annual stroke-play golf tournament played among a rotating cast of ~6–12 players since 2010. The data spans 16 tournaments (2010–2025). This guide describes the four data files, schema details, caveats, and how to query them effectively.

---

## How to query reliably

**ALWAYS load the CSVs with code and compute against every row.** Don't estimate or summarize from memory. Even a small question like "how many birdies did Brian K make in 2024" should be answered by running pandas over `holes.csv`, not by eyeballing.

When the user asks a question, the workflow is:

1. Load the relevant CSV(s) with `pd.read_csv`
2. Filter / group / aggregate to compute the exact answer
3. Print the result and provide a brief narrative

For questions involving running totals, position changes, or streaks across rounds, you may need to compute derived state (e.g., cumulative net through each hole, leader after each round). Do this in code, not in your head.

---

## The four files

### `tournaments.csv` — one row per WBC (16 rows)

| Column | Description |
|---|---|
| `year` | Tournament year (2010–2025) |
| `num_rounds` | Number of stroke-play rounds (usually 4; 2010, 2011, 2022 were 3) |
| `num_players` | Number of participants |
| `courses` | Course names in round order, separated by " / " |
| `champion` | Winner's canonical name |
| `champion_net_total` | Winner's total net score (sum across all rounds) |
| `champion_net_vs_par` | Winner's net total minus sum of course pars |
| `has_detailed_data` | `True` for years with hole-by-hole data; `False` for 2010–2011 |

**Note:** 2010 and 2011 have champion + roster + course info only. No round or hole scores exist for those years. When answering questions that need scoring detail, exclude these years and say so.

### `rounds.csv` — one row per (year, round, player), 434 rows

| Column | Description |
|---|---|
| `year`, `round` | Round identifier (round is 1–4) |
| `player` | Canonical player name |
| `course` | Course played that round |
| `course_handicap` | Player's handicap for that round at that course's tees |
| `gross_total` | Total gross strokes for the round (18 holes) |
| `net_total` | Total net strokes after handicap |
| `net_vs_par` | Net total relative to course par for that round |
| `eagles`, `birdies`, `pars`, `bogies`, `doubles` | Hole count by gross-vs-par bucket (`doubles` is 2-over or worse) |
| `net_pars_or_better` | Count of holes where net ≤ par |

For 2010–2011 skeleton rows, only `year` and `player` are populated — used to capture career appearances.

### `holes.csv` — one row per (year, round, hole, player), 7,632 rows

| Column | Description |
|---|---|
| `year`, `round`, `hole` | Identifiers (hole is 1–18) |
| `player`, `course` | Player and course |
| `par` | Par of that specific hole |
| `hole_index` | Hole's handicap rank on that course (1 = hardest, 18 = easiest) |
| `segment` | "front" (holes 1–9) or "back" (holes 10–18) |
| `gross` | Strokes taken on that hole |
| `net` | Gross minus any strokes received |
| `net_vs_par` | Net score relative to par (negative = under par) |
| `strokes_received` | Handicap strokes received on that hole (usually 0 or 1) |

### `courses.csv` — one row per (year, round, course), 55 rows

| Column | Description |
|---|---|
| `year`, `round`, `course` | Identifiers |
| `rating`, `slope`, `par` | Standard course rating values (par is for the actual tees played, not always 72) |
| `hole_pars` | Comma-separated 18 values |
| `hole_handicaps` | Comma-separated 18 values (1 = hardest hole, 18 = easiest) |
| `real_hole_handicaps` | `True` if real handicaps were in the source data; `False` if defaulted to 1–18 in order |

---

## Important caveats

### Hole handicaps are approximate for 9 years

For **2014, 2015, 2023, 2024, 2025** the source spreadsheets contain real hole-handicap rankings (the `Handi` row), so per-hole `strokes_received` and `net` values are accurate.

For **2012, 2013, 2016–2022** the source spreadsheets do not include hole handicaps. The data uses a default 1–18 ranking in hole number order. This means:

- **Round-level totals (`gross_total`, `net_total`, `net_vs_par`, etc.) are still correct** — they come from the spreadsheet's NET column.
- **Hole-level `net_vs_par` is approximate** — the right *number* of strokes are given out, but they may be allocated to the wrong holes.

When a user asks a question that depends on hole-level net (e.g., "most net birdies on par 3s"), filter to years where `real_hole_handicaps == True` for the cleanest answer, OR caveat that the result is approximate for older years. For hole-level **gross** questions (eagles, hole-in-ones, lowest gross score on hole 7, etc.), all years are accurate.

### 2024 champion net vs par

The 2024 champion (Aaron J) shows `net_vs_par = -4`, but the 2024 leaderboard sheet says `-5`. This is because Binder Park P/N is par 71 in the spreadsheet but the official leaderboard treated it as par 72. The individual round totals match — only the "vs par" baseline differs by 1 stroke.

### Missing rounds for some players

A few players didn't complete every round of a given tournament (work, injury, WD). Examples:

- Aaron J played only 1 round in 2016
- John C played only 3 rounds in 2025
- Matt V was on the 2016 roster but didn't post any scores

These show up as fewer than `num_rounds` entries for that player in `rounds.csv` and as missing hole records in `holes.csv`. When computing things like "rounds completed" or "tournaments finished," account for this — don't assume every player has 4 rounds per year.

### Tournament 2010 and 2011

Champion (Bob B), roster, and courses are known. **No round or hole data exists.** Career appearance counts in `rounds.csv` include skeleton rows for those years (year + player only) so that "how many WBCs has X played" comes out right. Don't try to compute scoring stats for these years.

---

## Player roster (canonical names)

Every player goes by `FirstName LastInitial` form. The historical Excel files sometimes used 2-letter initials; those have been resolved to canonical names in all CSVs.

| Player | Canonical | First year | Notes |
|---|---|---|---|
| AJ | Aaron J | 2011 | |
| AV | Andy V | 2019 | |
| BB | Bob B | 2010 | Only player with appearances in all 16 years |
| BK | Brian K | 2010 | Most championships (5: 2016, 2017, 2020, 2021, 2022) |
| DK | Dave K | 2017 | |
| EO | Eric O | 2010 | |
| JB | Jeff B | 2017 | |
| JC | John C | 2019 | |
| JS | Joe S | 2023 | 2025 champion |
| MV | Matt V | 2010 | |
| RH | Ray H | 2025 | |
| RW | Russ W | 2022 | |
| SR | Scott R | 2011 | |
| SV | Steve V | 2017 | Single appearance |

---

## Tournament structure

- Stroke play, individual, net scoring with handicaps.
- Usually 4 rounds at 4 different courses. Exceptions: 2010, 2011 (3 rounds at PGA Village Port St Lucie), 2022 (3 rounds, weather-shortened).
- Players use their **course handicap** for that round, which depends on their handicap index and the specific tees they played from.
- Champion = lowest cumulative net total across all rounds (must complete every round; players with WDs are not eligible).

---

## Example queries and how to handle them

**"What's the lowest net round ever?"**
→ `rounds.csv`: `df.nsmallest(5, 'net_total')` (or `nsmallest(5, 'net_vs_par')` if "lowest relative to par" is meant). Report player, year, course, and the score.

**"Who has the most career birdies?"**
→ `holes.csv`: `df[df['net_vs_par'] == -1].groupby('player').size().sort_values(ascending=False)`. Or use gross birdies: `df[df['gross'] - df['par'] == -1]`. Make a judgment call about gross vs net based on the question; mention both if ambiguous.

**"What's the longest streak of par-or-better holes?"**
→ Hardest one. `holes.csv` sorted by `(player, year, round, hole)`, then iterate computing a running streak per player where `gross - par <= 0` (or `net_vs_par <= 0`). Capture max streak with start/end context (which tournament, which hole).

**"How many times has Brian K led at the end of a round?"**
→ For each (year, round), compute cumulative net per player through that round, find the leader. Then count how often Brian K is that leader. Watch for ties — handle them explicitly. Exclude 2010/2011 (no round data).

**"Who has played in every WBC?"**
→ `rounds.csv`: `df.groupby('player')['year'].nunique()` and find players with count = 16. (Hint: there's exactly one.)

**"Biggest comeback ever?"**
→ For each tournament, compute each player's deficit-to-leader after each round (cumulative net so far minus leader's cumulative net). The biggest comeback is the player who was furthest behind at some intermediate point but ended up winning. Exclude 2010/2011.

**"Closest finish ever?"**
→ For each tournament with detailed data, get the gap between champion and runner-up by net total. Report the smallest.

**"Best player at Treetops?"**
→ Filter `rounds.csv` to courses where `'Treetops' in course` or specific course names ("THE TRIBUTE", "THE PREMIER", "THE LOON", "THE LAKES", "THE SIGNATURE", "THE MASTERPIECE" are all Treetops). Group by player, compute average net or net_vs_par. Note that course names sometimes appear in different forms across years (e.g., "WANAMAKER" appears in 2010, 2011, and twice in 2012).

---

## When in doubt

- Run the calculation. Show the code briefly if it's interesting.
- Mention caveats (approximate hole HCPs for older years, missing 2010/2011 detail) only when relevant to the specific answer.
- If a question is ambiguous (gross vs net, includes 2010/11 or not), pick the most useful interpretation and say so.
- Player names are case-sensitive in the CSVs. Always match the canonical form.
