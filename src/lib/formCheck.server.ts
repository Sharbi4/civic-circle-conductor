/** Opens a form's public link like a visitor would and confirms the title and every question render. */
export async function verifyPublicForm(origin: string, id: string, title: string, questions: { q: string }[]): Promise<{ ok: true } | { ok: false; reason: string }> {
  let res: Response;
  try {
    res = await fetch(`${origin}/p/${id}`, { headers: { accept: "text/html" }, signal: AbortSignal.timeout(12000) });
  } catch (e) {
    return { ok: false, reason: `the link didn't open (${e instanceof Error ? e.message : "network error"})` };
  }
  if (!res.ok) return { ok: false, reason: `the link returned an error (${res.status})` };
  const html = (await res.text())
    .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/<!--.*?-->/g, "");
  const norm = (t: string) => t.replace(/\s+/g, " ").trim();
  const page = norm(html);
  if (!page.includes(norm(title))) return { ok: false, reason: "the form title didn't show on the page" };
  const missing = questions.filter((q) => !page.includes(norm(q.q)));
  if (missing.length) return { ok: false, reason: `${missing.length} question(s) didn't load, e.g. "${missing[0]!.q}"` };
  return { ok: true };
}
