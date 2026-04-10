import { createStudent } from "@/actions/students";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type StudentsPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
  }>;
};

function buildRedirectUrl(status: "success" | "error", message: string) {
  return `/staff/students?status=${status}&message=${encodeURIComponent(message)}`;
}

function asNullableText(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function asNullableNumber(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return undefined;
  return number;
}

export default async function StaffStudentsPage({ searchParams }: StudentsPageProps) {
  const params = (await searchParams) ?? {};
  const pageStatus = params.status;
  const pageMessage = params.message;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const schoolId = await resolveSchoolId(supabase, user.id, user.email);

  if (!schoolId) {
    return (
      <div className="w-full max-w-5xl rounded-lg border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-700">
        لم يتم العثور على مدرسة مرتبطة بحسابك.
      </div>
    );
  }

  const { data: classes } = await supabase
    .from("classes")
    .select("id,name")
    .eq("school_id", schoolId)
    .order("name", { ascending: true });

  async function createStudentAction(formData: FormData) {
    "use server";
    const fullName = String(formData.get("fullName") ?? "").trim();
    const selectedClassId = asNullableText(formData.get("classId"));
    const guardianPhone = asNullableText(formData.get("guardianPhone"));
    const address = asNullableText(formData.get("address"));
    const baseTuition = asNullableNumber(formData.get("baseTuition"));
    const genderValue = String(formData.get("gender") ?? "male") as "male" | "female";

    const result = await createStudent({
      fullName,
      classId: selectedClassId,
      gender: genderValue,
      baseTuition,
      guardianPhone,
      address,
      status: "active",
    });

    redirect(buildRedirectUrl(result.success ? "success" : "error", result.message));
  }

  return (
    <div className="w-full max-w-6xl space-y-6" dir="rtl">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">إضافة طالب</h1>
        <p className="text-sm text-muted-foreground">تسجيل طالب جديد في مدرستك.</p>
      </div>

      {pageMessage ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            pageStatus === "success"
              ? "border-green-500/40 bg-green-500/10 text-green-700"
              : "border-red-500/40 bg-red-500/10 text-red-700"
          }`}
        >
          {pageMessage}
        </div>
      ) : null}

      <form action={createStudentAction} className="space-y-4 rounded-lg border p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="fullName" className="text-sm font-medium">
              الاسم الكامل
            </label>
            <input
              id="fullName"
              name="fullName"
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="اسم الطالب"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="classId" className="text-sm font-medium">
              الصف
            </label>
            <select
              id="classId"
              name="classId"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">بدون صف</option>
              {(classes ?? []).map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="gender" className="text-sm font-medium">
              النوع
            </label>
            <select
              id="gender"
              name="gender"
              defaultValue="male"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="baseTuition" className="text-sm font-medium">
              القسط الأساسي
            </label>
            <input
              id="baseTuition"
              name="baseTuition"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="guardianPhone" className="text-sm font-medium">
              هاتف ولي الأمر
            </label>
            <input
              id="guardianPhone"
              name="guardianPhone"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="address" className="text-sm font-medium">
              العنوان
            </label>
            <input
              id="address"
              name="address"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
        <button
          type="submit"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          إضافة الطالب
        </button>
      </form>
    </div>
  );
}
