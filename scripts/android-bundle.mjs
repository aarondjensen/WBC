// ══════════════════════════════════════════════════════════════════
//  android-bundle — the release AAB, from any shell.
// ══════════════════════════════════════════════════════════════════
//
//   npm run android:bundle
//
// Wraps three commands that are individually simple and collectively a trap
// for anybody not in bash:
//
//   npm run build && npx cap sync android && cd android && ./gradlew bundleRelease
//
// `&&` is not a statement separator in Windows PowerShell 5.1, and `./gradlew`
// is a shell script that Windows cannot run — it wants `gradlew.bat`. This
// repo has a Windows developer and the docs kept being written in bash, twice
// producing a paste that failed on the first character. An npm script sidesteps
// the whole question: node spawns the right wrapper for the platform and the
// shell never gets a say.
//
// It also front-loads the check that Gradle only whispers. A release build with
// no signing configured SUCCEEDS and emits an unsigned bundle; the warning
// scrolls past in a hundred lines of Gradle output, and Play is where you find
// out. This refuses before building instead.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ANDROID = join(ROOT, "android");
const isWindows = process.platform === "win32";

const die = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };

const run = (cmd, args, opts = {}) => {
  console.log(`\n  › ${cmd} ${args.join(" ")}`);
  // shell:true on Windows so `npm`/`npx` resolve through their .cmd shims,
  // which node will not find otherwise.
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: isWindows, ...opts });
  if (r.status !== 0) die(`\`${cmd} ${args.join(" ")}\` exited ${r.status ?? "abnormally"}.`);
};

if (!existsSync(ANDROID)) die("there is no android/ directory. Run `npx cap add android` first.");

// ── Is this going to come out signed? ───────────────────────────────
// Either keystore.properties has all four values or the environment does.
// Checked here rather than trusted to Gradle's warning, because an unsigned
// AAB is indistinguishable from a signed one until Play rejects it.
const ENV_KEYS = ["WBC_KEYSTORE_FILE", "WBC_KEYSTORE_PASSWORD", "WBC_KEY_ALIAS", "WBC_KEY_PASSWORD"];
const fromEnv = ENV_KEYS.every((k) => (process.env[k] || "").trim());

