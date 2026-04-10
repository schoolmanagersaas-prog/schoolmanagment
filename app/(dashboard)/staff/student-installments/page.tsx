import {
  createStudentInstallment,
  deleteStudentInstallment,
  listInstallmentLines,
  recordTuitionPayment,
  updateStudentInstallment,
  type InstallmentPaymentStatus,
} from "@/actions/student-installments";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InstallmentRowActions } from "./installment-row-actions";

type PageSearchParams = Promise<{
  status?: string;
  classId?: string;
  flash?: string;
  flashType?: string;
}>;

const STATUS_OPTIONS: { value: InstallmentPaymentStatus | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  { value: "unpaid", label: "غير مسدد" },
  { value: "late", label: "متأخر" },
  { value: "paid_partial", label: "مسدد جزئياً" },
];

function parseStatusParam(raw: string | undefined): InstallmentPaymentStatus | "all" {
  const v = raw?.trim() ?? "";
  /** الأقساط المسددة بالكامل لا تُعرض في القائمة */
  if (v === "paid_full") return "all";
  if (v === "paid_partial" || v === "late" || v === "unpaid") return v;
  return "all";
}

function buildListUrl(status: string, classId: string) {
  const q = new URLSearchParams();
  if (status && status !== "all") q.set("status", status);
  if (classId) q.set("classId", classId);
  const s = q.toString();
  return s ? `/staff/student-installments?${s}` : "/staff/student-installments";
}

function buildFlashUrl(type: "success" | "error", message: string, preserve: { status: string; classId: string }) {
  const q = new URLSearchParams();
  q.set("flashType", type);
  q.set("flash", message);
  if (preserve.status && preserve.status !== "all") q.set("status", preserve.status);
  if (preserve.classId) q.set("classId", preserve.classId);
  return `/staff/student-installments?${q.toString()}`;
}

