import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './index.css';
import App from './App.tsx';

// ---------------------------------------------------------------------------
// Stale-deployment recovery
//
// Vite content-hashes every chunk (assets/<Name>-<hash>.js). After a deploy,
// the old hashes disappear from the server. A tab opened before the deploy
// still runs the OLD index.html and requests chunks that now 404 — the
// classic "Failed to fetch dynamically imported module" crash (the service
// worker's network-first navigation only fixes the NEXT navigation). When
// that happens, reload once to pick up the new index.html. Guarded so a
// genuinely broken deployment can't cause an infinite reload loop.
// ---------------------------------------------------------------------------
const LAST_RELOAD_KEY = 'plan_tracker_last_stale_reload';
const RELOAD_COOLDOWN_MS = 15_000;

function reloadIfStale() {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(LAST_RELOAD_KEY) ?? 0);
    sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable (private mode etc.) — just reload.
  }
  if (Date.now() - last < RELOAD_COOLDOWN_MS) return; // avoid reload loops
  window.location.reload();
}

// Fired by Vite when a chunk loaded through its preload helper fails
// (covers all React.lazy() routes, including the modals).
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  reloadIfStale();
});

// Backstop for dynamic imports that fail outside Vite's preload helper.
window.addEventListener(
  'error',
  (event) => {
    if ((event.message ?? '').includes('Failed to fetch dynamically imported module')) {
      event.preventDefault();
      reloadIfStale();
    }
  },
  true
);

const convexUrl = import.meta.env.VITE_CONVEX_URL as string;

if (!convexUrl) {
  document.getElementById('root')!.innerHTML =
    '<div style="padding:2rem;font-family:monospace;color:#f87171">' +
    '<h1>Missing VITE_CONVEX_URL</h1>' +
    '<p>Set it in Vercel → Settings → Environment Variables (Production scope) and redeploy.</p></div>';
} else {
  const convex = new ConvexReactClient(convexUrl);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ConvexAuthProvider client={convex}>
        <App />
      </ConvexAuthProvider>
    </StrictMode>
  );
}
