import { getFinancialSummary } from "@/actions/expenses";
import {
  createRevenue,
  deleteRevenue,
  getTotalRevenuesAmount,
  listRevenueLedger,
  updateRevenue,
} from "@/actions/revenues";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type RevenuesPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
    edit?: string;
  }>;
};

function buildRedirectUrl(
  status: "success" | "error",
  message: string,
  extra?: Record<string, string | undefined>,
) {
  const q = new URLSearchParams();
  q.set("status", status);
  q.set("message", message);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) q.set(k, v);
    }
  }
  return `/staff/revenues?${q.toString()}`;
}

function asNullableText(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function asPositiveNumber(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return undefined;
  return number;
}

type RevenueEditRow = {
  id: string;
  title: string;
  amount: number;
  revenue_date: string;
};

export default async function StaffRevenuesPage({ searchParams }: RevenuesPageProps) {
  const params = (await searchParams) ?? {};
  const pageStatus = params.status;
  const pageMessage = params.message;
  const editId = params.edit?.trim() || undefined;

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

  const [ledgerResult, totalResult, summaryResult] = await Promise.all([
    listRevenueLedger(),
    getTotalRevenuesAmount(),
    getFinancialSummary(),
  ]);

  const ledgerItems = ledgerResult.success ? ledgerResult.items : [];

  let editing: RevenueEditRow | undefined;
  if (editId) {
    const { data: row } = await supabase
      .from("revenues")
      .select("id,title,amount,revenue_date")
      .eq("id", editId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (row) {
      const amount =
        typeof row.amount === "number" ? row.amount : Number.parseFloat(String(row.amount));
      editing = {
        id: row.id,
        title: row.title,
        amount: Number.isFinite(amount) ? amount : 0,
        revenue_date: row.revenue_date,
      };
    }
  }

  async function createRevenueAction(formData: FormData) {
    "use server";
    const title = String(formData.get("title") ?? "").trim();
    const amount = asPositiveNumber(formData.get("amount"));
    const revenueDate = asNullableText(formData.get("revenueDate"));

    if (amount === undefined) {
      redirect(buildRedirectUrl("error", "أدخل مبلغًا صالحًا."));
      return;
    }

    const result = await createRevenue({
      title,
      amount,
      revenueDate: revenueDate ?? undefined,
    });

    redirect(buildRedirectUrl(result.success ? "success" : "error", result.message));
  }

  async function updateRevenueAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const amount = asPositiveNumber(formData.get("amount"));
    const revenueDate = asNullableText(formData.get("revenueDate"));

    if (!id) {
      redirect(buildRedirectUrl("error", "معرّف الإيراد مفقود."));
      return;
    }
    if (amount === undefined) {
      redirect(
        buildRedirectUrl("error", "أدخل مبلغًا صالحًا.", {
          edit: id,
        }),
      );
      return;
    }

    const result = await updateRevenue({
      id,
      title,
      amount,
      revenueDate: revenueDate ?? undefined,
    });

    redirect(
      buildRedirectUrl(result.success ? "success" : "error", result.message, {
        ...(result.success ? {} : { edit: id }),
      }),
    );
  }

  async function deleteRevenueAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "").trim();
    const result = await deleteRevenue({ id });
    redirect(buildRedirectUrl(result.success ? "success" : "error", result.message));
  }

  const totalDisplay = totalResult.success ? totalResult.total.toLocaleString("en-US") : null;

  return (
    <div className="w-full max-w-6xl space-y-6" dir="rtl">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">الإيرادات</h1>
        <p className="text-sm text-muted-foreground">
          سجل الإيرادات أدناه يجمع تلقائياً دفعات أقساط الطلاب (عند التسديد من صفحة الأقساط) مع الإيرادات اليدوية التي
          تُسجَّل في النموذج (تبرعات، دعم، إيجار، …). الملخص المالي يحسب الإجمالي مرة واحدة دون تكرار في قاعدة البيانات.
        </p>
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

      {!ledgerResult.success ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
          {ledgerResult.message}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-5 shadow-sm sm:col-span-3">
          <p className="text-sm font-medium text-muted-foreground">إجمالي إيرادات المدرسة</p>
          {summaryResult.success ? (
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {summaryResult.totalIncome.toLocaleString("en-US")}
            </p>
          ) : (
            <p className="mt-2 text-sm text-destructive">{summaryResult.message}</p>
          )}
          {summaryResult.success ? (
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              مجموع دفعات الطلاب + الإيرادات الإضافية المسجّلة أدناه (كما في الملخص المالي).
            </p>
          ) : null}
        </div>
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">منها: دفعات الطلاب</p>
          {summaryResult.success ? (
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {summaryResult.paymentsTotal.toLocaleString("en-US")}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">—</p>
          )}
        </div>
        <div className="rounded-lg border bg-card p-5 shadow-sm sm:col-span-2">
          <p className="text-sm font-medium text-muted-foreground">منها: إيرادات يدوية فقط (جدول revenues)</p>
          {totalResult.success ? (
            <p className="mt-2 text-2xl font-bold tabular-nums">{totalDisplay}</p>
          ) : (
            <p className="mt-2 text-sm text-destructive">{totalResult.message}</p>
          )}
        </div>
      </div>

      {editing ? (
        <section className="rounded-lg border border-primary/30 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">تعديل إيراد</h2>
            <Link href="/staff/revenues" className="text-sm text-muted-foreground hover:text-foreground">
              إلغاء التعديل
            </Link>
          </div>
          <form action={updateRevenueAction} className="space-y-4">
            <input type="hidden" name="id" value={editing.id} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="editTitle" className="text-sm font-medium">
                  العنوان / الوصف
                </label>
                <input
                  id="editTitle"
                  name="title"
                  required
                  defaultValue={editing.title}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="مثال: تبرع جهة خيرية، إيجار قاعة…"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="editAmount" className="text-sm font-medium">
                  المبلغ
                </label>
                <input
                  id="editAmount"
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  defaultValue={editing.amount}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="editRevenueDate" className="text-sm font-medium">
                  تاريخ الإيراد
                </label>
                <input
                  id="editRevenueDate"
                  name="revenueDate"
                  type="date"
                  required
                  defaultValue={editing.revenue_date.slice(0, 10)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
            <button
              type="submit"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              حفظ التعديلات
            </button>
          </form>
        </section>
      ) : null}

      <section className="rounded-lg border p-5 space-y-4">
        <h2 className="text-lg font-semibold">إضافة إيراد</h2>
        <form action={createRevenueAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="title" className="text-sm font-medium">
                العنوان / الوصف
              </label>
              <input
                id="title"
                name="title"
                required
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="مثال: تبرع، منحة، بيع مستلزمات…"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="amount" className="text-sm font-medium">
                المبلغ
              </label>
              <input
                id="amount"
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="revenueDate" className="text-sm font-medium">
                تاريخ الإيراد
              </label>
              <input
                id="revenueDate"
                name="revenueDate"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            تسجيل الإيراد
          </button>
        </form>
      </section>

      <section className="rounded-lg border overflow-hidden">
        <div className="border-b px-5 py-3">
          <h2 className="text-lg font-semibold">سجل الإيرادات</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {ledgerResult.success ? (
              <>
                المعروض: {ledgerItems.length}
                {ledgerResult.hasMore
                  ? ` — من أصل ${ledgerResult.total} (الأحدث أولاً؛ لقائمة الدفعات الكاملة استخدم أقساط الطلاب).`
                  : null}
              </>
            ) : null}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-right">
              <tr>
                <th className="px-4 py-2 font-medium">التاريخ</th>
                <th className="px-4 py-2 font-medium">النوع / العنوان</th>
                <th className="px-4 py-2 font-medium">المبلغ</th>
                <th className="px-4 py-2 font-medium w-[1%] whitespace-nowrap">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {ledgerItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    لا توجد حركات في السجل (لا دفعات قسط ولا إيرادات يدوية).
                  </td>
                </tr>
              ) : (
                ledgerItems.map((row) => (
                  <tr key={row.ledgerKey} className="border-t">
                    <td className="px-4 py-2 whitespace-nowrap">{row.revenueDate}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {row.source === "tuition_payment" ? (
                          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            دفعة قسط
                          </span>
                        ) : (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">يدوي</span>
                        )}
                        <span>{row.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 tabular-nums">{row.amount.toLocaleString("en-US")}</td>
                    <td className="px-4 py-2">
                      {row.canEdit ? (
                        <div className="flex flex-wrap gap-2 justify-end">
                          <Link
                            href={`/staff/revenues?edit=${row.id}`}
                            className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                          >
                            تعديل
                          </Link>
                          <form action={deleteRevenueAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-700 hover:bg-red-500/10"
                            >
                              حذف
                            </button>
                          </form>
                        </div>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link
                            href="/staff/student-installments"
                            className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                          >
                            أقساط الطلاب
                          </Link>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
