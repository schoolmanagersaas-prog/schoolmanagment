"use server";

import { revalidatePath } from "next/cache";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";

/** يطابق public.expense_type في schame.md */
export type ExpenseType = "salary" | "general";

type ActionResult =
  | { success: true; message: string }
  | { success: false; message: string; code?: "INSUFFICIENT_FUNDS" };

type AuthContext =
  | { ok: true; userId: string; schoolId: string }
  | { ok: false; message: string };

type ExpenseRow = {
  id: string;
  school_id: string;
  title: string;
  amount: number | string;
  type: ExpenseType;
  expense_date: string;
  created_at: string;
};

export type CreateExpenseInput = {
  title: string;
  amount: number;
  expenseDate?: string;
  /** افتراضي: general (العمود مطلوب في قاعدة البيانات) */
  type?: ExpenseType;
  /**
   * عندما يتجاوز المبلغ الرصيد المتاح (إجمالي الوارد − المصروفات)، يجب التأكيد
   * إن كان المصروف من مال شخصي للمدير أو خارج صندوق المدرسة.
   */
  confirmPersonalFunds?: boolean;
};

export type UpdateExpenseInput = {
  id: string;
  title?: string;
  amount?: number;
  type?: ExpenseType;
  expenseDate?: string;
  confirmPersonalFunds?: boolean;
};

export type DeleteExpenseInput = {
  id: string;
};

export type ExpenseListItem = {
  id: string;
  title: string;
  amount: number;
  type: ExpenseType;
  expenseDate: string;
  createdAt: string;
};

export type ListExpensesFilters = {
  type?: ExpenseType;
  from?: string;
  to?: string;
  limit?: number;
};

export type ListExpensesResult =
  | {
      success: true;
      expenses: ExpenseListItem[];
      total: number;
      message: string;
    }
  | {
      success: false;
      expenses: [];
      total: 0;
      message: string;
    };

/** سجل المصاريف المعروض: يدوي من `expenses` أو دفعة راتب من `teacher_payments`. */
export type ExpenseLedgerSource = "manual" | "teacher_salary_payment";

export type ExpenseLedgerItem = {
  ledgerKey: string;
  source: ExpenseLedgerSource;
  id: string;
  title: string;
  amount: number;
  expenseDate: string;
  createdAt: string;
  type: ExpenseType;
  canEdit: boolean;
  teacherId: string | null;
  installmentId: string | null;
};

export type ListExpenseLedgerResult =
  | {
      success: true;
      items: ExpenseLedgerItem[];
      total: number;
      hasMore: boolean;
      message: string;
    }
  | {
      success: false;
      items: [];
      total: 0;
      hasMore: false;
      message: string;
    };

export type TotalExpensesResult =
  | { success: true; total: number }
  | { success: false; total: 0; message: string };

export type UpdateTeacherSalaryPaymentInput = {
  paymentId: string;
  amount: number;
  paidAt?: string;
};

export type DeleteTeacherSalaryPaymentInput = {
  paymentId: string;
};

export type FinancialSummaryResult =
  | {
      success: true;
      /** إجمالي الإيرادات: دفعات الطلاب (payments) + إيرادات مسجّلة في جدول revenues */
      totalIncome: number;
      totalExpenses: number;
      netProfit: number;
      paymentsTotal: number;
      /** إيرادات تُسجَّل يدوياً في صفحة الإيرادات (غير دفعات الطلاب) */
      additionalRevenuesTotal: number;
    }
  | { success: false; message: string };

const INSUFFICIENT_FUNDS_MESSAGE =
  "المبلغ يتجاوز الرصيد المتاح للمدرسة (إجمالي الإيرادات: دفعات الطلاب + الإيرادات المسجّلة، ناقص المصروفات). إن كان المصروف من مال شخصي للمدير أو خارج الصندوق، فعّل خيار التأكيد ثم أعد المحاولة.";

function normalizeTitle(value: string): string {
  return value.trim();
}

function parseExpenseType(value: string): ExpenseType | null {
  const v = value.trim();
  if (v === "salary" || v === "general") return v;
  return null;
}

