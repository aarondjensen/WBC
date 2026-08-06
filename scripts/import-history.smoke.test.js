// ══════════════════════════════════════════════════════════════════
//  The import script runs under plain `node`.
// ══════════════════════════════════════════════════════════════════
//
// A test about the RUNTIME, not the logic — historyImport.test.js and
// historyImport.fidelity.test.js cover what the documents contain, and both
// pass under vitest whatever the script itself can or cannot do.
//
// This exists because the script shipped broken on Windows and no test noticed.
// It ran through vite-node, which is a TRANSITIVE dependency (vitest brings it
// in) whose binary npm does not reliably link — so on a clean checkout it died
// with "'vite-node' is not recognized" before reading a single row. Under
// vitest, everything was green.
//
// So: actually execute it, with the same `node` the user's npm script uses, and
// read its output. It is a dry run, so it touches no database and needs no
// credential.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const run = (args = []) =>
  execFileSync(process.execPath, [join(ROOT, "scripts", "import-history.mjs"), ...args],
    { cwd: ROOT, encoding: "utf8", timeout: 120000 });

describe("scripts/import-history.mjs", () => {
  const out = run();

  it("runs under plain node, with no bundler and no vite-node", () => {
    expect(out).toContain("DRY RUN");
  });

  it("writes nothing unless asked", () => {
    expect(out).toContain("nothing will be written");
    expect(out).not.toContain("Wrote ");
  });

  it("reports every edition and a document total", () => {
    expect(out).toMatch(/16 editions, \d+ documents\./);
    for (const year of [2010, 2012, 2016, 2022, 2025]) {
      expect(out, `year ${year} missing`).toMatch(new RegExp(`^${year}\\s`, "m"));
    }
  });

  it("names the years that hold no scores rather than leaving them looking broken", () => {
    expect(out).toContain("2010, 2011: roster only");
  });

  it("previews a real document from each collection", () => {
    for (const c of ["wbc_editions", "tournament_state", "tournament_players",
                     "courses", "tournament_rounds", "tee_assignments", "hole_scores"]) {
      expect(out, `${c} missing from the preview`).toContain(`  ${c}: {`);
    }
  });

  it("--year narrows to one edition", () => {
    const one = run(["--year", "2015"]);
    expect(one).toMatch(/1 editions?, \d+ documents\./);
    expect(one).toMatch(/^2015\s/m);
    expect(one).not.toMatch(/^2016\s/m);
  });

  // ── The credential guard ──
  // Every one of these has to fail BEFORE the run announces itself. The first
  // version printed "WRITING to Firestore" and the document counts and then a
  // raw ENOENT stack, which reads exactly like an import that got part of the
  // way in — it never had, but nothing on screen said so.
  const failWrite = (env) => {
    let err;
    try {
      execFileSync(process.execPath, [join(ROOT, "scripts", "import-history.mjs"), "--write"], {
        cwd: ROOT, encoding: "utf8", timeout: 120000,
        env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: "", FIRESTORE_EMULATOR_HOST: "", ...env },
      });
    } catch (e) { err = e; }
    expect(err, "expected a non-zero exit").toBeDefined();
    expect(err.status).toBe(1);
    // Nothing written, and nothing that LOOKS like it might have been.
    expect(String(err.stdout)).not.toContain("Wrote ");
    expect(String(err.stdout)).not.toContain("WRITING to Firestore");
    expect(String(err.stdout)).not.toMatch(/\d+ editions, \d+ documents/);
    return String(err.stderr);
  };

  it("refuses --write with no credential, before announcing anything", () => {
    const stderr = failWrite({});
    expect(stderr).toContain("GOOGLE_APPLICATION_CREDENTIALS is not set");
    expect(stderr).toContain("Nothing was written");
  });

  it("refuses a credential path that does not exist", () => {
    const stderr = failWrite({ GOOGLE_APPLICATION_CREDENTIALS: join(ROOT, "no-such-key.json") });
    expect(stderr).toContain("Can't read the service-account key");
    expect(stderr).toContain("no file at that path");
    expect(stderr).toContain("Nothing was written");
  });

  it("refuses a file that is not JSON", () => {
    // A REAL file holding non-JSON. Pointing at a path that does not exist
    // would pass this test through the ENOENT branch instead, which is a
    // different guard and already covered above.
    const junk = join(tmpdir(), "wbc-not-a-key.txt");
    writeFileSync(junk, "this is not json\n");
    try {
      const stderr = failWrite({ GOOGLE_APPLICATION_CREDENTIALS: junk });
      expect(stderr).toContain("not valid JSON");
      expect(stderr).toContain("Nothing was written");
    } finally { rmSync(junk, { force: true }); }
  });

  it("refuses a JSON file that is not a service-account key", () => {
    // package.json is valid JSON and carries none of the fields a key has.
    const stderr = failWrite({ GOOGLE_APPLICATION_CREDENTIALS: join(ROOT, "package.json") });
    expect(stderr).toContain("not a service-account key");
    expect(stderr).toContain("project_id");
    expect(stderr).toContain("Nothing was written");
  });
});
