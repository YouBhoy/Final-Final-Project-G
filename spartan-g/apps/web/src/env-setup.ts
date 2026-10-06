/**
 * Web-only env bootstrap (Vite).
 *
 * Sets `globalThis.__SPARTAN_ENV__` to Vite's `import.meta.env` so that
 * `@spartan-g/shared-services` can read `VITE_*` variables without referencing
 * the `import.meta` token itself (which Hermes, Expo's release-build JS engine,
 * cannot compile). This module must be imported FIRST in `main.tsx` so it runs
 * before any shared-services module is evaluated.
 */
(globalThis as { __SPARTAN_ENV__?: Record<string, string | undefined> }).__SPARTAN_ENV__ =
  import.meta.env;