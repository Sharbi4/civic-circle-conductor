import { describe, it, expect } from 'vitest';
import { recordLaunchProgress } from '@/lib/approvals.server';

const POST = 'https://www.linkedin.com/feed/update/urn:li:share:7526733300963627008';
const USER = 'owner-1';

type Row = Record<string, unknown>;
type Write = { table: string; patch: Row | undefined; filters: Row[] };

/** Minimal stand-in for the database calls this code makes: filters, one-row reads, updates and inserts. */
function fakeDb(tables: Record<string, Row[]>) {
  const updates: Write[] = [];
  const inserts: Write[] = [];
  const matches = (table: string, filters: Row[]) => (tables[table] ?? []).filter((r) => filters.every((f) => Object.entries(f).every(([k, v]) => r[k] === v)));
  const chain = (table: string, op: string, patch?: Row): unknown => {
    const filters: Row[] = [];
    // The write is recorded as soon as it is asked for; the .eq() calls below it fill in which row it hits.
    if (op === 'update') updates.push({ table, patch, filters });
    if (op === 'insert') inserts.push({ table, patch, filters });
    const api: Record<string, unknown> = {
      eq: (k: string, v: unknown) => { filters.push({ [k]: v }); return api; },
      is: (k: string, v: unknown) => { filters.push({ [k]: v }); return api; },
      in: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: async () => ({ data: matches(table, filters)[0] ?? null }),
      select: async () => ({ data: matches(table, filters) }),
      update: (p: Row) => { updates.push({ table, patch: p, filters }); return api; },
      insert: (r: Row) => { inserts.push({ table, patch: r, filters }); return api; },
      then: (res: (v: unknown) => unknown) => res(op === 'update' ? { data: null } : { data: matches(table, filters) }),
    };
    return api;
  };
  return {
    updates,
    inserts,
    from: (table: string) => ({
      select: () => chain(table, 'select'),
      update: (p: Row) => chain(table, 'update', p) as never,
      insert: (r: Row) => chain(table, 'insert', r) as never,
    }),
  };
}

const asDb = (db: unknown) => db as never;

describe('a published post lands its link on the event step', () => {
  it('finds the event\'s LinkedIn step from the chat when the approval carries no step id', async () => {
    const db = fakeDb({
      approvals: [{ id: 'a1', thread_id: 't1', user_id: USER }],
      tasks: [
        { id: 's1', user_id: USER, thread_id: 't1', step_key: 'linkedin_post', done: false, result_url: null, goal_id: 'g1', title: 'Post on LinkedIn' },
        { id: 's2', user_id: USER, thread_id: 't1', step_key: 'x_post', done: true, result_url: null, goal_id: 'g1', title: 'Post on X' },
      ],
      messages: [],
    });
    await recordLaunchProgress(asDb(db), USER, 'a1', { kind: 'linkedin_post', text: 'hello' }, null, { ok: true, url: POST });
    const link = db.updates.find((u) => u.table === 'tasks' && u.patch?.['result_url'] === POST);
    expect(link?.filters).toEqual(expect.arrayContaining([{ id: 's1' }]));
    expect(link?.patch).toMatchObject({ done: true, result_url: POST });
  });

  it('fills in the link a finished step never got, without repeating the chat line', async () => {
    const db = fakeDb({
      approvals: [{ id: 'a1', thread_id: 't1', user_id: USER }],
      tasks: [{ id: 's1', user_id: USER, thread_id: 't1', step_key: 'linkedin_post', done: true, result_url: null, goal_id: 'g1', title: 'Post on LinkedIn' }],
      messages: [],
    });
    await recordLaunchProgress(asDb(db), USER, 'a1', { kind: 'linkedin_post', text: 'hello' }, null, { ok: true, url: POST });
    const link = db.updates.find((u) => u.table === 'tasks' && u.patch?.['result_url'] === POST);
    expect(link?.patch).toEqual({ result_url: POST });
    expect(db.inserts).toEqual([]);
  });

  it('leaves the step alone for a plain go-ahead with nothing to run', async () => {
    const db = fakeDb({
      approvals: [{ id: 'a1', thread_id: 't1', user_id: USER }],
      tasks: [{ id: 's1', user_id: USER, thread_id: 't1', step_key: 'linkedin_post', done: false, result_url: null, goal_id: 'g1', title: 'Post on LinkedIn' }],
      messages: [],
    });
    await recordLaunchProgress(asDb(db), USER, 'a1', null, null, { ok: true });
    expect(db.updates).toEqual([]);
  });

  it('never links a step for an action that failed', async () => {
    const db = fakeDb({
      approvals: [{ id: 'a1', thread_id: 't1', user_id: USER }],
      tasks: [{ id: 's1', user_id: USER, thread_id: 't1', step_key: 'linkedin_post', done: false, result_url: null, goal_id: 'g1', title: 'Post on LinkedIn' }],
      messages: [],
    });
    await recordLaunchProgress(asDb(db), USER, 'a1', { kind: 'linkedin_post', text: 'hello' }, null, { ok: false });
    expect(db.updates.find((u) => u.patch?.['result_url'] === POST)).toBeUndefined();
  });
});
