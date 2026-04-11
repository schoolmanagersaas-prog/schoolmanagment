import { EnvVarWarning } from "@/components/env-var-warning";
import { LogoutButton } from "@/components/logout-button";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";

export async function StaffNavbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let schoolNameFromDb: string | null = null;
  if (user) {
    const schoolId = await resolveSchoolId(supabase, user.id, user.email);
    if (schoolId) {
      const { data: schoolRow } = await supabase
        .from("schools")
        .select("name")
        .eq("id", schoolId)
        .maybeSingle();
      const raw = (schoolRow as { name?: string } | null)?.name?.trim();
      if (raw) schoolNameFromDb = raw;
    }
  }

  const navTitle = schoolNameFromDb ?? "لوحة المدرسة";

  return (
    <header
      className="h-16 lg:h-20 border-b border-gray-200 bg-white shadow-sm flex items-center justify-between px-4 md:px-6"
      dir="rtl"
    >
      <Link
        href="/staff"
        className="min-w-0 truncate text-sm font-semibold text-gray-800 hover:text-gray-950 transition-colors max-w-[55vw] sm:max-w-md md:max-w-xl"
        title={navTitle}
      >
        {navTitle}
      </Link>
      <div className="flex items-center gap-3 text-sm">
        {!hasEnvVars ? (
          <EnvVarWarning />
        ) : user ? (
          <LogoutButton className="shrink-0 border-0 bg-red-600 font-semibold text-white shadow-md hover:bg-red-700 focus-visible:ring-red-500">
            تسجيل خروج
          </LogoutButton>
        ) : null}
      </div>
    </header>
  );
}
