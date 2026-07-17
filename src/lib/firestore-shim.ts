/* eslint-disable @typescript-eslint/no-explicit-any */
// Firestore-backed drop-in for the Supabase client.
//
// The app's hooks/store/pages talk to `supabase` through a SMALL, fully
// enumerated surface (see each section below). This shim implements
// exactly that surface on Firestore, so switching backends is a
// one-line swap in src/lib/supabase.ts — zero changes to any consumer,
// and the profit/fee engine never knows the difference.
//
// Deliberate semantics (matching how the app used PostgREST):
//   • Collections are tiny (≤ ~40 docs), so selects fetch the whole
//     collection and filter/sort in JS. This sidesteps Firestore
//     where()-vs-missing-field pitfalls and composite-index management,
//     and makes `.is("archived_at", null)` treat a MISSING field as
//     null — exactly like a SQL null.
//   • insert() stamps `id` (uuid) and `created_at` (ISO) when absent —
//     the Postgres columns had defaults; trades.created_at feeds
//     same-day settlement ordering and transactions order by it.
//   • rpc("recalculate_ownership") is a no-op: every consumer derives
//     ownership client-side (withDerivedOwnership / the distribution
//     engine); the stored percentage was already vestigial.
//   • auth maps onto Firebase Auth with the SAME user ids (auth users
//     were imported with their Supabase UUIDs), so
//     partners.auth_user_id keeps matching session.user.id.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { firebaseAuth, firebaseDb } from "./firebase";

type Row = Record<string, any>;
interface ShimError {
  message: string;
}

const err = (e: unknown): ShimError => ({
  message:
    e && typeof e === "object" && "message" in e
      ? String((e as { message: unknown }).message)
      : String(e),
});

// Strip undefined values — Firestore rejects them (Postgres treated
// them as "column not mentioned").
function clean(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// PostgREST-flavored ordering: numbers numerically, everything else as
// strings; nulls/missing sort last regardless of direction.
function makeComparator(field: string, ascending: boolean) {
  return (a: Row, b: Row) => {
    const x = a[field] ?? null;
    const y = b[field] ?? null;
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    let cmp: number;
    if (typeof x === "number" && typeof y === "number") cmp = x - y;
    else cmp = String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0;
    return ascending ? cmp : -cmp;
  };
}

// ── SELECT ───────────────────────────────────────────────────────────
function selectFrom(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let sort: { field: string; ascending: boolean } | null = null;
  let lim: number | null = null;

  async function run(): Promise<{
    data: Row[] | null;
    error: ShimError | null;
    count: number | null;
  }> {
    try {
      const snap = await getDocs(collection(firebaseDb(), table));
      let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Row);
      for (const f of filters) rows = rows.filter(f);
      if (sort) rows.sort(makeComparator(sort.field, sort.ascending));
      if (lim !== null) rows = rows.slice(0, lim);
      return { data: rows, error: null, count: rows.length };
    } catch (e) {
      return { data: null, error: err(e), count: null };
    }
  }

  const builder = {
    eq(field: string, value: any) {
      filters.push((r) => (r[field] ?? null) === value);
      return builder;
    },
    is(field: string, value: null) {
      filters.push((r) => (r[field] ?? null) === value);
      return builder;
    },
    not(field: string, op: string, value: any) {
      if (op === "is") filters.push((r) => (r[field] ?? null) !== value);
      return builder;
    },
    order(field: string, opts?: { ascending?: boolean }) {
      sort = { field, ascending: opts?.ascending !== false };
      return builder;
    },
    limit(n: number) {
      lim = n;
      return builder;
    },
    then<R1 = any, R2 = never>(
      onfulfilled?: ((value: any) => R1 | PromiseLike<R1>) | null,
      onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null
    ) {
      return run().then(onfulfilled, onrejected);
    },
    async single() {
      const res = await run();
      if (res.error) return { data: null, error: res.error };
      const rows = res.data ?? [];
      if (rows.length === 1) return { data: rows[0], error: null };
      return {
        data: null,
        error: {
          message:
            rows.length === 0
              ? "Row not found (single)"
              : "Multiple rows returned (single)",
        },
      };
    },
    async maybeSingle() {
      const res = await run();
      if (res.error) return { data: null, error: res.error };
      const rows = res.data ?? [];
      if (rows.length > 1) {
        return {
          data: null,
          error: { message: "Multiple rows returned (maybeSingle)" },
        };
      }
      return { data: rows[0] ?? null, error: null };
    },
  };
  return builder;
}