function asPositiveNumber(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const n = Number.parseFloat(text);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

export default async function StudentInstallmentsPage({ searchParams }: { searchParams?: PageSearchParams }) {
  const params = (await searchParams) ?? {};
  const statusFilter = parseStatusParam(params.status);
  const classFilter = params.classId?.trim() ?? "";
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

  const [{ data: classRows }, listResult] = await Promise.all([
    supabase.from("classes").select("id,name").eq("school_id", schoolId).order("name", { ascending: true }),
    listInstallmentLines({
      paymentStatus: statusFilter,
      classId: classFilter || undefined,
    }),
  ]);

  const classes = (classRows ?? []) as { id: string; name: string }[];

  const lines = listResult.success ? listResult.lines : [];

  async function applyFiltersAction(formData: FormData) {
    "use server";
    const status = String(formData.get("status") ?? "all");
    const classId = String(formData.get("classId") ?? "").trim();
    redirect(buildListUrl(status, classId));
  }

  async function recordPaymentAction(formData: FormData) {
    "use server";
    const studentId = String(formData.get("studentId") ?? "").trim();
    const installmentId = String(formData.get("installmentId") ?? "").trim();
    const amount = asPositiveNumber(formData.get("amount"));
    const preserveStatus = String(formData.get("preserveStatus") ?? "all");
    const preserveClassId = String(formData.get("preserveClassId") ?? "").trim();

    if (amount === undefined) {
      redirect(buildFlashUrl("error", "أدخل مبلغ دفعة صالحًا.", { status: preserveStatus, classId: preserveClassId }));
      return;
    }

    const result = await recordTuitionPayment({
      studentId,
      installmentId,
      amount,
    });

    redirect(
      buildFlashUrl(result.success ? "success" : "error", result.message, {
        status: preserveStatus,
        classId: preserveClassId,
      }),
    );
  }

  async function deleteInstallmentRowAction(formData: FormData) {
    "use server";
    const installmentId = String(formData.get("installmentId") ?? "").trim();
    const preserveStatus = String(formData.get("preserveStatus") ?? "all");
    const preserveClassId = String(formData.get("preserveClassId") ?? "").trim();
    const result = await deleteStudentInstallment(installmentId);
    redirect(
      buildFlashUrl(result.success ? "success" : "error", result.message, {
        status: preserveStatus,
        classId: preserveClassId,
      }),
    );
  }

  async function updateInstallmentRowAction(formData: FormData) {
    "use server";
    const installmentId = String(formData.get("installmentId") ?? "").trim();
    const dueDate = String(formData.get("dueDate") ?? "").trim();
    const totalAmount = asPositiveNumber(formData.get("totalAmount"));
    const preserveStatus = String(formData.get("preserveStatus") ?? "all");
    const preserveClassId = String(formData.get("preserveClassId") ?? "").trim();
    const result = await updateStudentInstallment({ installmentId, totalAmount, dueDate });
    redirect(
      buildFlashUrl(result.success ? "success" : "error", result.message, {
        status: preserveStatus,
        classId: preserveClassId,
      }),
    );
  }

  async function createInstallmentRowAction(formData: FormData) {
    "use server";
    const studentId = String(formData.get("studentId") ?? "").trim();
    const dueDate = String(formData.get("dueDate") ?? "").trim();
    const totalAmount = asPositiveNumber(formData.get("totalAmount"));
    const preserveStatus = String(formData.get("preserveStatus") ?? "all");
    const preserveClassId = String(formData.get("preserveClassId") ?? "").trim();
    const result = await createStudentInstallment({ studentId, totalAmount, dueDate });
    redirect(
      buildFlashUrl(result.success ? "success" : "error", result.message, {
        status: preserveStatus,
        classId: preserveClassId,
      }),
    );
  }

  return (
    <div className="w-full max-w-6xl space-y-6" dir="rtl">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">أقساط الطلاب والدفعات</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          يُعرّف القسط الأول غالباً من «إضافة طالب»؛ يمكنك من الجدول إضافة أقساط أخرى لنفس الطالب، أو تعديل القسط، أو
          حذفه إن لم تُسجَّل دفعات عليه. تسجيل الدفعات من عمود «دفعة».
        </p>
        <p className="text-xs text-muted-foreground">
          <Link href="/staff/studentlist" className="underline hover:text-foreground">
            قائمة الطلاب
          </Link>
          {" · "}
          <Link href="/staff/students" className="underline hover:text-foreground">
            إضافة طالب
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
          <div className="space-y-1">
            <label htmlFor="filterClass" className="text-xs font-medium text-muted-foreground">
              الصف
            </label>
            <select
              id="filterClass"
              name="classId"
              defaultValue={classFilter}
              className="rounded-md border bg-background px-3 py-2 text-sm min-w-[180px]"
            >
              <option value="">كل الصفوف</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
          <h2 className="text-lg font-semibold">الأقساط</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {listResult.success ? `عدد السجلات: ${lines.length}` : null}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-right">
              <tr>
                <th className="px-3 py-2 font-medium">اسم الطالب</th>
                <th className="px-3 py-2 font-medium">الصف</th>
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
                    لا توجد أقساط مطابقة للتصفية. عرّف الطالب من «إضافة طالب» بقسط أساسي أكبر من صفر وتاريخ استحقاق ليظهر
                    القسط هنا.
                  </td>
                </tr>
              ) : (
                lines.map((line) => {
                  const canPay = line.paymentStatus !== "paid_full";
                  return (
                    <tr key={line.installmentId} className="border-t align-top">
                      <td className="px-3 py-2">{line.studentName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{line.className ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{line.dueDate}</td>
                      <td className="px-3 py-2 tabular-nums">{line.totalAmount.toLocaleString("en-US")}</td>
                      <td className="px-3 py-2 tabular-nums">{line.totalPaid.toLocaleString("en-US")}</td>
                      <td className="px-3 py-2 tabular-nums">{line.remaining.toLocaleString("en-US")}</td>
                      <td className="px-3 py-2">
                        {canPay ? (
                          <form action={recordPaymentAction} className="flex flex-wrap items-center gap-1 justify-end">
                            <input type="hidden" name="studentId" value={line.studentId} />
                            <input type="hidden" name="installmentId" value={line.installmentId} />
                            <input type="hidden" name="preserveStatus" value={statusFilter} />
                            <input type="hidden" name="preserveClassId" value={classFilter} />
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
                        <InstallmentRowActions
                          installmentId={line.installmentId}
                          studentId={line.studentId}
                          totalAmount={line.totalAmount}
                          dueDate={line.dueDate}
                          totalPaid={line.totalPaid}
                          preserveStatus={statusFilter}
                          preserveClassId={classFilter}
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
