import { AuthButton } from "@/components/auth-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { resolveAppRole } from "@/lib/auth/resolve-app-role";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

type StaffLayoutProps = {
  children: React.ReactNode;
};

const staffMenuItems = [
  { href: "/staff/class", label: "الصفوف" },
  { href: "/staff/students", label: "الطلاب" },
];

export default async function StaffLayout({ children }: StaffLayoutProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const role = await resolveAppRole(supabase, user.id, user.email);

  if (role === "owner") {
    redirect("/admin");
  }

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-6xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Link href="/staff/class" className="text-foreground/80 hover:text-foreground">
                لوحة الموظف
              </Link>
            </div>
            {!hasEnvVars ? (
              <EnvVarWarning />
            ) : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
          </div>
        </nav>

        <div className="w-full max-w-6xl flex-1 p-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[220px_1fr]">
            <aside className="rounded-lg border p-4 h-fit">
              <h2 className="text-sm font-semibold mb-3">القائمة</h2>
              <ul className="space-y-2">
                {staffMenuItems.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block rounded-md px-3 py-2 text-sm text-foreground/80 hover:bg-muted hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>

            <section className="min-w-0">{children}</section>
          </div>
        </div>
      </div>
    </main>
  );
}
