import type { SupabaseClient } from "@supabase/supabase-js";

export type AppUserRole = "owner" | "staff";

function normalizeRole(value: unknown): AppUserRole | null {
  if (value === "owner" || value === "staff") return value;
  if (typeof value === "string") {
    const v = value.toLowerCase().trim();
    if (v === "owner" || v === "admin") return "owner";
    if (v === "staff" || v === "teacher" || v === "employee") return "staff";
  }
  return null;
}

type LegacyUserRow = Record<string, unknown> & {
  role?: unknown;
  type?: unknown;
  user_role?: unknown;
  userRole?: unknown;
};

/**
 * المصدر الرسمي للتطبيق هو `public.profiles.role` (انظر schame.md).
 * إن وُجد جدول `public.users` قديماً، نحاول قراءة الدور منه كاحتياطي لتوجيه لوحة التحكم فقط.
 * ميزات مثل ربط المدرسة ما زالت تحتاج صفاً في `profiles` (مثل school_id).
 */
export async function resolveAppRole(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string | null,
): Promise<AppUserRole | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const fromProfile = normalizeRole(profile?.role);
  if (fromProfile) return fromProfile;

  const { data: legacy, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return null;
  }

  const row = legacy as LegacyUserRow | null;
  if (row) {
    const byIdRole =
      normalizeRole(row.role) ??
      normalizeRole(row.type) ??
      normalizeRole(row.user_role) ??
      normalizeRole(row.userRole) ??
      null;

    if (byIdRole) return byIdRole;
  }

  if (!userEmail) return null;

  const normalizedEmail = userEmail.trim().toLowerCase();
  if (!normalizedEmail) return null;

  // احتياطي إضافي: بعض المشاريع القديمة خزنت users.id بشكل لا يطابق auth.users.id،
  // لذا نحاول المطابقة على البريد.
  const { data: legacyByEmail, error: emailLookupError } = await supabase
    .from("users")
    .select("*")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (emailLookupError) {
    return null;
  }

  const emailRow = legacyByEmail as LegacyUserRow | null;
  if (!emailRow) return null;

  return (
    normalizeRole(emailRow.role) ??
    normalizeRole(emailRow.type) ??
    normalizeRole(emailRow.user_role) ??
    normalizeRole(emailRow.userRole) ??
    null
  );
}
