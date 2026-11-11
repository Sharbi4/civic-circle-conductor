import { LetterheadCheck, missingLetterhead, shouldShowLetterheadReminder } from "@/components/LetterheadCheck";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Download, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { logoToDataUrl } from "@/lib/logo";
import { DocumentPhoto } from "@/components/DocumentPhoto";

export const Route = createFileRoute("/_authenticated/documents/$id")({
  head: () => ({
    meta: [
      { title: "Document — Civi Meet" },
      { name: "description", content: "An official document prepared by Civi for your organization." },
      { property: "og:title", content: "Document — Civi Meet" },
      { property: "og:description", content: "An official document prepared by Civi for your organization." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocumentPage,
});

function DocumentPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const doc = useQuery({
    queryKey: ["document", id],
    queryFn: async () => (await supabase.from("documents").select("*").eq("id", id).maybeSingle()).data,
  });
  const org = useQuery({
    queryKey: ["org-letterhead"],
    queryFn: async () => (await supabase.from("organizations").select("name, address, logo_url, contact_name, contact_email, contact_phone, website, letterhead_skipped").maybeSingle()).data,
  });

  async function uploadLogo(f?: File) {
    if (!f) return;
    try {
      const dataUrl = await logoToDataUrl(f);
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("organizations").update({ logo_url: dataUrl }).eq("user_id", u.user!.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["org-letterhead"] });
      toast.success("Logo added to all your documents.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't add that logo"); }
  }

  function download() {
    const prev = document.title;
    document.title = doc.data?.title ?? "Document";
    window.print();
    document.title = prev;
  }

  const d = doc.data, o = org.data;
  const [check, setCheck] = useState(false);
  const date = d ? new Date(d.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";

  return (
    <div className="min-h-screen bg-muted/50 print:bg-background">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur print:hidden">
        <Button variant="ghost" size="sm" onClick={() => (window.history.length > 1 ? router.history.back() : router.navigate({ to: "/chat" }))}><ArrowLeft className="h-4 w-4" /> Back</Button>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} />
          <LetterheadCheck open={check} onOpenChange={setCheck} onSaved={download} onSkipped={download} />
          {missingLetterhead(o as never).length > 0 && <Button variant="outline" size="sm" onClick={() => setCheck(true)}>Complete details ({missingLetterhead(o as never).length})</Button>}
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><ImagePlus className="h-4 w-4" /> {o?.logo_url ? "Change logo" : "Add logo"}</Button>
          <Button size="sm" onClick={async () => { if (missingLetterhead(o as never).length && await shouldShowLetterheadReminder()) setCheck(true); else download(); }} disabled={!d}><Download className="h-4 w-4" /> Download PDF</Button>
        </div>
      </div>

      {doc.isLoading ? <p className="p-10 text-center text-muted-foreground">Loading…</p> : !d ? (
        <p className="p-10 text-center text-muted-foreground">This document isn't available. <Link to="/chat" className="underline">Back to chat</Link></p>
      ) : (
        <article className="official-doc mx-auto my-8 w-full max-w-[816px] bg-background px-8 py-10 shadow-soft sm:px-16 sm:py-14 print:my-0 print:max-w-none print:p-0 print:shadow-none">
          <header className="flex items-start justify-between gap-6 border-b-2 border-foreground pb-5">
            <div className="flex min-w-0 items-center gap-4">
              {o?.logo_url
                ? <img src={o.logo_url} alt={`${o.name ?? "Organization"} logo`} className="h-14 w-auto max-w-[160px] shrink-0 object-contain" />
                : <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-foreground text-xl font-bold text-background">{(o?.name ?? "O").slice(0, 1)}</div>}
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{o?.name ?? "Your organization"}</p>
                {o?.address && <p className="text-sm text-muted-foreground">{o.address}</p>}
                {[o?.contact_name, o?.contact_phone, o?.contact_email, o?.website].some(Boolean) && <p className="text-xs text-muted-foreground">{[o?.contact_name, o?.contact_phone, o?.contact_email, o?.website].filter(Boolean).join(" · ")}</p>}
              </div>
            </div>
            <div className="shrink-0 text-right text-xs uppercase tracking-[0.15em] text-muted-foreground">
              <p>{d.kind}</p><p className="mt-1 normal-case tracking-normal">{date}</p>
            </div>
          </header>
          <h1 className="mt-8 text-3xl font-semibold tracking-tight">{d.title}</h1>
          <div className="doc-body mt-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={(url) => url.startsWith("document-photo:") ? url : /^(https?:|mailto:|#|\/)/i.test(url) ? url : ""} components={{
              img: ({ src, alt }) => typeof src === "string" && src.startsWith("document-photo:") ? <DocumentPhoto path={src.slice("document-photo:".length)} alt={alt ?? "Document photograph"} /> : null,
            }}>{d.content}</ReactMarkdown>
          </div>
          <footer className="mt-12 flex justify-between border-t pt-4 text-xs text-muted-foreground">
            <span>{o?.name}</span><span>Prepared with Civi Meet · {date}</span>
          </footer>
        </article>
      )}
    </div>
  );
}