function toStrictlyPositiveAmount(value: number | undefined): number {
  if (value === undefined) return -1;
  if (!Number.isFinite(value) || value <= 0) return -1;
  return Number(value.toFixed(2));
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseDateOnly(dateText: string | undefined): string | null {
  const value = dateText?.trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return value;
}

async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "يجب تسجيل الدخول أولًا." };
  }

  const schoolId = await resolveSchoolId(supabase, user.id, user.email);
  if (!schoolId) {
    return { ok: false, message: "لم يتم العثور على مدرسة مرتبطة بحسابك." };
  }

  return { ok: true, userId: user.id, schoolId };
}

function revalidateExpensesViews() {
  revalidatePath("/staff/expenses");
  revalidatePath("/staff/revenues");
  revalidatePath("/admin");
}

function exceedsAvailable(netProfit: number, proposedExpenseAmount: number): boolean {
  return proposedExpenseAmount > netProfit + 0.005;
}

function sumAmountRows(rows: { amount?: string | number | null }[] | null): number {
  let sum = 0;
  for (const row of rows ?? []) {
    sum += toNumber(row.amount);
  }
  return Number(sum.toFixed(2));
}

export async function getFinancialSummary(): Promise<FinancialSummaryResult> {
  const auth = await getAuthContext();
  if (!auth.ok) {
    return { success: false, message: auth.message };
  }

  const supabase = await createClient();
  const [viewRes, payRes, revRes] = await Promise.all([
    supabase
      .from("v_financial_summary")
      .select("total_income,total_expenses,net_profit")
      .eq("school_id", auth.schoolId)
      .maybeSingle(),
    supabase.from("payments").select("amount").eq("school_id", auth.schoolId),
    supabase.from("revenues").select("amount").eq("school_id", auth.schoolId),
  ]);

  if (viewRes.error || !viewRes.data || typeof viewRes.data !== "object") {
    return {
      success: false,
      message: viewRes.error?.message ?? "فشل جلب الملخص المالي.",
    };
  }

  if (payRes.error) {
    return {
      success: false,
      message: payRes.error.message ?? "فشل جلب دفعات الطلاب.",
    };
  }

  if (revRes.error) {
    return {
      success: false,
      message: revRes.error.message ?? "فشل جلب الإيرادات المسجّلة.",
    };
  }

  const row = viewRes.data as {
    total_income?: string | number | null;
    total_expenses?: string | number | null;
    net_profit?: string | number | null;
  };

  const paymentsTotal = sumAmountRows(payRes.data as { amount?: string | number | null }[]);
  const additionalRevenuesTotal = sumAmountRows(revRes.data as { amount?: string | number | null }[]);

  return {
    success: true,
    totalIncome: toNumber(row.total_income),
    totalExpenses: toNumber(row.total_expenses),
    netProfit: toNumber(row.net_profit),
    paymentsTotal,
    additionalRevenuesTotal,
  };
}

function mapRow(row: ExpenseRow): ExpenseListItem {
  return {
    id: row.id,
    title: row.title,
    amount: toNumber(row.amount),
    type: row.type,
    expenseDate: row.expense_date,
    createdAt: row.created_at,
  };
}

export async function listExpenses(filters?: ListExpensesFilters): Promise<ListExpensesResult> {
  const auth = await getAuthContext();
  if (!auth.ok) {
    return { success: false, expenses: [], total: 0, message: auth.message };
  }

  const supabase = await createClient();
  let query = supabase
    .from("expenses")
    .select("*", { count: "exact" })
    .eq("school_id", auth.schoolId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters?.type) {
    query = query.eq("type", filters.type);
  }
  if (filters?.from) {
    const from = parseDateOnly(filters.from);
    if (from) query = query.gte("expense_date", from);
  }
  if (filters?.to) {
    const to = parseDateOnly(filters.to);
    if (to) query = query.lte("expense_date", to);
  }

  const limit = filters?.limit ?? 200;
  query = query.limit(Math.min(Math.max(limit, 1), 500));

  const { data, error, count } = await query;

  if (error) {
    return {
      success: false,
      expenses: [],
      total: 0,
      message: error.message ?? "فشل جلب المصاريف.",
    };
  }

  const rows = (data ?? []) as ExpenseRow[];
  return {
    success: true,
    expenses: rows.map(mapRow),
    total: count ?? rows.length,
    message: "تم جلب المصاريف.",
  };
}

