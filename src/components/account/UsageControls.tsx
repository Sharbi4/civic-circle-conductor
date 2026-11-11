import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ShieldCheck, Save, Play, Pause } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveUsageLimits, resumePaidWork } from '@/lib/usage.functions';
import type { Database } from '@/integrations/supabase/types';

export function UsageControls() {
 const q=useQuery({ queryKey:['usage-controls'],queryFn:async()=>{
  const [o,u]=await Promise.all([supabase.from('organizations').select('automation_paused,usage_pause_reason,daily_ai_limit,daily_browser_minutes,daily_browser_sessions,browser_session_minutes').single(),supabase.from('org_usage_daily').select('*').eq('usage_date',new Date().toISOString().slice(0,10)).maybeSingle()]);
  if(o.error) throw o.error;return {org:o.data,usage:u.data};
 },refetchInterval:15000 });
 if(q.isError) return <p className="mt-6 text-sm text-destructive">Couldn't load usage controls.</p>;
 if(!q.data) return null;
 return <UsageForm key={JSON.stringify(q.data.org)} data={q.data} />;
}
type Org=Pick<Database['public']['Tables']['organizations']['Row'],'automation_paused'|'usage_pause_reason'|'daily_ai_limit'|'daily_browser_minutes'|'daily_browser_sessions'|'browser_session_minutes'>;
function UsageForm({data}:{data:{org:Org;usage:Database['public']['Tables']['org_usage_daily']['Row']|null}}) {
 const [vals,setVals]=useState(data.org),[busy,setBusy]=useState(false);
 const save=useServerFn(saveUsageLimits),resume=useServerFn(resumePaidWork),qc=useQueryClient();
 const refresh=()=>Promise.all([qc.invalidateQueries({queryKey:['usage-controls']}),qc.invalidateQueries({queryKey:['automation-state']})]);
 async function persist(){setBusy(true);try{await save({data:vals});await refresh();toast.success('Usage limits saved');}catch(e){toast.error(e instanceof Error?e.message:'Could not save limits');}finally{setBusy(false);}}
 const fields=[['daily_ai_limit','AI requests per day'],['daily_browser_minutes','Browser minutes per day'],['daily_browser_sessions','Browser sessions per day'],['browser_session_minutes','Maximum minutes per browser session']] as const;
 return <section className="mt-7 border-t pt-5"><h3 className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4" />Usage controls</h3>
 <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Daily limits reset at midnight UTC. AI calls reserve one request; browsers reserve their full session allowance before opening.</p>
 <dl className="my-4 space-y-2 text-xs"><div className="flex justify-between gap-2"><dt>AI requests reserved today</dt><dd>{data.usage?.ai_calls??0} / {data.org.daily_ai_limit}</dd></div><div className="flex justify-between gap-2"><dt>Browser minutes reserved today</dt><dd>{data.usage?.browser_minutes??0} / {data.org.daily_browser_minutes}</dd></div><div className="flex justify-between gap-2"><dt>Browser sessions reserved today</dt><dd>{data.usage?.browser_sessions??0} / {data.org.daily_browser_sessions}</dd></div></dl>
 <div className="space-y-3">{fields.map(([key,label])=><label key={key} className="block text-xs text-muted-foreground">{label}<Input aria-label={label} type="number" min={key==='browser_session_minutes'?1:0} value={vals[key]} onChange={(e)=>setVals({...vals,[key]:Number(e.target.value)})} className="mt-1" /></label>)}</div>
 <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" aria-label="Pause paid work" checked={vals.automation_paused} onChange={(e)=>setVals({...vals,automation_paused:e.target.checked})}/><Pause className="h-3.5 w-3.5" />Pause paid work</label>
 <p className="mt-2 text-xs text-muted-foreground">Pauses new AI calls and browser sessions, including chat. Already running requests cannot be cancelled here; browsers expire at their reserved timeout.</p>
 {data.org.usage_pause_reason&&<p role="alert" className="mt-3 text-xs text-destructive">{data.org.usage_pause_reason}</p>}
 <Button disabled={busy} onClick={persist} className="mt-4 w-full"><Save className="h-4 w-4" />Save usage limits</Button>
 {data.org.usage_pause_reason&&<Button disabled={busy} variant="outline" className="mt-2 w-full" onClick={async()=>{try{await resume();await refresh();toast.success('Paid work resumed; daily limits still apply');}catch(e){toast.error(e instanceof Error?e.message:'Could not resume');}}}><Play className="h-4 w-4" />Resume after restoring access</Button>}
 <p className="mt-3 text-xs text-muted-foreground">These are request and runtime limits, not a guaranteed dollar cap. Images and long AI replies can cost more per request.</p>
 </section>;
}
