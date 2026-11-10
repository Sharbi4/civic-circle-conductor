// Drives a remote Chromium (Browserbase) over the Chrome DevTools Protocol.
type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

export type PageState = {
  url: string;
  title: string;
  text: string;
  elements: { i: number; tag: string; type?: string; label: string }[];
};

export type AgentAction =
  | { action: "navigate"; url: string; reason?: string }
  | { action: "click"; index: number; reason?: string }
  | { action: "type"; index: number; text: string; reason?: string }
  | { action: "select"; index: number; value: string; reason?: string }
  | { action: "press_enter"; index: number; reason?: string }
  | { action: "scroll"; reason?: string }
  | { action: "submit"; index: number; reason?: string }
  | { action: "request_approval"; title: string; details: string; reason?: string }
  | { action: "login"; username_index: number; password_index: number; reason?: string }
  | { action: "done"; summary: string; reason?: string };

const SNAPSHOT = `(() => {
  const sel = 'a[href],button,input:not([type=hidden]),textarea,select,[role=button],[role=link],[contenteditable=true]';
  document.querySelectorAll('[data-civi-idx]').forEach(e => e.removeAttribute('data-civi-idx'));
  const out = []; let i = 0;
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight * 2.5) continue;
    const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.display === 'none') continue;
    el.setAttribute('data-civi-idx', String(i));
    const lbl = (el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.innerText || (el.type === 'password' ? '' : el.value) || el.getAttribute('name') || el.getAttribute('href') || '';
    out.push({ i, tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || undefined, label: String(lbl).replace(/\\s+/g,' ').trim().slice(0, 90) });
    if (++i >= 70) break;
  }
  return { url: location.href, title: document.title, text: (document.body ? document.body.innerText : '').replace(/\\s+/g,' ').slice(0, 2000), elements: out };
})()`;

const el = (i: number) => `document.querySelector('[data-civi-idx="${Number(i)}"]')`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withPage<T>(connectUrl: string, fn: (p: {
  eval: (expr: string) => Promise<any>;
  send: (method: string, params?: object) => Promise<any>;
}) => Promise<T>): Promise<T> {
  const ws = new WebSocket(connectUrl);
  const pending = new Map<number, Pending>();
  let nextId = 1;
  await new Promise<void>((res, rej) => {
    ws.addEventListener("open", () => res());
    ws.addEventListener("error", () => rej(new Error("Couldn't connect to the browser")));
  });
  ws.addEventListener("message", (ev: MessageEvent) => {
    const msg = JSON.parse(typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer));
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)!; pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    }
  });
  const raw = (method: string, params: object = {}, sessionId?: string) =>
    new Promise<any>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      setTimeout(() => { if (pending.delete(id)) reject(new Error(`Browser timed out on ${method}`)); }, 20000);
    });
  try {
    const { targetInfos } = await raw("Target.getTargets");
    let target = (targetInfos as any[]).find((t) => t.type === "page");
    if (!target) target = { targetId: (await raw("Target.createTarget", { url: "about:blank" })).targetId };
    const { sessionId } = await raw("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    const send = (m: string, p?: object) => raw(m, p ?? {}, sessionId);
    const evaluate = async (expression: string) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "Script error");
      return r.result?.value;
    };
    return await fn({ eval: evaluate, send });
  } finally {
    try { ws.close(); } catch { /* ignore */ }
  }
}

export async function snapshot(p: { eval: (e: string) => Promise<any> }): Promise<PageState> {
  return (await p.eval(SNAPSHOT)) as PageState;
}

/** Executes one action; returns a short human-readable result. */
export async function perform(p: { eval: (e: string) => Promise<any>; send: (m: string, x?: object) => Promise<any> }, a: AgentAction): Promise<string> {
  switch (a.action) {
    case "navigate": {
      const url = /^https?:\/\//.test(a.url) ? a.url : `https://${a.url}`;
      await p.send("Page.navigate", { url });
      await sleep(3000);
      return `Opened ${url}`;
    }
    case "click":
    case "submit": {
      const ok = await p.eval(`(() => { const e = ${el(a.index)}; if (!e) return false; e.scrollIntoView({block:'center'}); e.click(); return true; })()`);
      if (!ok) return `Couldn't find element ${a.index}`;
      await sleep(2500);
      return a.action === "submit" ? "Submitted the form" : `Clicked element ${a.index}`;
    }
    case "type":
    case "select": {
      const val = a.action === "type" ? a.text : a.value;
      const ok = await p.eval(`(() => { const e = ${el(a.index)}; if (!e) return false; e.focus();
        const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        const set = Object.getOwnPropertyDescriptor(proto, 'value'); if (set && set.set) set.set.call(e, ${JSON.stringify(val)}); else e.value = ${JSON.stringify(val)};
        e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); return true; })()`);
      return ok ? `Filled element ${a.index}` : `Couldn't find element ${a.index}`;
    }
    case "press_enter": {
      await p.eval(`(() => { const e = ${el(a.index)}; if (e) e.focus(); })()`);
      await p.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
      await p.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await sleep(3000);
      return "Pressed Enter";
    }
    case "scroll":
      await p.eval("window.scrollBy(0, innerHeight * 0.8)");
      await sleep(800);
      return "Scrolled down";
    default:
      return "";
  }
}

/** Fills a saved login into the page. The password never leaves the server or reaches the AI. */
export async function fillLogin(p: { eval: (e: string) => Promise<any> }, userIdx: number, passIdx: number, creds: { username: string; password: string }) {
  const fill = (i: number, v: string) => `(() => { const e = ${el(i)}; if (!e) return false; e.focus();
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); set.set.call(e, ${JSON.stringify(v)});
    e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); return true; })()`;
  const a = await p.eval(fill(userIdx, creds.username));
  const isPw = await p.eval(`(() => { const e = ${el(passIdx)}; return !!e && e.getAttribute('type') === 'password'; })()`);
  if (!isPw) return a ? "Filled the username (no password box found yet)" : "Couldn't find the login fields";
  const b = await p.eval(fill(passIdx, creds.password));
  return a && b ? "Filled in your saved login" : "Couldn't find the login fields";
}

export function parseAction(text: string): AgentAction | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { const a = JSON.parse(m[0]); return a && typeof a.action === "string" ? a : null; } catch { return null; }
}
