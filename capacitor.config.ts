import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Must match the Apple App ID / bundle ID you created (com.wannabecup.app)
  // and the Android applicationId. This is the app's native identity.
  appId: 'com.wannabecup.app',
  appName: 'WBC',

  // Capacitor bundles the built web assets from here into the native app, so
  // the app ships self-contained (not a thin wrapper around a live URL — that
  // matters for App Store Guideline 4.3 / minimum functionality). Run
  // `npm run build` before `npx cap sync` so this folder is up to date.
  webDir: 'dist',

  plugins: {
    // Takes effect once @capacitor-firebase/authentication is installed in
    // Phase B. skipNativeAuth:true means the native Google/Apple SDK only mints
    // the credential and hands it to JS — the Firebase JS SDK stays the single
    // source of truth (this is exactly what firebase.js's isNativePlatform()
    // branches expect: they call the plugin, then signInWithCredential).
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com', 'apple.com'],
    },
  },
};

export default config;
