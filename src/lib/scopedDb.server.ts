// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Wraps the privileged client so every read, update and delete is limited to one organization's
 * user id, and every insert/upsert is stamped with it. Lets background jobs act for one org only.
 */
export function scopedDb(admin: Db, userId: string): Db {
  return new Proxy(admin, {
    get(target, prop) {
      if (prop !== "from") return Reflect.get(target, prop);
      return (table: string) => {
        const q = target.from(table);
        const stamp = (rows: unknown) => Array.isArray(rows) ? rows.map((r) => ({ ...r, user_id: userId })) : { ...(rows as object), user_id: userId };
        return {
          select: (...a: unknown[]) => q.select(...a).eq("user_id", userId),
          update: (...a: unknown[]) => q.update(...a).eq("user_id", userId),
          delete: (...a: unknown[]) => q.delete(...a).eq("user_id", userId),
          insert: (rows: unknown, ...a: unknown[]) => q.insert(stamp(rows), ...a),
          upsert: (rows: unknown, ...a: unknown[]) => q.upsert(stamp(rows), ...a),
        };
      };
    },
  });
}
