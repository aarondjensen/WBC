import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Unit tests only. firestore.rules.test.mjs is an INTEGRATION test — it
    // needs the Firestore emulator listening on 127.0.0.1:8080 and fails with
    // ECONNREFUSED without it, which would make `npm test` red by default and
    // train everyone to ignore it.
    //
    // Run the rules suite deliberately, with the emulator up:
    //   firebase emulators:exec --only firestore "npx vitest run firestore.rules.test.mjs"
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
})
