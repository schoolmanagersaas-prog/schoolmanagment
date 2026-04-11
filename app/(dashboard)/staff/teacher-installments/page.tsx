import {
  createTeacherInstallment,
  deleteTeacherInstallment,
  listTeacherInstallmentLines,
  recordTeacherSalaryPayment,
  updateTeacherInstallment,
  type TeacherInstallmentPaymentStatus,
} from "@/actions/teacher-installments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { cn } from "@/lib/utils";
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
      <div className="p-4 flex flex-col gap-8" dir="rtl">
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-center text-sm text-amber-900">
          لم يتم العثور على مدرسة مرتبطة بحسابك.
        </div>
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
    <div className="p-4 flex flex-col gap-8 min-w-0" dir="rtl">
      <div className="rounded-2xl bg-sky p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">رواتب المعلمين — أقساط ودفعات</h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              يُعرّف قسط الراتب الأول غالباً من «إضافة معلم» عند إدخال راتب أكبر من صفر؛ من الجدول يمكنك إضافة أقساط أخرى،
              أو تعديل القسط، أو حذفه إن لم تُسجَّل دفعات. تسجيل صرف الراتب من عمود «دفعة».
            </p>
            <p className="text-xs text-gray-600">
              <Link href="/staff/teacherslist" className="font-medium text-foreground underline-offset-4 hover:underline">
                قائمة المعلمين
              </Link>
              <span className="mx-1.5 text-muted-foreground">·</span>
              <Link href="/staff/addteachers" className="font-medium text-foreground underline-offset-4 hover:underline">
                إضافة معلم
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
          <h2 className="text-lg font-semibold text-foreground">أقساط الرواتب</h2>
          {listResult.success ? (
            <p className="text-xs text-muted-foreground">عدد السجلات: {lines.length}</p>
          ) : null}
        </div>
        {lines.length === 0 ? (
          <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-background/40 p-8 text-center text-sm text-muted-foreground">
            لا توجد أقساط مطابقة للتصفية. عرّف المعلم من «إضافة معلم» براتب أكبر من صفر وتاريخ استحقاق ليظهر القسط هنا،
            أو أضف قسطاً من إجراءات صف موجود.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60 bg-background/60">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-right">
                  <th className="px-4 py-3 font-medium">اسم المعلم</th>
                  <th className="px-4 py-3 font-medium">المادة</th>
                  <th className="px-4 py-3 font-medium">تاريخ الاستحقاق</th>
                  <th className="px-4 py-3 font-medium">المبلغ</th>
                  <th className="px-4 py-3 font-medium">المدفوع</th>
                  <th className="px-4 py-3 font-medium">المتبقي</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap w-[1%]">دفعة</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap w-[1%] text-right">إجراءات</th>
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
                      <td className="px-4 py-3 font-medium">{line.teacherName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{line.subject ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">{line.dueDate}</td>
                      <td className="px-4 py-3 tabular-nums">{line.totalAmount.toLocaleString("en-US")}</td>
                      <td className="px-4 py-3 tabular-nums">{line.totalPaid.toLocaleString("en-US")}</td>
                      <td className="px-4 py-3 tabular-nums">{line.remaining.toLocaleString("en-US")}</td>
                      <td className="px-4 py-3">
                        {canPay ? (
                          <form action={recordPaymentAction} className="flex flex-wrap items-center justify-end gap-1.5">
                            <input type="hidden" name="teacherId" value={line.teacherId} />
                            <input type="hidden" name="installmentId" value={line.installmentId} />
                            <input type="hidden" name="preserveStatus" value={statusFilter} />
                            <Input
                              name="amount"
                              type="number"
                              min="0.01"
                              step="0.01"
                              placeholder="المبلغ"
                              required
                              className="h-8 w-[6.5rem] rounded-lg text-xs"
                            />
                            <Button type="submit" variant="outline" size="sm" className="h-8 shrink-0 text-xs">
                              تسجيل
                            </Button>
                          </form>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
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
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
