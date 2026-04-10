import {
  createTeacherInstallment,
  deleteTeacherInstallment,
  listTeacherInstallmentLines,
  recordTeacherSalaryPayment,
  updateTeacherInstallment,
  type TeacherInstallmentPaymentStatus,
} from "@/actions/teacher-installments";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TeacherInstallmentRowActions } from "./teacher-installment-row-actions";

type PageSearchParams = Promise<{
  status?: string;
  flash?: string;
  flashType?: string;
}>;

const STATUS_OPTIONS: { value: TeacherInstallmentPaymentStatus | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  { value: "unpaid", label: "غير مسدد" },
  { value: "late", label: "متأخر" },
  { value: "paid_partial", label: "مسدد جزئياً" },
];

function parseStatusParam(raw: string | undefined): TeacherInstallmentPaymentStatus | "all" {
  const v = raw?.trim() ?? "";
  if (v === "paid_full") return "all";
  if (v === "paid_partial" || v === "late" || v === "unpaid") return v;
  return "all";
}

function buildListUrl(status: string) {
  const q = new URLSearchParams();
  if (status && status !== "all") q.set("status", status);
  const s = q.toString();
  return s ? `/staff/teacher-installments?${s}` : "/staff/teacher-installments";
}

function buildFlashUrl(type: "success" | "error", message: string, preserve: { status: string }) {
  const q = new URLSearchParams();
  q.set("flashType", type);
  q.set("flash", message);
  if (preserve.status && preserve.status !== "all") q.set("status", preserve.status);
  return `/staff/teacher-installments?${q.toString()}`;
}

