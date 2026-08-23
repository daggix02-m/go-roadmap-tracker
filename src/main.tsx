import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './index.css';
import App from './App.tsx';

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
