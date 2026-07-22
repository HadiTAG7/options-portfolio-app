import { type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { BACKEND } from "@/lib/backend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

// GP-only account management: creates a Supabase Auth user for a
// partner and links it via partners.auth_user_id, or resets a linked
// account's password. Powers the "حسابات الشركاء" panel in Settings.
//
// Server-only: needs SUPABASE_SERVICE_ROLE_KEY (never NEXT_PUBLIC_*).
// This route ships only with the web deployment — the static-export
// APK drops api/ entirely, so the key never nears a client bundle.
//
// Authorization model:
//   - Normal path: caller sends their Supabase access token
//     (Authorization: Bearer <jwt>); it must belong to the partner row
//     with isAdmin = true.
//   - Bootstrap exception: while NO partner is linked yet (fresh
//     system — nobody can hold a token), the route allows exactly one
//     operation without a token: creating/linking the isAdmin
//     partner's own account. Everything else stays locked.

type Action = "create" | "reset-password";

interface Body {
  action: Action;
  partnerId: string;
  email?: string;
  password?: string;
}

function jsonError(status: number, message: string) {
  return Response.json({ success: false, error: message }, { status });
}

// Firebase flavor of the same route: identical request/response shapes,
// identical authorization model (GP token or the one bootstrap
// exception), but users live in Firebase Auth and the link lives on the
// partner doc. Also stamps the gp/partnerId custom claims that
// firestore.rules authorize by.
async function postFirebase(request: NextRequest) {
  try {
    let auth: Awaited<ReturnType<typeof adminAuth>>;
    let db: ReturnType<typeof adminDb>;
    try {
      auth = await adminAuth();
      db = adminDb();
    } catch (e) {
      return jsonError(
        500,
        e instanceof Error ? e.message : "Firebase admin not configured"
      );
    }

    const body = (await request.json()) as Body;
    if (!body?.partnerId || !body?.action) {
      return jsonError(400, "طلب ناقص: partnerId و action مطلوبان.");
    }
    if (body.action !== "create" && body.action !== "reset-password") {
      return jsonError(400, "action غير معروف.");
    }

    const targetRef = db.collection("partners").doc(body.partnerId);
    const targetSnap = await targetRef.get();
    const target = targetSnap.data();
    if (!targetSnap.exists || !target || target.archived_at) {
      return jsonError(404, "الشريك غير موجود.");
    }

    // ── Authorization ────────────────────────────────────────────
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    let callerIsGp = false;
    if (token) {
      try {
        const decoded = await auth.verifyIdToken(token);
        const q = await db
          .collection("partners")
          .where("auth_user_id", "==", decoded.uid)
          .get();
        callerIsGp = q.docs.some((d) => {
          const r = d.data();
          return r.isAdmin === true && !r.archived_at;
        });
      } catch {
        // invalid/expired token → not GP
      }
    }

    if (!callerIsGp) {
      const all = await db.collection("partners").get();
      const anyLinked = all.docs.some((d) => d.data().auth_user_id);
      const bootstrapAllowed =
        !anyLinked && body.action === "create" && target.isAdmin === true;
      if (!bootstrapAllowed) {
        return jsonError(
          401,
          anyLinked
            ? "غير مصرح — سجّل دخولك بحساب المدير أولاً."
            : "التمهيد يسمح فقط بإنشاء حساب المدير (الشريك isAdmin) أولاً."
        );
      }
    }

    // ── Actions ──────────────────────────────────────────────────
    if (body.action === "reset-password") {
      if (!target.auth_user_id) {
        return jsonError(400, "هذا الشريك غير مرتبط بحساب بعد.");
      }
      const password = body.password?.trim();
      if (!password || password.length < 8) {
        return jsonError(400, "كلمة المرور يجب ألا تقل عن 8 أحرف.");
      }
      await auth.updateUser(String(target.auth_user_id), { password });
      return Response.json({ success: true, action: "reset-password" });
    }

    // action === "create"
    const email = (body.email ?? target.email ?? "").trim().toLowerCase();
    const password = body.password?.trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return jsonError(400, "يرجى إدخال بريد إلكتروني صحيح.");
    }
    if (!password || password.length < 8) {
      return jsonError(400, "كلمة المرور يجب ألا تقل عن 8 أحرف.");
    }
    if (target.auth_user_id) {
      return jsonError(400, "هذا الشريك مرتبط بحساب بالفعل.");
    }

    let authUserId: string | null = null;
    try {
      const created = await auth.createUser({
        email,
        password,
        emailVerified: true,
      });
      authUserId = created.uid;
    } catch (e: unknown) {
      const code = String(
        e && typeof e === "object" && "code" in e
          ? (e as { code: unknown }).code
          : ""
      );
      if (code.includes("email-already-exists")) {
        const existing = await auth.getUserByEmail(email);
        authUserId = existing.uid;
      } else {
        return jsonError(
          500,
          e instanceof Error ? e.message : "تعذر إنشاء الحساب."
        );
      }
    }

    if (!authUserId) return jsonError(500, "تعذر الحصول على معرف الحساب.");

    // Claims drive firestore.rules (gp write access; LP own-statement
    // reads). Stamped before the link so a partner never holds a linked
    // account without its claims.
    await auth.setCustomUserClaims(authUserId, {
      gp: target.isAdmin === true,
      partnerId: targetSnap.id,
    });
    await targetRef.update({ auth_user_id: authUserId, email });

    return Response.json({
      success: true,
      action: "create",
      partnerId: targetSnap.id,
      email,
    });
  } catch (err: unknown) {
    const msg =
      err && typeof err === "object" && "message" in err
        ? (err as { message: string }).message
        : "Internal server error";
    return jsonError(500, msg);
  }
}

