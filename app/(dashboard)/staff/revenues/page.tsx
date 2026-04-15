import { getFinancialSummary } from "@/actions/expenses";
import {
  createRevenue,
  deleteRevenue,
  getTotalRevenuesAmount,
  listRevenueLedger,
  updateRevenue,
} from "@/actions/revenues";
import UserCard from "@/components/component/UserCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AddRevenueDialog } from "./add-revenue-dialog";

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
          <div className="flex gap-4 justify-between flex-wrap">
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

      {editing ? (
        <section className="rounded-xl border border-primary/35 bg-sky/40 p-4 shadow-sm sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-foreground">تعديل إيراد</h2>
            <Link
              href="/staff/revenues"
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              إلغاء التعديل
            </Link>
          </div>
          <form action={updateRevenueAction} className="space-y-4">
            <input type="hidden" name="id" value={editing.id} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="editTitle" className="text-muted-foreground">
                  العنوان / الوصف
                </Label>
                <Input
                  id="editTitle"
                  name="title"
                  required
                  defaultValue={editing.title}
                  placeholder="مثال: تبرع جهة خيرية، إيجار قاعة…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editAmount" className="text-muted-foreground">
                  المبلغ
                </Label>
                <Input
                  id="editAmount"
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  defaultValue={editing.amount}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="editRevenueDate" className="text-muted-foreground">
                  تاريخ الإيراد
                </Label>
                <Input
                  id="editRevenueDate"
                  name="revenueDate"
                  type="date"
                  required
                  defaultValue={editing.revenue_date.slice(0, 10)}
                />
              </div>
            </div>
            <Button
              type="submit"
              className="rounded-xl bg-Yellow px-4 text-foreground shadow-sm hover:bg-Yellow/90 hover:scale-[1.02] transition-transform"
            >
              حفظ التعديلات
            </Button>
          </form>
        </section>
      ) : null}

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
          <AddRevenueDialog createRevenueAction={createRevenueAction} defaultRevenueDate={defaultRevenueDate} />
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
                        <div className="flex flex-wrap gap-2 justify-end">
                          <Button variant="outline" size="sm" asChild className="h-8 rounded-lg text-xs">
                            <Link href={`/staff/revenues?edit=${row.id}`}>تعديل</Link>
                          </Button>
                          <form action={deleteRevenueAction} className="inline">
                            <input type="hidden" name="id" value={row.id} />
                            <Button
                              type="submit"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg border-red-500/40 text-xs text-red-800 hover:bg-red-500/10"
                            >
                              حذف
                            </Button>
                          </form>
                        </div>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-2">
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