// ── INSERT ───────────────────────────────────────────────────────────
function insertInto(table: string, payload: Row | Row[]) {
  const rows = (Array.isArray(payload) ? payload : [payload]).map((r) => {
    const withId: Row = { ...r, id: r.id ?? crypto.randomUUID() };
    if (withId.created_at === undefined) {
      withId.created_at = new Date().toISOString();
    }
    if (table === "partners" && withId.joined_at === undefined) {
      withId.joined_at = withId.created_at;
    }
    return clean(withId);
  });

  async function run(): Promise<{ data: Row[] | null; error: ShimError | null }> {
    try {
      for (const r of rows) {
        await setDoc(doc(firebaseDb(), table, String(r.id)), r);
      }
      return { data: rows, error: null };
    } catch (e) {
      return { data: null, error: err(e) };
    }
  }

  const builder = {
    select() {
      return {
        async single() {
          const res = await run();
          if (res.error) return { data: null, error: res.error };
          return { data: res.data![0] ?? null, error: null };
        },
        async maybeSingle() {
          const res = await run();
          if (res.error) return { data: null, error: res.error };
          return { data: res.data![0] ?? null, error: null };
        },
        then(onf?: any, onr?: any) {
          return run().then(onf, onr);
        },
      };
    },
    then(onf?: any, onr?: any) {
      return run().then(onf, onr);
    },
  };
  return builder;
}

// ── UPDATE ───────────────────────────────────────────────────────────
function updateWhere(table: string, payload: Row) {
  const patch = clean(payload);
  const filters: Array<{ field: string; value: any }> = [];

  async function matchedIds(): Promise<string[]> {
    const direct = filters.find((f) => f.field === "id");
    if (direct && filters.length === 1) return [String(direct.value)];
    const snap = await getDocs(collection(firebaseDb(), table));
    return snap.docs
      .filter((d) => {
        const r = { id: d.id, ...d.data() } as Row;
        return filters.every((f) => (r[f.field] ?? null) === f.value);
      })
      .map((d) => d.id);
  }

  async function run(): Promise<{
    data: null;
    error: ShimError | null;
    status: number;
    statusText: string;
  }> {
    try {
      const ids = await matchedIds();
      for (const id of ids) {
        await updateDoc(doc(firebaseDb(), table, id), patch);
      }
      return { data: null, error: null, status: 204, statusText: "No Content" };
    } catch (e) {
      return { data: null, error: err(e), status: 400, statusText: "Bad Request" };
    }
  }

  const builder = {
    eq(field: string, value: any) {
      filters.push({ field, value });
      return builder;
    },
    select() {
      return {
        async single() {
          try {
            const ids = await matchedIds();
            if (ids.length !== 1) {
              return {
                data: null,
                error: {
                  message:
                    ids.length === 0
                      ? "Row not found (single)"
                      : "Multiple rows matched (single)",
                },
              };
            }
            await updateDoc(doc(firebaseDb(), table, ids[0]), patch);
            const after = await getDoc(doc(firebaseDb(), table, ids[0]));
            return {
              data: after.exists()
                ? ({ id: after.id, ...after.data() } as Row)
                : null,
              error: null,
            };
          } catch (e) {
            return { data: null, error: err(e) };
          }
        },
      };
    },
    then(onf?: any, onr?: any) {
      return run().then(onf, onr);
    },
  };
  return builder;
}

