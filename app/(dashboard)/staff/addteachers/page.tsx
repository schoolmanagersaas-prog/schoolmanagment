import { createTeacher } from "@/actions/teachers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type AddTeachersPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
  }>;
};

function buildRedirectUrl(status: "success" | "error", message: string) {
  return `/staff/addteachers?status=${status}&message=${encodeURIComponent(message)}`;
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

export default async function StaffAddTeachersPage({ searchParams }: AddTeachersPageProps) {
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

  async function createTeacherAction(formData: FormData) {
    "use server";
    const fullName = String(formData.get("fullName") ?? "").trim();
    const academicQualification = asNullableText(formData.get("academicQualification"));
    const certificateObtainedDate = asNullableText(formData.get("certificateObtainedDate"));
    const certificateSource = asNullableText(formData.get("certificateSource"));
    const yearsOfExperience = asNullableNumber(formData.get("yearsOfExperience"));
    const phone = asNullableText(formData.get("phone"));
    const subject = asNullableText(formData.get("subject"));
    const salary = asNullableNumber(formData.get("salary"));
    const salaryInstallmentDueDate = asNullableText(formData.get("salaryInstallmentDueDate"));

    const result = await createTeacher({
      fullName,
      academicQualification,
      certificateObtainedDate: certificateObtainedDate ?? undefined,
      certificateSource,
      yearsOfExperience,
      phone,
      subject,
      salary,
      salaryInstallmentDueDate: salaryInstallmentDueDate ?? undefined,
    });

    redirect(buildRedirectUrl(result.success ? "success" : "error", result.message));
  }

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-6" dir="rtl">
      {pageMessage ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm shadow-sm ${
            pageStatus === "success"
              ? "bg-green-100 text-green-800 border border-green-300"
              : "bg-red-100 text-red-800 border border-red-300"
          }`}
        >
          {pageMessage}
        </div>
      ) : null}

      <section className="bg-white rounded-3xl shadow-lg border p-6 space-y-6">


        <form action={createTeacherAction} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="fullName">الاسم الثلاثي</Label>
              <Input
                id="fullName"
                name="fullName"
                required
                placeholder="اسم الموظف"
                className="rounded-xl focus:ring-2 focus:ring-yellow-400"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="academicQualification">المؤهل العلمي</Label>
              <Input id="academicQualification" name="academicQualification" className="rounded-xl focus:ring-2 focus:ring-yellow-400" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="certificateObtainedDate">تاريخ الحصول على الشهادة</Label>
              <Input id="certificateObtainedDate" name="certificateObtainedDate" type="date" className="rounded-xl focus:ring-2 focus:ring-yellow-400" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="certificateSource">مصدر الشهادة</Label>
              <Input id="certificateSource" name="certificateSource" className="rounded-xl focus:ring-2 focus:ring-yellow-400" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="yearsOfExperience">سنوات الخبرة</Label>
              <Input id="yearsOfExperience" name="yearsOfExperience" type="number" min="0" step="1" defaultValue="0" className="rounded-xl focus:ring-2 focus:ring-yellow-400" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">الهاتف</Label>
              <Input id="phone" name="phone" className="rounded-xl focus:ring-2 focus:ring-yellow-400" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="salary">الراتب (أساس قسط الراتب)</Label>
              <Input
                id="salary"
                name="salary"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                className="rounded-xl focus:ring-2 focus:ring-yellow-400"
              />

            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="salaryInstallmentDueDate">تاريخ استحقاق قسط الراتب الأول</Label>
              <Input
                id="salaryInstallmentDueDate"
                name="salaryInstallmentDueDate"
                type="date"
                className="rounded-xl focus:ring-2 focus:ring-yellow-400"
              />

            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="subject">المادة / التخصص</Label>
              <Input
                id="subject"
                name="subject"
                placeholder="مثال: رياضيات، لغة عربية…"
                className="rounded-xl focus:ring-2 focus:ring-yellow-400"
              />
            </div>
          </div>

          <div className="pt-4">
            <Button
              type="submit"
              size="default"
              className="rounded-md bg-Yellow px-4 text-foreground shadow-sm hover:bg-Yellow/90 hover:scale-[1.02] transition-transform"
            >
              إضافة الموظف
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
