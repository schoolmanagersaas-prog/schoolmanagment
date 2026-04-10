import {
  createExpense,
  deleteExpense,
  getFinancialSummary,
  getTotalExpensesAmount,
  listExpenseLedger,
  updateExpense,
} from "@/actions/expenses";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

type ExpensesPageProps = {
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
  return `/staff/expenses?${q.toString()}`;
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

function formDataConfirmPersonalFunds(formData: FormData): boolean {
  const v = formData.get("confirmPersonalFunds");
  return v === "on" || v === "true" || v === "1";
}

type ExpenseEditRow = {
  id: string;
  title: string;
  amount: number;
  expense_date: string;
};

export default async function StaffExpensesPage({ searchParams }: ExpensesPageProps) {
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
    listExpenseLedger(),
    getTotalExpensesAmount(),
    getFinancialSummary(),
  ]);

  const ledgerItems = ledgerResult.success ? ledgerResult.items : [];

  let editing: ExpenseEditRow | undefined;
  if (editId) {
    const { data: row } = await supabase
      .from("expenses")
      .select("id,title,amount,expense_date")
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
        expense_date: row.expense_date,
      };
    }
  }

  async function createExpenseAction(formData: FormData) {
    "use server";
    const title = String(formData.get("title") ?? "").trim();
    const amount = asPositiveNumber(formData.get("amount"));
    const expenseDate = asNullableText(formData.get("expenseDate"));

    if (amount === undefined) {
      redirect(buildRedirectUrl("error", "أدخل مبلغًا صالحًا."));
      return;
    }

    const result = await createExpense({
      title,
      amount,
      expenseDate: expenseDate ?? undefined,
      confirmPersonalFunds: formDataConfirmPersonalFunds(formData),
    });

    redirect(buildRedirectUrl(result.success ? "success" : "error", result.message));
  }

  async function updateExpenseAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const amount = asPositiveNumber(formData.get("amount"));
    const expenseDate = asNullableText(formData.get("expenseDate"));

    if (!id) {
      redirect(buildRedirectUrl("error", "معرّف المصروف مفقود."));
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

    const result = await updateExpense({
      id,
      title,
      amount,
      expenseDate: expenseDate ?? undefined,
      confirmPersonalFunds: formDataConfirmPersonalFunds(formData),
    });

    redirect(
      buildRedirectUrl(result.success ? "success" : "error", result.message, {
        ...(result.success ? {} : { edit: id }),
      }),
    );
  }

  async function deleteExpenseAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "").trim();
    const result = await deleteExpense({ id });
    redirect(buildRedirectUrl(result.success ? "success" : "error", result.message));
  }

  const totalDisplay = totalResult.success
    ? totalResult.total.toLocaleString("en-US")
    : null;

  return (
    <div className="w-full max-w-6xl space-y-6" dir="rtl">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">المصاريف</h1>
        <p className="text-sm text-muted-foreground">
          سجل المصاريف أدناه يجمع تلقائياً دفعات رواتب المعلمين (عند الصرف من صفحة أقساط الرواتب) مع المصروفات
          اليدوية المسجّلة في النموذج. إجمالي المصروفات في البطاقة يطابق الملخص المالي دون تكرار في قاعدة البيانات.
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">إجمالي المصروفات</p>
          {totalResult.success ? (
            <p className="mt-2 text-3xl font-bold tabular-nums">{totalDisplay}</p>
          ) : (
            <p className="mt-2 text-sm text-destructive">{totalResult.message}</p>
          )}
        </div>
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">الرصيد المتاح (بعد المصروفات)</p>
          {summaryResult.success ? (
            <p
              className={`mt-2 text-3xl font-bold tabular-nums ${
                summaryResult.netProfit < 0 ? "text-destructive" : ""
              }`}
            >
              {summaryResult.netProfit.toLocaleString("en-US")}
            </p>
          ) : (
            <p className="mt-2 text-sm text-destructive">{summaryResult.message}</p>
          )}
          {summaryResult.success ? (
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              الإيرادات تشمل دفعات الطلاب والإيرادات المسجّلة؛ المصروفات تشمل المصروفات اليدوية ودفعات رواتب المعلمين.
              الرصيد = الإيرادات ناقص المصروفات. لا يُسمح بتسجيل مصروف يتجاوز الرصيد إلا بعد تأكيد أنه من مال شخصي.
            </p>
          ) : null}
        </div>
      </div>

      {editing ? (
        <section className="rounded-lg border border-primary/30 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">تعديل مصروف</h2>
            <Link href="/staff/expenses" className="text-sm text-muted-foreground hover:text-foreground">
              إلغاء التعديل
            </Link>
          </div>
          <form action={updateExpenseAction} className="space-y-4">
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
                  placeholder="مثال: راتب شهر مارس، شراء مستلزمات…"
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
                <label htmlFor="editExpenseDate" className="text-sm font-medium">
                  تاريخ المصروف
                </label>
                <input
                  id="editExpenseDate"
                  name="expenseDate"
                  type="date"
                  required
                  defaultValue={editing.expense_date.slice(0, 10)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="flex items-start gap-2 md:col-span-2">
                <input
                  id="editConfirmPersonalFunds"
                  name="confirmPersonalFunds"
                  type="checkbox"
                  value="1"
                  className="mt-1 h-4 w-4 rounded border"
                />
                <label htmlFor="editConfirmPersonalFunds" className="text-sm leading-relaxed text-muted-foreground">
                  أؤكد أن هذا المصروف من مال شخصي للمدير أو خارج صندوق المدرسة عند تجاوز الرصيد المتاح.
                </label>
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
        <h2 className="text-lg font-semibold">إضافة مصروف</h2>
        <form action={createExpenseAction} className="space-y-4">
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
                placeholder="مثال: راتب معلم، فاتورة كهرباء، صيانة…"
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
              <label htmlFor="expenseDate" className="text-sm font-medium">
                تاريخ المصروف
              </label>
              <input
                id="expenseDate"
                name="expenseDate"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="flex items-start gap-2 md:col-span-2">
              <input
                id="confirmPersonalFunds"
                name="confirmPersonalFunds"
                type="checkbox"
                value="1"
                className="mt-1 h-4 w-4 rounded border"
              />
              <label htmlFor="confirmPersonalFunds" className="text-sm leading-relaxed text-muted-foreground">
                أؤكد أن هذا المصروف من مال شخصي للمدير أو خارج صندوق المدرسة عند تجاوز الرصيد المتاح.
              </label>
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            تسجيل المصروف
          </button>
        </form>
      </section>

      <section className="rounded-lg border overflow-hidden">
        <div className="border-b px-5 py-3">
          <h2 className="text-lg font-semibold">سجل المصاريف</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {ledgerResult.success ? (
              <>
                المعروض: {ledgerItems.length}
                {ledgerResult.hasMore
                  ? ` — من أصل ${ledgerResult.total} (الأحدث أولاً؛ لقائمة دفعات الرواتب الكاملة استخدم أقساط المعلمين).`
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
                    لا توجد حركات في السجل (لا دفعات رواتب ولا مصروفات يدوية).
                  </td>
                </tr>
              ) : (
                ledgerItems.map((row) => (
                  <tr key={row.ledgerKey} className="border-t">
                    <td className="px-4 py-2 whitespace-nowrap">{row.expenseDate}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {row.source === "teacher_salary_payment" ? (
                          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            دفعة راتب
                          </span>
                        ) : row.type === "salary" ? (
                          <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-900">
                            راتب
                          </span>
                        ) : (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">عام</span>
                        )}
                        <span>{row.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 tabular-nums">{row.amount.toLocaleString("en-US")}</td>
                    <td className="px-4 py-2">
                      {row.canEdit ? (
                        <div className="flex flex-wrap gap-2 justify-end">
                          <Link
                            href={`/staff/expenses?edit=${row.id}`}
                            className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                          >
                            تعديل
                          </Link>
                          <form action={deleteExpenseAction}>
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
                            href="/staff/teacher-installments"
                            className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                          >
                            أقساط المعلمين
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