// ── DELETE ───────────────────────────────────────────────────────────
function deleteWhere(table: string) {
  const filters: Array<{ field: string; value: any }> = [];

  async function run(): Promise<{ data: null; error: ShimError | null }> {
    try {
      const direct = filters.find((f) => f.field === "id");
      let ids: string[];
      if (direct && filters.length === 1) {
        ids = [String(direct.value)];
      } else {
        const snap = await getDocs(collection(firebaseDb(), table));
        ids = snap.docs
          .filter((d) => {
            const r = { id: d.id, ...d.data() } as Row;
            return filters.every((f) => (r[f.field] ?? null) === f.value);
          })
          .map((d) => d.id);
      }
      for (const id of ids) {
        await deleteDoc(doc(firebaseDb(), table, id));
      }
      return { data: null, error: null };
    } catch (e) {
      return { data: null, error: err(e) };
    }
  }

  const builder = {
    eq(field: string, value: any) {
      filters.push({ field, value });
      return builder;
    },
    then(onf?: any, onr?: any) {
      return run().then(onf, onr);
    },
  };
  return builder;
}

// ── AUTH ─────────────────────────────────────────────────────────────
// Session shape mirrors what the app reads: user.id / user.email /
// access_token. user.id equals the old Supabase UUID (users were
// imported with their original ids).
async function toSession(u: User) {
  return {
    user: { id: u.uid, email: u.email ?? undefined },
    access_token: await u.getIdToken(),
  };
}

// Firebase restores the persisted user ASYNCHRONOUSLY after page load —
// currentUser is null for a beat even when signed in. getSession must
// wait for that first restore, or the auth guard would bounce every
// hard refresh to /login.
function waitForInitialUser(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(firebaseAuth(), (u) => {
      unsub();
      resolve(u);
    });
  });
}

const authShim = {
  async getSession() {
    try {
      const u = firebaseAuth().currentUser ?? (await waitForInitialUser());
      return {
        data: { session: u ? await toSession(u) : null },
        error: null,
      };
    } catch (e) {
      return { data: { session: null }, error: err(e) };
    }
  },
  onAuthStateChange(
    cb: (event: string, session: any) => void
  ): { data: { subscription: { unsubscribe: () => void } } } {
    const unsubscribe = onAuthStateChanged(firebaseAuth(), (u) => {
      void (async () => {
        cb(u ? "SIGNED_IN" : "SIGNED_OUT", u ? await toSession(u) : null);
      })();
    });
    return { data: { subscription: { unsubscribe } } };
  },
  async signInWithPassword(creds: { email: string; password: string }) {
    try {
      const res = await signInWithEmailAndPassword(
        firebaseAuth(),
        creds.email,
        creds.password
      );
      return {
        data: { session: await toSession(res.user), user: { id: res.user.uid } },
        error: null,
      };
    } catch (e: any) {
      const code = String(e?.code ?? "");
      const message =
        code.includes("invalid-credential") ||
        code.includes("wrong-password") ||
        code.includes("user-not-found") ||
        code.includes("invalid-email")
          ? // The login page maps this exact string to Arabic.
            "Invalid login credentials"
          : (e?.message ?? "Sign-in failed");
      return { data: { session: null, user: null }, error: { message } };
    }
  },
  async signOut() {
    try {
      await fbSignOut(firebaseAuth());
      return { error: null };
    } catch (e) {
      return { error: err(e) };
    }
  },
};

// ── The client ───────────────────────────────────────────────────────
export function createFirestoreCompatClient() {
  return {
    from(table: string) {
      return {
        // Accepts (columns, opts) at runtime like PostgREST; both are
        // irrelevant here (we always materialize full rows).
        select() {
          return selectFrom(table);
        },
        insert(payload: Row | Row[]) {
          return insertInto(table, payload);
        },
        update(payload: Row) {
          return updateWhere(table, payload);
        },
        delete() {
          return deleteWhere(table);
        },
      };
    },
    // recalculate_ownership: intentionally a no-op (see header note).
    async rpc() {
      return { data: null, error: null };
    },
    auth: authShim,
  };
}
