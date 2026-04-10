import type { SupabaseClient } from "@supabase/supabase-js";

type SchoolRow = {
  school_id?: string | null;
};

export async function resolveSchoolId(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string | null,
): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("school_id")
    .eq("id", userId)
    .maybeSingle();

  const fromProfile = (profile as SchoolRow | null)?.school_id ?? null;
  if (fromProfile) return fromProfile;

  const { data: userById, error: byIdError } = await supabase
    .from("users")
    .select("school_id")
    .eq("id", userId)
    .maybeSingle();

  if (!byIdError) {
    const fromUsersById = (userById as SchoolRow | null)?.school_id ?? null;
    if (fromUsersById) return fromUsersById;
  }

  if (!userEmail) return null;

  const normalizedEmail = userEmail.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const { data: userByEmail, error: byEmailError } = await supabase
    .from("users")
    .select("school_id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (byEmailError) return null;
  return (userByEmail as SchoolRow | null)?.school_id ?? null;
}
