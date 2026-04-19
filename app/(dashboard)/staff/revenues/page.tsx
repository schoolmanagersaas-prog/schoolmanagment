import { getFinancialSummary } from "@/actions/expenses";
import {
  createRevenue,
  deleteTuitionPayment,
  deleteRevenue,
  getTotalRevenuesAmount,
  listRevenueLedger,
  updateTuitionPayment,
  updateRevenue,
} from "@/actions/revenues";
import UserCard from "@/components/component/UserCard";
import { Button } from "@/components/ui/button";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AddRevenueDialog } from "./add-revenue-dialog";
import { RevenueRowActions } from "./revenue-row-actions";
import { TuitionPaymentRowActions } from "./tuition-payment-row-actions";

type RevenuesPageProps = {
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

export default async function StaffRevenuesPage({ searchParams }: RevenuesPageProps) {
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

  const [ledgerResult, totalResult, summaryResult] = await Promise.all([
    listRevenueLedger(),
    getTotalRevenuesAmount(),
    getFinancialSummary(),
  ]);

  const ledgerItems = ledgerResult.success ? ledgerResult.items : [];

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
      redirect(buildRedirectUrl("error", "أدخل مبلغًا صالحًا."));
      return;
    }

    const result = await updateRevenue({
      id,
      title,
      amount,
      revenueDate: revenueDate ?? undefined,
    });

    redirect(buildRedirectUrl(result.success ? "success" : "error", result.message));
  }

  async function deleteRevenueAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "").trim();
    const result = await deleteRevenue({ id });
    redirect(buildRedirectUrl(result.success ? "success" : "error", result.message));
  }

  async function updateTuitionPaymentAction(formData: FormData) {
    "use server";
    const paymentId = String(formData.get("paymentId") ?? "").trim();
    const amount = asPositiveNumber(formData.get("amount"));
    const paidAt = asNullableText(formData.get("paidAt"));

    if (!paymentId) {
      redirect(buildRedirectUrl("error", "معرّف الدفعة مفقود."));
      return;
    }
    if (amount === undefined) {
      redirect(buildRedirectUrl("error", "أدخل مبلغ دفعة صالحًا."));
      return;
    }

    const result = await updateTuitionPayment({
      paymentId,
      amount,
      paidAt: paidAt ?? undefined,
    });
    redirect(buildRedirectUrl(result.success ? "success" : "error", result.message));
  }

  async function deleteTuitionPaymentAction(formData: FormData) {
    "use server";
    const paymentId = String(formData.get("paymentId") ?? "").trim();
    const result = await deleteTuitionPayment({ paymentId });
    redirect(buildRedirectUrl(result.success ? "success" : "error", result.message));
  }

  const defaultRevenueDate = new Date().toISOString().slice(0, 10);

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
          <div className="flex flex-wrap items-stretch justify-start gap-4">
            <UserCard type="إجمالي إيرادات المدرسة" count={summaryResult.totalIncome} badgeLabel="ملخص مالي" valuePrefix="$" />
            <UserCard type="منها: دفعات الطلاب" count={summaryResult.paymentsTotal} badgeLabel="أقساط" valuePrefix="$" />
            <UserCard
              type="منها: إيرادات يدوية فقط"
              count={totalResult.success ? totalResult.total : 0}
              badgeLabel={totalResult.success ? "جدول revenues" : "تعذر الجلب"}
              valuePrefix="$"
            />
          </div>
          {!totalResult.success ? (
            <p className="text-sm text-destructive">{totalResult.message}</p>
          ) : null}
        </div>
      )}

      <section className="rounded-xl border border-muted-foreground/20 bg-muted/20 p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-semibold text-foreground">سجل الإيرادات</h2>
            {ledgerResult.success ? (
              <p className="text-xs text-muted-foreground">
                المعروض: {ledgerItems.length}
                {ledgerResult.hasMore
                  ? ` — من أصل ${ledgerResult.total} (الأحدث أولاً؛ لقائمة الدفعات الكاملة استخدم أقساط الطلاب).`
                  : null}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild className="h-9 rounded-xl">
              <a href="/api/exports/revenues">تصدير Excel</a>
            </Button>
            <AddRevenueDialog createRevenueAction={createRevenueAction} defaultRevenueDate={defaultRevenueDate} />
          </div>
        </div>
        {!ledgerResult.success ? null : ledgerItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-background/40 p-8 text-center text-sm text-muted-foreground">
            لا توجد حركات في السجل (لا دفعات قسط ولا إيرادات يدوية).
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
                    <td className="px-4 py-3 whitespace-nowrap">{row.revenueDate}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {row.source === "tuition_payment" ? (
                          <span className="rounded-lg bg-sky px-2 py-0.5 text-xs font-medium text-foreground">
                            دفعة قسط
                          </span>
                        ) : (
                          <span className="rounded-lg bg-Yellow/80 px-2 py-0.5 text-xs font-medium text-foreground">
                            يدوي
                          </span>
                        )}
                        <span>{row.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium">${row.amount.toLocaleString("en-US")}</td>
                    <td className="px-4 py-3">
                      {row.canEdit ? (
                        row.source === "manual" ? (
                          <RevenueRowActions
                            id={row.id}
                            title={row.title}
                            amount={row.amount}
                            revenueDate={row.revenueDate}
                            updateRevenueAction={updateRevenueAction}
                            deleteRevenueAction={deleteRevenueAction}
                          />
                        ) : (
                          <TuitionPaymentRowActions
                            paymentId={row.id}
                            amount={row.amount}
                            revenueDate={row.revenueDate}
                            updateTuitionPaymentAction={updateTuitionPaymentAction}
                            deleteTuitionPaymentAction={deleteTuitionPaymentAction}
                          />
                        )
                      ) : (
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          <Button variant="outline" size="sm" asChild className="h-8 rounded-lg text-xs">
                            <Link href="/staff/student-installments">أقساط الطلاب</Link>
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
