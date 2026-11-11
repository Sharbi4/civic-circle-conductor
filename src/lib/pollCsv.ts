import type { PollQuestion } from "@/lib/polls.shared";

type Resp = { answers: unknown; created_at: string };
const cell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // keep spreadsheets from running formulas
  return `"${s.replace(/"/g, '""')}"`;
};
/** Column headers + per-response values; contact questions split into name / email / phone. */
function build(questions: PollQuestion[]) {
  return questions.flatMap((q) =>
    q.type === "contact"
      ? (["name", "email", "phone"] as const).map((k) => ({ h: `${q.q} (${k})`, v: (ans: Record<string, unknown>) => { const a = ans[q.id]; return a && typeof a === "object" ? (a as Record<string, unknown>)[k] : ""; } }))
      : [{ h: q.q, v: (ans: Record<string, unknown>) => { const a = ans[q.id]; return Array.isArray(a) ? a.join("; ") : a; } }],
  );
}

export function responsesToCsv(questions: PollQuestion[], responses: Resp[], extra?: { form: string; kind: string }) {
  const cols = build(questions);
  const head = [...(extra ? ["Form", "Type"] : []), "Submitted", ...cols.map((c) => c.h)];
  const rows = [...responses].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((r) => {
    const ans = (r.answers ?? {}) as Record<string, unknown>;
    return [...(extra ? [extra.form, extra.kind] : []), new Date(r.created_at).toLocaleString("en-US"), ...cols.map((c) => c.v(ans))];
  });
  return [head, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}

export function downloadCsv(text: string, name: string) {
  const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${name.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "responses"}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