export async function POST(request: NextRequest) {
  if (BACKEND === "firebase") return postFirebase(request);
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) return jsonError(500, "NEXT_PUBLIC_SUPABASE_URL غير مضبوط.");
    if (!serviceKey) {
      return jsonError(
        500,
        "SUPABASE_SERVICE_ROLE_KEY غير مضبوط في بيئة الخادم — أضفه في إعدادات الاستضافة (لا تضعه أبداً كمتغير NEXT_PUBLIC)."
      );
    }

    const admin = createClient<Database>(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = (await request.json()) as Body;
    if (!body?.partnerId || !body?.action) {
      return jsonError(400, "طلب ناقص: partnerId و action مطلوبان.");
    }
    if (body.action !== "create" && body.action !== "reset-password") {
      return jsonError(400, "action غير معروف.");
    }

    // Target partner row.
    const { data: target, error: targetError } = await admin
      .from("partners")
      .select("id, name, email, isAdmin, auth_user_id, archived_at")
      .eq("id", body.partnerId)
      .maybeSingle();
    if (targetError) return jsonError(500, targetError.message);
    if (!target || target.archived_at) {
      return jsonError(404, "الشريك غير موجود.");
    }

    // ── Authorization ────────────────────────────────────────────
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    let callerIsGp = false;
    if (token) {
      const { data: userData, error: userErr } = await admin.auth.getUser(
        token
      );
      if (!userErr && userData.user) {
        const { data: gpRow } = await admin
          .from("partners")
          .select("id")
          .eq("auth_user_id", userData.user.id)
          .eq("isAdmin", true)
          .is("archived_at", null)
          .maybeSingle();
        callerIsGp = !!gpRow;
      }
    }

    if (!callerIsGp) {
      // Bootstrap: allowed only while nothing is linked, and only for
      // the GP's own row.
      const { count, error: linkedErr } = await admin
        .from("partners")
        .select("id", { count: "exact", head: true })
        .not("auth_user_id", "is", null);
      if (linkedErr) {
        // Most likely: migration 013 not run (auth_user_id missing).
        return jsonError(
          500,
          `تعذر فحص حالة الربط — هل شغّلت migration 013؟ (${linkedErr.message})`
        );
      }
      const anyLinked = (count ?? 0) > 0;
      const bootstrapAllowed =
        !anyLinked && body.action === "create" && target.isAdmin === true;
      if (!bootstrapAllowed) {
        return jsonError(
          401,
          anyLinked
            ? "غير مصرح — سجّل دخولك بحساب المدير أولاً."
            : "التمهيد يسمح فقط بإنشاء حساب المدير (الشريك isAdmin) أولاً."
        );
      }
    }

    // ── Actions ──────────────────────────────────────────────────
    if (body.action === "reset-password") {
      if (!target.auth_user_id) {
        return jsonError(400, "هذا الشريك غير مرتبط بحساب بعد.");
      }
      const password = body.password?.trim();
      if (!password || password.length < 8) {
        return jsonError(400, "كلمة المرور يجب ألا تقل عن 8 أحرف.");
      }
      const { error: updErr } = await admin.auth.admin.updateUserById(
        target.auth_user_id,
        { password }
      );
      if (updErr) return jsonError(500, updErr.message);
      return Response.json({ success: true, action: "reset-password" });
    }

    // action === "create"
    const email = (body.email ?? target.email ?? "").trim().toLowerCase();
    const password = body.password?.trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return jsonError(400, "يرجى إدخال بريد إلكتروني صحيح.");
    }
    if (!password || password.length < 8) {
      return jsonError(400, "كلمة المرور يجب ألا تقل عن 8 أحرف.");
    }
    if (target.auth_user_id) {
      return jsonError(400, "هذا الشريك مرتبط بحساب بالفعل.");
    }

    // Create the auth user; if the email already exists, link to it.
    let authUserId: string | null = null;
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createErr) {
      const msg = createErr.message.toLowerCase();
      if (msg.includes("already") || msg.includes("registered")) {
        // Look the user up by email and link instead.
        const { data: list, error: listErr } =
          await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (listErr) return jsonError(500, listErr.message);
        const existing = list.users.find(
          (u) => u.email?.toLowerCase() === email
        );
        if (!existing) {
          return jsonError(
            500,
            "البريد مسجل مسبقاً لكن تعذر العثور عليه للربط."
          );
        }
        authUserId = existing.id;
      } else {
        return jsonError(500, createErr.message);
      }
    } else {
      authUserId = created.user?.id ?? null;
    }

    if (!authUserId) return jsonError(500, "تعذر الحصول على معرف الحساب.");

    const { error: linkErr } = await admin
      .from("partners")
      .update({ auth_user_id: authUserId, email })
      .eq("id", target.id);
    if (linkErr) {
      return jsonError(
        500,
        `أُنشئ الحساب لكن فشل الربط: ${linkErr.message} — هل شغّلت migration 013؟`
      );
    }

    return Response.json({
      success: true,
      action: "create",
      partnerId: target.id,
      email,
    });
  } catch (err: unknown) {
    const msg =
      err && typeof err === "object" && "message" in err
        ? (err as { message: string }).message
        : "Internal server error";
    return jsonError(500, msg);
  }
}
