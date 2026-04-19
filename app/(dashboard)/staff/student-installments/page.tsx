import {
  createStudentInstallment,
  deleteStudentInstallment,
  listInstallmentLines,
  recordTuitionPayment,
  updateStudentInstallment,
  type InstallmentPaymentStatus,
} from "@/actions/student-installments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { cn } from "@/lib/utils";
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

const selectClassName = cn(
  "flex h-10 min-w-[180px] rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
);

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
      <div className="p-4 flex flex-col gap-8" dir="rtl">
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-center text-sm text-amber-900">
          لم يتم العثور على مدرسة مرتبطة بحسابك.
        </div>
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
    <div className="p-4 flex flex-col gap-8 min-w-0" dir="rtl">
      <div className="rounded-2xl bg-sky p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">أقساط الطلاب والدفعات</h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              يُعرّف القسط الأول غالباً من «إضافة طالب»؛ من الجدول يمكنك إضافة أقساط أخرى، أو تعديل القسط، أو حذفه إن لم
              تُسجَّل دفعات. تسجيل الدفعات من عمود «دفعة».
            </p>
            <p className="text-xs text-gray-600">
              <Link href="/staff/studentlist" className="font-medium text-foreground underline-offset-4 hover:underline">
                قائمة الطلاب
              </Link>
              <span className="mx-1.5 text-muted-foreground">·</span>
              <Link href="/staff/students" className="font-medium text-foreground underline-offset-4 hover:underline">
                إضافة طالب
              </Link>
            </p>
          </div>
        </div>
      </div>

      {flash && flashType ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            flashType === "success"
              ? "border-green-500/40 bg-green-500/10 text-green-800"
              : "border-red-500/40 bg-red-500/10 text-red-800"
          }`}
        >
          {flash}
        </div>
      ) : null}

      {!listResult.success ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
          {listResult.message}
        </div>
      ) : null}

      <section className="rounded-xl border border-muted-foreground/20 bg-muted/20 p-4 sm:p-5">
        <h2 className="mb-4 text-lg font-semibold text-foreground">تصفية العرض</h2>
        <form action={applyFiltersAction} className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="filterStatus" className="text-muted-foreground">
              حالة القسط
            </Label>
            <select id="filterStatus" name="status" defaultValue={statusFilter} className={selectClassName}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="filterClass" className="text-muted-foreground">
              الصف
            </Label>
            <select id="filterClass" name="classId" defaultValue={classFilter} className={selectClassName}>
              <option value="">كل الصفوف</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="submit"
            className="rounded-xl bg-Yellow px-4 text-foreground shadow-sm hover:bg-Yellow/90 hover:scale-[1.02] transition-transform"
          >
            تطبيق
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-muted-foreground/20 bg-muted/20 p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">الأقساط</h2>
          {listResult.success ? (
            <p className="text-xs text-muted-foreground">عدد السجلات: {lines.length}</p>
          ) : null}
        </div>
        {lines.length === 0 ? (
          <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-background/40 p-8 text-center text-sm text-muted-foreground">
            لا توجد أقساط مطابقة للتصفية. عرّف الطالب من «إضافة طالب» بقسط أساسي أكبر من صفر وتاريخ استحقاق ليظهر القسط
            هنا.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60 bg-background/60">
            <table className="w-full border-collapse table-auto text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-right">
                  <th className="px-2.5 py-2.5 font-medium">اسم الطالب</th>
                  <th className="px-2.5 py-2.5 font-medium">الصف</th>
                  <th className="px-2.5 py-2.5 font-medium">تاريخ الاستحقاق</th>
                  <th className="px-2.5 py-2.5 font-medium">المبلغ</th>
                  <th className="px-2.5 py-2.5 font-medium">المدفوع</th>
                  <th className="px-2.5 py-2.5 font-medium">المتبقي</th>
                  <th className="px-2.5 py-2.5 font-medium whitespace-nowrap w-[1%]">دفعة</th>
                  <th className="px-2.5 py-2.5 font-medium whitespace-nowrap w-[1%] text-right">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const canPay = line.paymentStatus !== "paid_full";
                  return (
                    <tr
                      key={line.installmentId}
                      className={`border-b border-border/80 align-top last:border-0 ${
                        index % 2 === 0 ? "bg-background/40" : "bg-muted/10"
                      }`}
                    >
                      <td className="px-2.5 py-2.5 font-medium">{line.studentName}</td>
                      <td className="px-2.5 py-2.5 text-muted-foreground">{line.className ?? "—"}</td>
                      <td className="px-2.5 py-2.5 whitespace-nowrap tabular-nums">{line.dueDate}</td>
                      <td className="px-2.5 py-2.5 tabular-nums">${line.totalAmount.toLocaleString("en-US")}</td>
                      <td className="px-2.5 py-2.5 tabular-nums">${line.totalPaid.toLocaleString("en-US")}</td>
                      <td className="px-2.5 py-2.5 tabular-nums">${line.remaining.toLocaleString("en-US")}</td>
                      <td className="px-2.5 py-2.5">
                        {canPay ? (
                          <form action={recordPaymentAction} className="flex items-center justify-end gap-1 whitespace-nowrap">
                            <input type="hidden" name="studentId" value={line.studentId} />
                            <input type="hidden" name="installmentId" value={line.installmentId} />
                            <input type="hidden" name="preserveStatus" value={statusFilter} />
                            <input type="hidden" name="preserveClassId" value={classFilter} />
                            <Input
                              name="amount"
                              type="number"
                              min="0.01"
                              step="0.01"
                              placeholder="المبلغ"
                              required
                              className="h-8 w-[5.25rem] rounded-lg text-xs"
                            />
                            <Button type="submit" variant="outline" size="sm" className="h-8 shrink-0 text-xs">
                              تسجيل
                            </Button>
                          </form>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2.5 text-right">
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
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
