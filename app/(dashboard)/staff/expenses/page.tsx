import {
  createExpense,
  deleteTeacherSalaryPayment,
  deleteExpense,
  getFinancialSummary,
  listExpenseLedger,
  updateTeacherSalaryPayment,
  updateExpense,
} from "@/actions/expenses";
import UserCard from "@/components/component/UserCard";
import { Button } from "@/components/ui/button";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AddExpenseDialog } from "./add-expense-dialog";
import { ExpenseRowActions } from "./expense-row-actions";
import { TeacherSalaryPaymentRowActions } from "./teacher-salary-payment-row-actions";

type ExpensesPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
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

function sumExpenseAmountRows(rows: { amount?: string | number | null }[] | null): number {
  let sum = 0;
  for (const row of rows ?? []) {
    const raw = row?.amount;
    const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));
    if (Number.isFinite(n)) sum += n;
  }
  return Number(sum.toFixed(2));
}

export default async function StaffExpensesPage({ searchParams }: ExpensesPageProps) {
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
      <div className="p-4 flex flex-col gap-8" dir="rtl">
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-center text-sm text-amber-900">
          لم يتم العثور على مدرسة مرتبطة بحسابك.
        </div>
      </div>
    );
  }

  const [ledgerResult, summaryResult, expSumRes] = await Promise.all([
    listExpenseLedger(),
    getFinancialSummary(),
    supabase.from("expenses").select("amount").eq("school_id", schoolId),
  ]);

  const ledgerItems = ledgerResult.success ? ledgerResult.items : [];

  const expensesTableSumOk = !expSumRes.error;
  const expensesTableTotal = expensesTableSumOk ? sumExpenseAmountRows(expSumRes.data as { amount?: string | number | null }[]) : 0;

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
      redirect(buildRedirectUrl("error", "أدخل مبلغًا صالحًا."));
      return;
    }

    const result = await updateExpense({
      id,
      title,
      amount,
      expenseDate: expenseDate ?? undefined,
      confirmPersonalFunds: formDataConfirmPersonalFunds(formData),
    });

    redirect(buildRedirectUrl(result.success ? "success" : "error", result.message));
  }

  async function deleteExpenseAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "").trim();
    const result = await deleteExpense({ id });
    redirect(buildRedirectUrl(result.success ? "success" : "error", result.message));
  }

  async function updateTeacherSalaryPaymentAction(formData: FormData) {
    "use server";
    const paymentId = String(formData.get("paymentId") ?? "").trim();
    const amount = asPositiveNumber(formData.get("amount"));
    const paidAt = asNullableText(formData.get("paidAt"));

    if (!paymentId) {
      redirect(buildRedirectUrl("error", "معرّف دفعة الراتب مفقود."));
      return;
    }
    if (amount === undefined) {
      redirect(buildRedirectUrl("error", "أدخل مبلغ دفعة صالحًا."));
      return;
    }

    const result = await updateTeacherSalaryPayment({
      paymentId,
      amount,
      paidAt: paidAt ?? undefined,
    });
    redirect(buildRedirectUrl(result.success ? "success" : "error", result.message));
  }

  async function deleteTeacherSalaryPaymentAction(formData: FormData) {
    "use server";
    const paymentId = String(formData.get("paymentId") ?? "").trim();
    const result = await deleteTeacherSalaryPayment({ paymentId });
    redirect(buildRedirectUrl(result.success ? "success" : "error", result.message));
  }

  const defaultExpenseDate = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-4 flex flex-col gap-8 min-w-0" dir="rtl">


      {pageMessage ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            pageStatus === "success"
              ? "border-green-500/40 bg-green-500/10 text-green-800"
              : "border-red-500/40 bg-red-500/10 text-red-800"
          }`}
        >
          {pageMessage}
        </div>
      ) : null}

      {!ledgerResult.success ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
          {ledgerResult.message}
        </div>
      ) : null}

      {!summaryResult.success ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {summaryResult.message}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-4 justify-start flex-wrap">
            <UserCard type="إجمالي مصروفات المدرسة" count={summaryResult.totalExpenses} badgeLabel="ملخص مالي" valuePrefix="$" />
            <UserCard type="الرصيد المتاح (بعد المصروفات)" count={summaryResult.netProfit} badgeLabel="صافٍ" valuePrefix="$" />

          </div>
          {!expensesTableSumOk ? (
            <p className="text-sm text-destructive">
              {expSumRes.error?.message ?? "تعذر جمع مبالغ جدول المصروفات اليدوية."}
            </p>
          ) : null}
        </div>
      )}

      <section className="rounded-xl border border-muted-foreground/20 bg-muted/20 p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-semibold text-foreground">سجل المصاريف</h2>
            {ledgerResult.success ? (
              <p className="text-xs text-muted-foreground">
                المعروض: {ledgerItems.length}
                {ledgerResult.hasMore
                  ? ` — من أصل ${ledgerResult.total} (الأحدث أولاً؛ لقائمة دفعات الرواتب الكاملة استخدم أقساط المعلمين).`
                  : null}
              </p>
            ) : null}
          </div>
          <AddExpenseDialog createExpenseAction={createExpenseAction} defaultExpenseDate={defaultExpenseDate} />
        </div>
        {!ledgerResult.success ? null : ledgerItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-background/40 p-8 text-center text-sm text-muted-foreground">
            لا توجد حركات في السجل (لا دفعات رواتب ولا مصروفات يدوية).
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60 bg-background/60">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead className="bg-muted/50 text-right">
                <tr>
                  <th className="px-4 py-3 font-medium text-foreground">التاريخ</th>
                  <th className="px-4 py-3 font-medium text-foreground">النوع / العنوان</th>
                  <th className="px-4 py-3 font-medium text-foreground">المبلغ</th>
                  <th className="px-4 py-3 font-medium w-[1%] whitespace-nowrap text-foreground">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {ledgerItems.map((row) => (
                  <tr key={row.ledgerKey} className="border-t border-border/60">
                    <td className="px-4 py-3 whitespace-nowrap">{row.expenseDate}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {row.source === "teacher_salary_payment" ? (
                          <span className="rounded-lg bg-sky px-2 py-0.5 text-xs font-medium text-foreground">
                            دفعة راتب
                          </span>
                        ) : row.type === "salary" ? (
                          <span className="rounded-lg bg-Yellow/80 px-2 py-0.5 text-xs font-medium text-foreground">راتب</span>
                        ) : (
                          <span className="rounded-lg bg-muted px-2 py-0.5 text-xs font-medium text-foreground">عام</span>
                        )}
                        <span>{row.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium">${row.amount.toLocaleString("en-US")}</td>
                    <td className="px-4 py-3">
                      {row.canEdit ? (
                        row.source === "manual" ? (
                          <ExpenseRowActions
                            id={row.id}
                            title={row.title}
                            amount={row.amount}
                            expenseDate={row.expenseDate}
                            updateExpenseAction={updateExpenseAction}
                            deleteExpenseAction={deleteExpenseAction}
                          />
                        ) : (
                          <TeacherSalaryPaymentRowActions
                            paymentId={row.id}
                            amount={row.amount}
                            expenseDate={row.expenseDate}
                            updateTeacherSalaryPaymentAction={updateTeacherSalaryPaymentAction}
                            deleteTeacherSalaryPaymentAction={deleteTeacherSalaryPaymentAction}
                          />
                        )
                      ) : (
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          <Button variant="outline" size="sm" asChild className="h-8 rounded-lg text-xs">
                            <Link href="/staff/teacher-installments">أقساط المعلمين</Link>
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