const propsPath = join(ANDROID, "keystore.properties");
let fromFile = false;
let keystoreMissing = null;
if (existsSync(propsPath)) {
  const props = Object.fromEntries(
    readFileSync(propsPath, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
  fromFile = ["storeFile", "storePassword", "keyAlias", "keyPassword"].every((k) => props[k]);
  // A relative storeFile resolves against android/, matching build.gradle.
  if (fromFile) {
    const p = join(ANDROID, props.storeFile);
    if (!existsSync(p) && !existsSync(props.storeFile)) keystoreMissing = props.storeFile;
  }
}

if (!fromEnv && !fromFile) {
  die("no release signing configured, so this would build an UNSIGNED bundle that Play refuses.\n"
    + "  Create a keystore and fill in android/keystore.properties:\n\n"
    // One line, no backslash continuation: that is bash, and it is a parse
    // error in PowerShell — which is where this message is most likely to be
    // read and pasted.
    + "      keytool -genkey -v -keystore android/wbc.keystore -alias wbc -keyalg RSA -keysize 2048 -validity 10000\n\n"
    + "  Then copy android/keystore.properties.example to android/keystore.properties\n"
    + `  and fill it in — or set ${ENV_KEYS.join(", ")}.`);
}
if (keystoreMissing) {
  die(`keystore.properties names \`${keystoreMissing}\`, and there is no file there.\n`
    + "  The path is resolved relative to android/. A key sitting beside\n"
    + "  keystore.properties is just its filename.");
}

console.log(`\n  Signing: ${fromEnv ? "environment variables" : "android/keystore.properties"}`);

// ── Will Google sign-in work in this bundle? ────────────────────────
// google-services.json carries a `certificate_hash` per registered SHA-1, and
// Google checks the signing certificate server-side. A release build whose
// certificate is not among them has a Google sign-in that fails — while the
// build succeeds, installs, and looks perfect.
//
// This repo shipped exactly that and nobody could have noticed: the file
// committed in July carried ONE hash, and it was the DEBUG keystore's. Sign-in
// worked in `npx cap run android` on the machine holding that key and would
// have failed for all sixteen testers.
//
// A correct release setup has TWO release certificates registered: the upload
// key, which a local release build presents, and Play's app signing key, which
// an installed app presents — Play re-signs, so they are different
// certificates and both have to be there. The debug key is a third, harmless
// and irrelevant to a release.
//
// So this counts the hashes that are NOT the debug key. It cannot tell which
// key each one is — the file records fingerprints, not names — so it prints
// them and leaves the reading to a human.
const SERVICES = join(ANDROID, "app", "google-services.json");
if (!existsSync(SERVICES)) {
  die("there is no android/app/google-services.json, so this bundle would ship\n"
    + "  with NO Google sign-in and NO Firebase at all.\n\n"
    + "  Firebase console → Project settings → the Android app (com.wannabecup.app)\n"
    + "  → download google-services.json → android/app/.");
}

const hashes = [...new Set(
  [...readFileSync(SERVICES, "utf8").matchAll(/"certificate_hash"\s*:\s*"([0-9a-fA-F]+)"/g)]
    .map((m) => m[1].toLowerCase())
)];

// The debug keystore's password is the literal string "android" — a documented
// constant, not a secret — so this one fingerprint can be computed without
// putting a real password on a command line. If keytool is not on PATH, the
// subtraction is skipped and the count is simply less precise.
let debugHash = null;
{
  const home = process.env.USERPROFILE || process.env.HOME;
  const debugStore = home && join(home, ".android", "debug.keystore");
  if (debugStore && existsSync(debugStore)) {
    const r = spawnSync("keytool", ["-list", "-v", "-keystore", debugStore,
      "-storepass", "android", "-alias", "androiddebugkey"], { encoding: "utf8", shell: isWindows });
    const m = /SHA1:\s*([0-9A-F:]+)/i.exec(r.stdout || "");
    if (m) debugHash = m[1].replace(/:/g, "").toLowerCase();
  }
}

const release = hashes.filter((h) => h !== debugHash);
const label = (h) => `${h}${h === debugHash ? "   ← debug keystore, does nothing for a release" : ""}`;

if (release.length < 2 && !process.env.WBC_FIRST_UPLOAD) {
  die("google-services.json does not carry the certificates a release needs.\n\n"
    + `  It has ${hashes.length || "no"} certificate hash${hashes.length === 1 ? "" : "es"}:\n`
    + (hashes.length ? hashes.map((h) => `      ${label(h)}\n`).join("") : "")
    + "\n  A release needs TWO, and neither is the debug key:\n"
    + "      • your upload key   — what a local release build presents\n"
    + "      • Play's app signing key — what an INSTALLED app presents, because\n"
    + "        Play re-signs the bundle with its own certificate\n\n"
    + "  keytool -list -v -keystore C:/dev/keys/wbc-upload.jks     (the upload key)\n"
    + "  Play Console → Protected with Play → App signing            (Play's, under\n"
    + "      *Classical key* — NOT the Digital Asset Links JSON on that page, which\n"
    + "      quotes a different fingerprint entirely)\n\n"
    + "  Add both pairs in Firebase → Project settings → the Android app → Add\n"
    + "  fingerprint, THEN re-download google-services.json — the file is generated\n"
    + "  at download time and a copy taken before a fingerprint was added does not\n"
    + "  contain it.\n\n"
    + "  If this really is the first upload — the throwaway that MINTS Play's\n"
    + "  certificate, which cannot exist yet — set WBC_FIRST_UPLOAD=1 and build.");
}

console.log(`  Certificates: ${release.length} release`
  + `${debugHash && hashes.includes(debugHash) ? " + debug" : ""} in google-services.json`);

run("npm", ["run", "build"]);
run("npx", ["cap", "sync", "android"]);
// `gradlew.bat` on Windows, `./gradlew` everywhere else — the actual thing the
// shell difference was about.
run(isWindows ? "gradlew.bat" : "./gradlew", ["bundleRelease"], { cwd: ANDROID });

const aab = join(ANDROID, "app", "build", "outputs", "bundle", "release", "app-release.aab");
if (!existsSync(aab)) {
  die("Gradle finished but there is no bundle at\n"
    + `  ${aab}\n`
    + "  Check the output above for what it built instead.");
}
const mb = (readFileSync(aab).length / 1024 / 1024).toFixed(1);
console.log(`\n  ✓ ${aab}`);
console.log(`    ${mb} MB, signed. Upload it to Play → Testing → Internal testing.\n`);
console.log("    Remember: versionCode in android/app/build.gradle must go up");
console.log("    before the NEXT upload. Play refuses a re-used one.\n");
