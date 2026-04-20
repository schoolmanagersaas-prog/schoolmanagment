import { createStudent } from "@/actions/students";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import Link from "next/link";
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

const selectClassName = cn(
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
);

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
      <div className="p-6 flex flex-col gap-6" dir="rtl">
        <div className="rounded-2xl border border-amber-400/40 bg-amber-100/40 p-6 text-amber-900 text-center">
          ⚠️ لم يتم العثور على مدرسة مرتبطة بحسابك
        </div>
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
    const statusValue = String(formData.get("status") ?? "active").trim() === "withdrawn" ? "withdrawn" : "active";

    const result = await createStudent({
      fullName,
      classId: selectedClassId,
      gender: genderValue,
      baseTuition,
      installmentDueDate: new Date().toISOString().slice(0, 10),
      guardianPhone,
      address,
      status: statusValue,
    });

    redirect(buildRedirectUrl(result.success ? "success" : "error", result.message));
  }

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-6" dir="rtl">



      {/* رسالة */}
      {pageMessage && (
        <div
          className={`rounded-xl px-4 py-3 text-sm shadow-sm ${
            pageStatus === "success"
              ? "bg-green-100 text-green-800 border border-green-300"
              : "bg-red-100 text-red-800 border border-red-300"
          }`}
        >
          {pageMessage}
        </div>
      )}

      {/* 🧾 Form Card */}
      <section className="bg-white rounded-3xl shadow-lg border p-6 space-y-6">

        <h2 className="text-lg font-semibold text-gray-800 border-b pb-2">
          بيانات الطالب
        </h2>

        <form action={createStudentAction} className="space-y-5">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* الاسم */}
            <div className="space-y-2">
              <Label htmlFor="fullName">الاسم الكامل</Label>
              <Input
                id="fullName"
                name="fullName"
                required
                placeholder="مثال: أحمد محمد"
                className="rounded-xl focus:ring-2 focus:ring-yellow-400"
              />
            </div>

            {/* الصف */}
            <div className="space-y-2">
              <Label htmlFor="classId">الصف</Label>
              <select
                id="classId"
                name="classId"
                className="w-full h-10 rounded-xl border px-3 focus:ring-2 focus:ring-yellow-400"
              >
                <option value="">بدون صف</option>
                {(classes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* النوع */}
            <div className="space-y-2">
              <Label htmlFor="gender">النوع</Label>
              <select
                id="gender"
                name="gender"
                defaultValue="male"
                className="w-full h-10 rounded-xl border px-3 focus:ring-2 focus:ring-yellow-400"
              >
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </div>

            {/* القسط */}
            <div className="space-y-2">
              <Label htmlFor="baseTuition">القسط الأساسي</Label>
              <Input
                id="baseTuition"
                name="baseTuition"
                type="number"
                defaultValue="0"
                className="rounded-xl focus:ring-2 focus:ring-yellow-400"
              />
            </div>

            {/* الحالة */}
            <div className="space-y-2">
              <Label htmlFor="status">الحالة</Label>
              <select
                id="status"
                name="status"
                defaultValue="active"
                className="w-full h-10 rounded-xl border px-3 focus:ring-2 focus:ring-yellow-400"
              >
                <option value="active">نشط</option>
                <option value="withdrawn">منسحب</option>
              </select>
            </div>

            {/* الهاتف */}
            <div className="space-y-2">
              <Label htmlFor="guardianPhone">هاتف ولي الأمر</Label>
              <Input
                id="guardianPhone"
                name="guardianPhone"
                className="rounded-xl focus:ring-2 focus:ring-yellow-400"
              />
            </div>

            {/* العنوان */}
            <div className="space-y-2">
              <Label htmlFor="address">العنوان</Label>
              <Input
                id="address"
                name="address"
                className="rounded-xl focus:ring-2 focus:ring-yellow-400"
              />
            </div>

          </div>

          {/* زر */}
          <div className="pt-4">
            <Button
              type="submit"
              size="default"
              className="rounded-md bg-Yellow px-4 text-foreground shadow-sm hover:bg-Yellow/90 hover:scale-[1.02] transition-transform"
            >
              إضافة الطالب
            </Button>
          </div>

        </form>
      </section>
    </div>
  );
}