function asPositiveNumber(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const n = Number.parseFloat(text);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

export default async function TeacherInstallmentsPage({ searchParams }: { searchParams?: PageSearchParams }) {
  const params = (await searchParams) ?? {};
  const statusFilter = parseStatusParam(params.status);
  const flash = params.flash?.trim();
  const flashType = params.flashType === "success" ? "success" : params.flashType === "error" ? "error" : null;

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

  const listResult = await listTeacherInstallmentLines({
    paymentStatus: statusFilter,
  });

  const lines = listResult.success ? listResult.lines : [];

  async function applyFiltersAction(formData: FormData) {
    "use server";
    const status = String(formData.get("status") ?? "all");
    redirect(buildListUrl(status));
  }

  async function recordPaymentAction(formData: FormData) {
    "use server";
    const teacherId = String(formData.get("teacherId") ?? "").trim();
    const installmentId = String(formData.get("installmentId") ?? "").trim();
    const amount = asPositiveNumber(formData.get("amount"));
    const preserveStatus = String(formData.get("preserveStatus") ?? "all");

    if (amount === undefined) {
      redirect(buildFlashUrl("error", "أدخل مبلغ دفعة صالحًا.", { status: preserveStatus }));
      return;
    }

    const result = await recordTeacherSalaryPayment({
      teacherId,
      installmentId,
      amount,
    });

    redirect(buildFlashUrl(result.success ? "success" : "error", result.message, { status: preserveStatus }));
  }

  async function deleteInstallmentRowAction(formData: FormData) {
    "use server";
    const installmentId = String(formData.get("installmentId") ?? "").trim();
    const preserveStatus = String(formData.get("preserveStatus") ?? "all");
    const result = await deleteTeacherInstallment(installmentId);
    redirect(buildFlashUrl(result.success ? "success" : "error", result.message, { status: preserveStatus }));
  }

  async function updateInstallmentRowAction(formData: FormData) {
    "use server";
    const installmentId = String(formData.get("installmentId") ?? "").trim();
    const dueDate = String(formData.get("dueDate") ?? "").trim();
    const totalAmount = asPositiveNumber(formData.get("totalAmount"));
    const preserveStatus = String(formData.get("preserveStatus") ?? "all");
    const result = await updateTeacherInstallment({ installmentId, totalAmount, dueDate });
    redirect(buildFlashUrl(result.success ? "success" : "error", result.message, { status: preserveStatus }));
  }

  async function createInstallmentRowAction(formData: FormData) {
    "use server";
    const teacherId = String(formData.get("teacherId") ?? "").trim();
    const dueDate = String(formData.get("dueDate") ?? "").trim();
    const totalAmount = asPositiveNumber(formData.get("totalAmount"));
    const preserveStatus = String(formData.get("preserveStatus") ?? "all");
    const result = await createTeacherInstallment({ teacherId, totalAmount, dueDate });
    redirect(buildFlashUrl(result.success ? "success" : "error", result.message, { status: preserveStatus }));
  }

  return (
    <div className="w-full max-w-6xl space-y-6" dir="rtl">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">رواتب المعلمين — أقساط ودفعات</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          يُعرّف قسط الراتب الأول غالباً من «إضافة معلم» عند إدخال راتب أكبر من صفر؛ يمكنك من الجدول إضافة أقساط أخرى
          لنفس المعلم، أو تعديل القسط، أو حذفه إن لم تُسجَّل دفعات عليه. تسجيل صرف الراتب من عمود «دفعة».
        </p>
        <p className="text-xs text-muted-foreground">
          <Link href="/staff/teacherslist" className="underline hover:text-foreground">
            قائمة المعلمين
          </Link>
          {" · "}
          <Link href="/staff/addteachers" className="underline hover:text-foreground">
            إضافة معلم
          </Link>
        </p>
      </div>

      {flash && flashType ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            flashType === "success"
              ? "border-green-500/40 bg-green-500/10 text-green-700"
              : "border-red-500/40 bg-red-500/10 text-red-700"
          }`}
        >
          {flash}
        </div>
      ) : null}

      {!listResult.success ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
          {listResult.message}
        </div>
      ) : null}

      <section className="rounded-lg border p-5 space-y-4">
        <h2 className="text-lg font-semibold">تصفية العرض</h2>
        <form action={applyFiltersAction} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="filterStatus" className="text-xs font-medium text-muted-foreground">
              حالة القسط
            </label>
            <select
              id="filterStatus"
              name="status"
              defaultValue={statusFilter}
              className="rounded-md border bg-background px-3 py-2 text-sm min-w-[180px]"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            تطبيق
          </button>
        </form>
      </section>

      <section className="rounded-lg border overflow-hidden">
        <div className="border-b px-5 py-3">
          <h2 className="text-lg font-semibold">أقساط الرواتب</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {listResult.success ? `عدد السجلات: ${lines.length}` : null}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-right">
              <tr>
                <th className="px-3 py-2 font-medium">اسم المعلم</th>
                <th className="px-3 py-2 font-medium">المادة</th>
                <th className="px-3 py-2 font-medium">تاريخ الاستحقاق</th>
                <th className="px-3 py-2 font-medium">المبلغ</th>
                <th className="px-3 py-2 font-medium">المدفوع</th>
                <th className="px-3 py-2 font-medium">المتبقي</th>
                <th className="px-3 py-2 font-medium w-[1%] whitespace-nowrap">دفعة</th>
                <th className="px-3 py-2 font-medium w-[1%] whitespace-nowrap">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    لا توجد أقساط مطابقة للتصفية. عرّف المعلم من «إضافة معلم» براتب أكبر من صفر وتاريخ استحقاق ليظهر القسط
                    هنا، أو أضف قسطاً من إجراءات صف موجود.
                  </td>
                </tr>
              ) : (
                lines.map((line) => {
                  const canPay = line.paymentStatus !== "paid_full";
                  return (
                    <tr key={line.installmentId} className="border-t align-top">
                      <td className="px-3 py-2">{line.teacherName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{line.subject ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{line.dueDate}</td>
                      <td className="px-3 py-2 tabular-nums">{line.totalAmount.toLocaleString("en-US")}</td>
                      <td className="px-3 py-2 tabular-nums">{line.totalPaid.toLocaleString("en-US")}</td>
                      <td className="px-3 py-2 tabular-nums">{line.remaining.toLocaleString("en-US")}</td>
                      <td className="px-3 py-2">
                        {canPay ? (
                          <form action={recordPaymentAction} className="flex flex-wrap items-center gap-1 justify-end">
                            <input type="hidden" name="teacherId" value={line.teacherId} />
                            <input type="hidden" name="installmentId" value={line.installmentId} />
                            <input type="hidden" name="preserveStatus" value={statusFilter} />
                            <input
                              name="amount"
                              type="number"
                              min="0.01"
                              step="0.01"
                              placeholder="المبلغ"
                              required
                              className="w-24 rounded border bg-background px-2 py-1 text-xs"
                            />
                            <button
                              type="submit"
                              className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted"
                            >
                              تسجيل
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <TeacherInstallmentRowActions
                          installmentId={line.installmentId}
                          teacherId={line.teacherId}
                          totalAmount={line.totalAmount}
                          dueDate={line.dueDate}
                          totalPaid={line.totalPaid}
                          preserveStatus={statusFilter}
                          deleteInstallmentAction={deleteInstallmentRowAction}
                          updateInstallmentAction={updateInstallmentRowAction}
                          createInstallmentAction={createInstallmentRowAction}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