type TeacherPaymentLedgerRow = {
  id: string;
  amount: number | string;
  paid_at: string;
  teacher_id: string;
  installment_id: string | null;
  teachers: { full_name: string } | { full_name: string }[] | null;
};

/**
 * سجل مصروفات موحّد: المصروفات اليدوية + دفعات رواتب المعلمين (جدول teacher_payments).
 * لا يُنشئ صفوفاً في `expenses` حتى لا يُحسب المبلغ مرتين في v_financial_summary.
 */
export async function listExpenseLedger(filters?: ListExpensesFilters): Promise<ListExpenseLedgerResult> {
  const auth = await getAuthContext();
  if (!auth.ok) {
    return { success: false, items: [], total: 0, hasMore: false, message: auth.message };
  }

  const maxEach = 400;
  const supabase = await createClient();
  const typeFilter = filters?.type;

  let expQuery = supabase
    .from("expenses")
    .select("*")
    .eq("school_id", auth.schoolId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(maxEach);

  if (typeFilter) {
    expQuery = expQuery.eq("type", typeFilter);
  }
  if (filters?.from) {
    const from = parseDateOnly(filters.from);
    if (from) expQuery = expQuery.gte("expense_date", from);
  }
  if (filters?.to) {
    const to = parseDateOnly(filters.to);
    if (to) expQuery = expQuery.lte("expense_date", to);
  }

  const loadTeacherPayments = typeFilter !== "general";

  let payQuery = supabase
    .from("teacher_payments")
    .select(
      "id,amount,paid_at,teacher_id,installment_id,teachers!teacher_payments_teacher_school_fk(full_name)",
    )
    .eq("school_id", auth.schoolId)
    .order("paid_at", { ascending: false })
    .limit(maxEach);

  if (filters?.from) {
    const from = parseDateOnly(filters.from);
    if (from) payQuery = payQuery.gte("paid_at", `${from}T00:00:00.000Z`);
  }
  if (filters?.to) {
    const to = parseDateOnly(filters.to);
    if (to) payQuery = payQuery.lte("paid_at", `${to}T23:59:59.999Z`);
  }

  const [expRes, payRes] = await Promise.all([
    expQuery,
    loadTeacherPayments ? payQuery : Promise.resolve({ data: [] as TeacherPaymentLedgerRow[], error: null }),
  ]);

  if (expRes.error) {
    return {
      success: false,
      items: [],
      total: 0,
      hasMore: false,
      message: expRes.error.message ?? "فشل جلب المصاريف اليدوية.",
    };
  }

  const manualItems: ExpenseLedgerItem[] = ((expRes.data ?? []) as ExpenseRow[]).map((row) => {
    const m = mapRow(row);
    return {
      ledgerKey: `e-${m.id}`,
      source: "manual",
      id: m.id,
      title: m.title,
      amount: m.amount,
      expenseDate: m.expenseDate.slice(0, 10),
      createdAt: m.createdAt,
      type: m.type,
      canEdit: true,
      teacherId: null,
      installmentId: null,
    };
  });

  let salaryItems: ExpenseLedgerItem[] = [];
  if (loadTeacherPayments && payRes.error) {
    const msg = payRes.error.message?.toLowerCase() ?? "";
    if (!msg.includes("does not exist") && !msg.includes("schema cache")) {
      return {
        success: false,
        items: [],
        total: 0,
        hasMore: false,
        message: payRes.error.message ?? "فشل جلب دفعات رواتب المعلمين.",
      };
    }
  } else if (loadTeacherPayments) {
    salaryItems = ((payRes.data ?? []) as TeacherPaymentLedgerRow[]).map((p) => {
      const t = Array.isArray(p.teachers) ? p.teachers[0] : p.teachers;
      const name = t?.full_name?.trim() || "معلم";
      const paidAt = p.paid_at ?? "";
      return {
        ledgerKey: `tp-${p.id}`,
        source: "teacher_salary_payment" as const,
        id: p.id,
        title: `صرف راتب — ${name}`,
        amount: toNumber(p.amount),
        expenseDate: paidAt.slice(0, 10),
        createdAt: paidAt,
        type: "salary" as const,
        canEdit: true,
        teacherId: p.teacher_id,
        installmentId: p.installment_id ?? null,
      };
    });
  }

  const merged = [...manualItems, ...salaryItems].sort((a, b) => {
    const da = a.expenseDate.localeCompare(b.expenseDate);
    if (da !== 0) return -da;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const cap = Math.min(Math.max(filters?.limit ?? 250, 1), 500);
  const sliced = merged.slice(0, cap);

  return {
    success: true,
    items: sliced,
    total: merged.length,
    hasMore: merged.length > sliced.length,
    message: "تم جلب سجل المصاريف.",
  };
}

export async function getTotalExpensesAmount(): Promise<TotalExpensesResult> {
  const auth = await getAuthContext();
  if (!auth.ok) {
    return { success: false, total: 0, message: auth.message };
  }

  const supabase = await createClient();

  const { data: summaryRow, error: summaryError } = await supabase
    .from("v_financial_summary")
    .select("total_expenses")
    .eq("school_id", auth.schoolId)
    .maybeSingle();

  if (!summaryError && summaryRow && typeof summaryRow === "object") {
    const raw = (summaryRow as { total_expenses?: string | number | null }).total_expenses;
    return { success: true, total: toNumber(raw) };
  }

  const { data: amountRows, error: listError } = await supabase
    .from("expenses")
    .select("amount")
    .eq("school_id", auth.schoolId);

  if (listError) {
    return {
      success: false,
      total: 0,
      message: listError.message ?? "فشل حساب إجمالي المصاريف.",
    };
  }

  let sum = 0;
  for (const row of amountRows ?? []) {
    sum += toNumber((row as { amount?: string | number | null }).amount);
  }
  return { success: true, total: Number(sum.toFixed(2)) };
}

export async function createExpense(input: CreateExpenseInput): Promise<ActionResult> {
  const title = normalizeTitle(input.title);
  const amount = toStrictlyPositiveAmount(input.amount);
  const type = parseExpenseType(input.type?.trim() ?? "general") ?? "general";
  const expenseDate = parseDateOnly(input.expenseDate) ?? new Date().toISOString().slice(0, 10);

  if (!title) {
    return { success: false, message: "عنوان المصروف مطلوب." };
  }
  if (amount <= 0) {
    return { success: false, message: "المبلغ يجب أن يكون أكبر من صفر." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const summary = await getFinancialSummary();
  if (summary.success && exceedsAvailable(summary.netProfit, amount) && !input.confirmPersonalFunds) {
    return { success: false, message: INSUFFICIENT_FUNDS_MESSAGE, code: "INSUFFICIENT_FUNDS" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    school_id: auth.schoolId,
    title,
    amount,
    type,
    expense_date: expenseDate,
  });

  if (error) {
    return { success: false, message: error.message ?? "فشل تسجيل المصروف." };
  }

  revalidateExpensesViews();
  return { success: true, message: "تم تسجيل المصروف بنجاح." };
}

export async function updateExpense(input: UpdateExpenseInput): Promise<ActionResult> {
  const id = input.id?.trim();
  if (!id) {
    return { success: false, message: "معرّف المصروف مطلوب." };
  }

  const updates: Record<string, unknown> = {};

  if (input.title !== undefined) {
    const title = normalizeTitle(input.title);
    if (!title) return { success: false, message: "عنوان المصروف غير صالح." };
    updates.title = title;
  }

  if (input.amount !== undefined) {
    const amount = toStrictlyPositiveAmount(input.amount);
    if (amount <= 0) {
      return { success: false, message: "المبلغ يجب أن يكون أكبر من صفر." };
    }
    updates.amount = amount;
  }

  if (input.type !== undefined) {
    const type = parseExpenseType(input.type);
    if (!type) return { success: false, message: "نوع المصروف غير صالح." };
    updates.type = type;
  }

  if (input.expenseDate !== undefined) {
    const d = parseDateOnly(input.expenseDate);
    if (!d) return { success: false, message: "تاريخ المصروف غير صالح." };
    updates.expense_date = d;
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, message: "لا يوجد أي حقل لتعديله." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const supabase = await createClient();

  if (input.amount !== undefined) {
    const { data: existing, error: fetchError } = await supabase
      .from("expenses")
      .select("amount")
      .eq("id", id)
      .eq("school_id", auth.schoolId)
      .maybeSingle();

    if (fetchError || !existing) {
      return { success: false, message: fetchError?.message ?? "تعذر التحقق من المصروف الحالي." };
    }

    const oldAmount = toNumber((existing as { amount?: string | number | null }).amount);
    const newAmount = toStrictlyPositiveAmount(input.amount);
    const summary = await getFinancialSummary();
    if (
      summary.success &&
      exceedsAvailable(summary.netProfit + oldAmount, newAmount) &&
      !input.confirmPersonalFunds
    ) {
      return { success: false, message: INSUFFICIENT_FUNDS_MESSAGE, code: "INSUFFICIENT_FUNDS" };
    }
  }

  const { error } = await supabase
    .from("expenses")
    .update(updates)
    .eq("id", id)
    .eq("school_id", auth.schoolId);

  if (error) {
    return { success: false, message: error.message ?? "فشل تعديل المصروف." };
  }

  revalidateExpensesViews();
  return { success: true, message: "تم تعديل المصروف بنجاح." };
}

export async function deleteExpense(input: DeleteExpenseInput): Promise<ActionResult> {
  const id = input.id?.trim();
  if (!id) {
    return { success: false, message: "معرّف المصروف مطلوب." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id).eq("school_id", auth.schoolId);

  if (error) {
    return { success: false, message: error.message ?? "فشل حذف المصروف." };
  }

  revalidateExpensesViews();
  return { success: true, message: "تم حذف المصروف." };
}

export async function updateTeacherSalaryPayment(input: UpdateTeacherSalaryPaymentInput): Promise<ActionResult> {
  const paymentId = input.paymentId?.trim();
  const amount = toStrictlyPositiveAmount(input.amount);
  const paidAtDate = parseDateOnly(input.paidAt) ?? new Date().toISOString().slice(0, 10);

  if (!paymentId) {
    return { success: false, message: "معرّف دفعة الراتب مطلوب." };
  }
  if (amount <= 0) {
    return { success: false, message: "المبلغ يجب أن يكون أكبر من صفر." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("teacher_payments")
    .select("id")
    .eq("id", paymentId)
    .eq("school_id", auth.schoolId)
    .maybeSingle();

  if (existingError || !existing) {
    return { success: false, message: existingError?.message ?? "دفعة الراتب غير موجودة." };
  }

  const { error } = await supabase
    .from("teacher_payments")
    .update({
      amount,
      paid_at: `${paidAtDate}T12:00:00.000Z`,
    })
    .eq("id", paymentId)
    .eq("school_id", auth.schoolId);

  if (error) {
    return { success: false, message: error.message ?? "فشل تعديل دفعة الراتب." };
  }

  revalidateExpensesViews();
  return { success: true, message: "تم تعديل دفعة الراتب بنجاح." };
}

export async function deleteTeacherSalaryPayment(input: DeleteTeacherSalaryPaymentInput): Promise<ActionResult> {
  const paymentId = input.paymentId?.trim();
  if (!paymentId) {
    return { success: false, message: "معرّف دفعة الراتب مطلوب." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("teacher_payments")
    .delete()
    .eq("id", paymentId)
    .eq("school_id", auth.schoolId);

  if (error) {
    return { success: false, message: error.message ?? "فشل حذف دفعة الراتب." };
  }

  revalidateExpensesViews();
  return { success: true, message: "تم حذف دفعة الراتب بنجاح." };
}
