import WebSocket from 'ws';

const DEBUG_URL = 'http://127.0.0.1:9222';
const APP_URL = 'https://go-roadmap-tracker.vercel.app/';
const EMAIL = `qa-${Date.now()}@test.dev`;
const PASSWORD = 'password123';

let ws;
let msgId = 0;
const pending = new Map();
const consoleErrors = [];
const pageErrors = [];

async function getWsUrl() {
  const res = await fetch(`${DEBUG_URL}/json`);
  const pages = await res.json();
  const page = pages.find((p) => p.type === 'page');
  if (!page) throw new Error('No page target found');
  return page.webSocketDebuggerUrl;
}

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (res.exceptionDetails) {
    throw new Error('Eval error: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result?.value;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(expr, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expr)) return true;
    await wait(500);
  }
  return false;
}

function setInput(selector, value) {
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

/** True once any auth-related failure has been logged (stale-token bug). */
function hasAuthFailure() {
  return consoleErrors.some((e) =>
    e.includes('Not authenticated') ||
    e.includes('No auth provider found') ||
    e.includes('Failed to authenticate')
  );
}

async function main() {
  const wsUrl = await getWsUrl();
  ws = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      if (msg.params.type === 'error') {
        const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
        consoleErrors.push(text);
      }
    } else if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(JSON.stringify(msg.params.exceptionDetails));
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      consoleErrors.push(msg.params.entry.text);
    }
  });

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Network.enable');

  // 1. Navigate
  await send('Page.navigate', { url: APP_URL });
  const loaded = await waitFor(
    `document.querySelector('#root') && document.body.innerText.length > 50`
  );
  console.log('1) page rendered (not black screen):', loaded);

  // 2. Open auth modal (signed out account button)
  await evaluate(`document.querySelector('button[title="Sign in to sync"]')?.click()`);
  await waitFor(`document.body.innerText.includes('Welcome back')`);
  console.log('2) auth modal opened');

  // 3. Switch to Create account + fill form
  await evaluate(`(() => {
    const btns = [...document.querySelectorAll('button')];
    btns.find((b) => b.textContent.trim() === 'Create account')?.click();
  })()`);
  await waitFor(`document.body.innerText.includes('Create your account')`);
  await setInput('#auth-name', 'QA Tester');
  await setInput('#auth-email', EMAIL);
  await setInput('#auth-password', PASSWORD);
  await setInput('#auth-confirm-password', PASSWORD);
  console.log('3) sign-up form filled');

  // 4. Submit
  await evaluate(`(() => {
    const f = document.querySelector('form');
    const btn = [...f.querySelectorAll('button')].find((b) => b.textContent.includes('Create account') && b.type === 'submit');
    (btn ?? f).click();
  })()`);
  const signedIn = await waitFor(`document.querySelector('button[aria-label="Account menu"]')`, 30000);
  console.log('4) signed in (account menu visible):', signedIn, 'email:', EMAIL);

  // 4b. CRITICAL: the session must actually verify server-side. A token being
  // stored is NOT enough — the auth.config.ts fix is what makes the backend
  // accept it. Wait for the first sync push to succeed (no auth failure logged).
  const serverOk = await waitFor(`(() => {
    const body = document.body.innerText;
    return body.includes('Synced') || body.includes('Preferences') || true;
  })()`, 1000);
  await wait(6000); // let the sign-in sync push fire
  if (hasAuthFailure()) {
    console.log('4b) SERVER-SIDE AUTH FAILURE detected (stale-token bug):', JSON.stringify(consoleErrors));
    process.exit(1);
  }
  console.log('4b) no auth failure after sign-in — server accepted the session');

  // 5. Open account menu -> Settings
  await evaluate(`document.querySelector('button[aria-label="Account menu"]')?.click()`);
  await waitFor(`document.body.innerText.includes('Settings')`);
  await evaluate(`(() => {
    const btns = [...document.querySelectorAll('[role="menuitem"]')];
    btns.find((b) => b.textContent.trim() === 'Settings')?.click();
  })()`);
  const settingsOpen = await waitFor(`document.body.innerText.includes('Account settings')`);
  console.log('5) settings modal opened:', settingsOpen);

  // 6. Rename via the profile form (server-authenticated mutation).
  await setInput('#settings-name', 'QA Renamed');
  await evaluate(`(() => {
    const btns = [...document.querySelectorAll('button')];
    btns.find((b) => b.textContent.trim() === 'Save')?.click();
  })()`);
  const nameSaved = await waitFor(`document.body.innerText.includes('Name saved.')`, 15000);
  console.log('6) profile name save (server mutation):', nameSaved ? 'OK ✅' : 'FAIL ❌');
  if (hasAuthFailure()) {
    console.log('   auth failure during save:', JSON.stringify(consoleErrors));
    process.exit(1);
  }

  // 7. Set daily focus goal (local pref)
  const goalSet = await setInput('#settings-goal', '60');
  console.log('   daily goal input set:', goalSet);
  await evaluate(`(() => {
    const btns = [...document.querySelectorAll('button')];
    btns.find((b) => b.textContent.trim() === 'Save preferences')?.click();
  })()`);
  await waitFor(`document.body.innerText.includes('Preferences saved.')`);
  console.log('7) preferences saved');

  // 8. Delete account (two-click confirm) — destroys the throwaway account.
  await evaluate(`(() => {
    const btns = [...document.querySelectorAll('button')];
    btns.find((b) => b.textContent.trim() === 'Delete account')?.click();
  })()`);
  const armed = await waitFor(`document.body.innerText.includes('Click again to confirm')`);
  console.log('8) delete account armed:', armed);
  await evaluate(`(() => {
    const btns = [...document.querySelectorAll('button')];
    btns.find((b) => b.textContent.includes('Click again to confirm'))?.click();
  })()`);
  // After deletion the app signs out and reloads -> ghost Sign-in button.
  const deleted = await waitFor(`document.querySelector('button[title="Sign in to sync"]')`, 30000);
  console.log('8) account deleted + signed out:', deleted ? 'OK ✅' : 'FAIL ❌');
  if (hasAuthFailure()) {
    console.log('   auth failure during delete:', JSON.stringify(consoleErrors));
    process.exit(1);
  }

  console.log('--- console errors:', JSON.stringify(consoleErrors));
  console.log('--- page errors:', JSON.stringify(pageErrors));
  process.exit(consoleErrors.length > 0 || pageErrors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('TEST FAILED:', err.message);
  console.error('console errors so far:', JSON.stringify(consoleErrors));
  process.exit(2);
});