import { createClass } from "@/actions/class";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type ClassPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
  }>;
};

export default async function StaffClassPage({ searchParams }: ClassPageProps) {
  const params = (await searchParams) ?? {};
  const status = params.status;
  const message = params.message;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const schoolId = await resolveSchoolId(supabase, user.id, user.email);

  const { data: classes } = schoolId
    ? await supabase
        .from("classes")
        .select("id,name,stage,description,created_at")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
    : { data: [] };

  async function createClassAction(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "");
    const stage = String(formData.get("stage") ?? "");
    const description = String(formData.get("description") ?? "");

    const result = await createClass({
      name,
      stage,
      description,
    });

    if (!result.success) {
      redirect(`/staff/class?status=error&message=${encodeURIComponent(result.message)}`);
    }

    redirect(`/staff/class?status=success&message=${encodeURIComponent(result.message)}`);
  }

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">إدارة الصفوف</h1>
        <p className="text-sm text-muted-foreground">
          أنشئ صفا جديدا لمدرستك، ثم راجع قائمة الصفوف الحالية.
        </p>
      </div>

      {message ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            status === "success"
              ? "border-green-500/40 bg-green-500/10 text-green-700"
              : "border-red-500/40 bg-red-500/10 text-red-700"
          }`}
        >
          {message}
        </div>
      ) : null}

      <form action={createClassAction} className="space-y-4 rounded-lg border p-5">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            اسم الصف
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="مثال: الصف الأول أ"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-primary"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="stage" className="text-sm font-medium">
            المرحلة (اختياري)
          </label>
          <input
            id="stage"
            name="stage"
            type="text"
            placeholder="مثال: ابتدائي"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-primary"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="description" className="text-sm font-medium">
            الوصف (اختياري)
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            placeholder="وصف مختصر للصف"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-primary"
          />
        </div>

        <button
          type="submit"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          إنشاء الصف
        </button>
      </form>

      <section className="space-y-3 rounded-lg border p-5">
        <h2 className="text-lg font-semibold">الصفوف الحالية</h2>
        {!schoolId ? (
          <p className="text-sm text-red-600">لا توجد مدرسة مرتبطة بحسابك حاليا.</p>
        ) : classes && classes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-right">
                  <th className="px-2 py-2 font-medium">اسم الصف</th>
                  <th className="px-2 py-2 font-medium">المرحلة</th>
                  <th className="px-2 py-2 font-medium">الوصف</th>
                  <th className="px-2 py-2 font-medium">تاريخ الإنشاء</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((classItem) => (
                  <tr key={classItem.id} className="border-b last:border-0">
                    <td className="px-2 py-2">{classItem.name}</td>
                    <td className="px-2 py-2">{classItem.stage || "-"}</td>
                    <td className="px-2 py-2">{classItem.description || "-"}</td>
                    <td className="px-2 py-2">
                      {new Date(classItem.created_at).toLocaleDateString("ar-EG", {
                        numberingSystem: "latn",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">لا توجد صفوف بعد. ابدأ بإضافة أول صف.</p>
        )}
      </section>
    </div>
  );
}
