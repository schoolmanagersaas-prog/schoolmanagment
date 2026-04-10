"use server";

import { revalidatePath } from "next/cache";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";

type AuthContext =
  | { ok: true; userId: string; schoolId: string }
  | { ok: false; message: string };

type ActionResult =
  | { success: true; message: string }
  | { success: false; message: string };

/** قيم payment_status من v_teacher_installment_status */
export type TeacherInstallmentPaymentStatus = "paid_full" | "paid_partial" | "late" | "unpaid";

export type TeacherInstallmentLineItem = {
  installmentId: string;
  teacherId: string;
  teacherName: string;
  subject: string | null;
  totalAmount: number;
  totalPaid: number;
  remaining: number;
  dueDate: string;
  paymentStatus: TeacherInstallmentPaymentStatus;
};

export type ListTeacherInstallmentLinesFilters = {
  paymentStatus?: TeacherInstallmentPaymentStatus | "all";
};

export type ListTeacherInstallmentLinesResult =
  | { success: true; lines: TeacherInstallmentLineItem[]; message: string }
  | { success: false; lines: []; message: string };

export type RecordTeacherSalaryPaymentInput = {
  teacherId: string;
  installmentId: string;
  amount: number;
};

/** YYYY-MM-DD صالح أو null */
function parseDueDateString(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return v.slice(0, 10);
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toStrictlyPositiveAmount(value: number | undefined): number {
  if (value === undefined) return -1;
  if (!Number.isFinite(value) || value <= 0) return -1;
  return Number(value.toFixed(2));
}

function parsePaymentStatus(raw: string | null | undefined): TeacherInstallmentPaymentStatus | null {
  const v = (raw ?? "").trim();
  if (v === "paid_full" || v === "paid_partial" || v === "late" || v === "unpaid") return v;
  return null;
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

function revalidateTeacherFinanceViews() {
  revalidatePath("/staff/teacher-installments");
  revalidatePath("/staff/teacherslist");
  revalidatePath("/staff/addteachers");
  revalidatePath("/staff/expenses");
  revalidatePath("/staff/revenues");
  revalidatePath("/admin");
}

type TeacherInstallmentStatusViewRow = {
  installment_id: string;
  school_id: string;
  teacher_id: string;
  total_amount: number | string;
  due_date: string;
  total_paid: number | string;
  remaining: number | string;
  payment_status: string;
};

type TeacherMetaRow = {
  id: string;
  full_name: string;
  subject: string | null;
};

export async function listTeacherInstallmentLines(
  filters?: ListTeacherInstallmentLinesFilters,
): Promise<ListTeacherInstallmentLinesResult> {
  const auth = await getAuthContext();
  if (!auth.ok) {
    return { success: false, lines: [], message: auth.message };
  }

  const supabase = await createClient();
  let query = supabase
    .from("v_teacher_installment_status")
    .select(
      "installment_id,school_id,teacher_id,total_amount,due_date,total_paid,remaining,payment_status",
    )
    .eq("school_id", auth.schoolId)
    .neq("payment_status", "paid_full")
    .order("due_date", { ascending: false });

  const statusFilter = filters?.paymentStatus;
  if (statusFilter && statusFilter !== "all") {
    query = query.eq("payment_status", statusFilter);
  }

  const { data: viewRows, error: viewError } = await query;

  if (viewError) {
    return {
      success: false,
      lines: [],
      message:
        viewError.message ??
        "فشل جلب حالة أقساط الرواتب (تأكد من وجود الجداول teacher_installments/teacher_payments والمنظر v_teacher_installment_status).",
    };
  }

  const rows = (viewRows ?? []) as TeacherInstallmentStatusViewRow[];
  const teacherIds = [...new Set(rows.map((r) => r.teacher_id))];

  const teacherMap = new Map<string, { name: string; subject: string | null }>();
  if (teacherIds.length > 0) {
    const { data: teachersData, error: teachersError } = await supabase
      .from("teachers")
      .select("id,full_name,subject")
      .eq("school_id", auth.schoolId)
      .in("id", teacherIds);

    if (teachersError) {
      return {
        success: false,
        lines: [],
        message: teachersError.message ?? "فشل جلب بيانات المعلمين.",
      };
    }

    for (const t of (teachersData ?? []) as TeacherMetaRow[]) {
      teacherMap.set(t.id, {
        name: t.full_name,
        subject: t.subject ?? null,
      });
    }
  }

  const lines: TeacherInstallmentLineItem[] = rows.map((r) => {
    const meta = teacherMap.get(r.teacher_id);
    const st = parsePaymentStatus(r.payment_status) ?? "unpaid";
    return {
      installmentId: r.installment_id,
      teacherId: r.teacher_id,
      teacherName: meta?.name ?? "—",
      subject: meta?.subject ?? null,
      totalAmount: toNumber(r.total_amount),
      totalPaid: toNumber(r.total_paid),
      remaining: toNumber(r.remaining),
      dueDate: r.due_date?.slice(0, 10) ?? "",
      paymentStatus: st,
    };
  });

  return {
    success: true,
    lines,
    message: "تم جلب أقساط الرواتب.",
  };
}

export async function recordTeacherSalaryPayment(input: RecordTeacherSalaryPaymentInput): Promise<ActionResult> {
  const teacherId = input.teacherId?.trim();
  const installmentId = input.installmentId?.trim();
  const amount = toStrictlyPositiveAmount(input.amount);

  if (!teacherId || !installmentId) {
    return { success: false, message: "بيانات المعلم أو القسط ناقصة." };
  }
  if (amount <= 0) {
    return { success: false, message: "مبلغ الدفعة يجب أن يكون أكبر من صفر." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const supabase = await createClient();
  const { data: inst, error: instErr } = await supabase
    .from("teacher_installments")
    .select("id,teacher_id")
    .eq("id", installmentId)
    .eq("school_id", auth.schoolId)
    .maybeSingle();

  if (instErr || !inst) {
    return { success: false, message: instErr?.message ?? "القسط غير موجود." };
  }

  if ((inst as { teacher_id: string }).teacher_id !== teacherId) {
    return { success: false, message: "القسط لا يتبع هذا المعلم." };
  }

  const { error } = await supabase.from("teacher_payments").insert({
    school_id: auth.schoolId,
    teacher_id: teacherId,
    installment_id: installmentId,
    amount,
  });

  if (error) {
    return { success: false, message: error.message ?? "فشل تسجيل دفعة الراتب." };
  }

  revalidateTeacherFinanceViews();
  return { success: true, message: "تم تسجيل الدفعة وربطها بالقسط." };
}

export async function deleteTeacherInstallment(installmentId: string): Promise<ActionResult> {
  const id = installmentId?.trim();
  if (!id) {
    return { success: false, message: "معرّف القسط غير صالح." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const supabase = await createClient();
  const { data: existingPay, error: payErr } = await supabase
    .from("teacher_payments")
    .select("id")
    .eq("school_id", auth.schoolId)
    .eq("installment_id", id)
    .limit(1);

  if (payErr) {
    return { success: false, message: payErr.message ?? "فشل التحقق من الدفعات." };
  }
  if ((existingPay?.length ?? 0) > 0) {
    return { success: false, message: "لا يمكن حذف القسط؛ توجد دفعات مسجَّلة عليه." };
  }

  const { error } = await supabase.from("teacher_installments").delete().eq("id", id).eq("school_id", auth.schoolId);
  if (error) {
    return { success: false, message: error.message ?? "فشل حذف القسط." };
  }

  revalidateTeacherFinanceViews();
  return { success: true, message: "تم حذف القسط." };
}

export async function updateTeacherInstallment(input: {
  installmentId: string;
  totalAmount: number | undefined;
  dueDate: string | undefined;
}): Promise<ActionResult> {
  const installmentId = input.installmentId?.trim();
  const due = parseDueDateString(input.dueDate);
  const amount = toStrictlyPositiveAmount(input.totalAmount);

  if (!installmentId) {
    return { success: false, message: "معرّف القسط غير صالح." };
  }
  if (!due) {
    return { success: false, message: "تاريخ الاستحقاق غير صالح (استخدم YYYY-MM-DD)." };
  }
  if (amount <= 0) {
    return { success: false, message: "المبلغ يجب أن يكون أكبر من صفر." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const supabase = await createClient();
  const { data: inst, error: instErr } = await supabase
    .from("teacher_installments")
    .select("id")
    .eq("id", installmentId)
    .eq("school_id", auth.schoolId)
    .maybeSingle();

  if (instErr || !inst) {
    return { success: false, message: instErr?.message ?? "القسط غير موجود." };
  }

  const { data: payments, error: pErr } = await supabase
    .from("teacher_payments")
    .select("amount")
    .eq("school_id", auth.schoolId)
    .eq("installment_id", installmentId);

  if (pErr) {
    return { success: false, message: pErr.message ?? "فشل جلب الدفعات." };
  }
  const paid = (payments ?? []).reduce((s, p: { amount: number | string | null }) => s + toNumber(p.amount), 0);
  if (amount < paid) {
    return {
      success: false,
      message: `المبلغ لا يمكن أن يقل عن إجمالي المدفوع (${paid.toLocaleString("en-US")}).`,
    };
  }

  const { error: upErr } = await supabase
    .from("teacher_installments")
    .update({ total_amount: amount, due_date: due })
    .eq("id", installmentId)
    .eq("school_id", auth.schoolId);

  if (upErr) {
    return { success: false, message: upErr.message ?? "فشل تحديث القسط." };
  }

  revalidateTeacherFinanceViews();
  return { success: true, message: "تم تحديث القسط." };
}

export async function createTeacherInstallment(input: {
  teacherId: string;
  totalAmount: number | undefined;
  dueDate: string | undefined;
}): Promise<ActionResult> {
  const teacherId = input.teacherId?.trim();
  const due = parseDueDateString(input.dueDate);
  const amount = toStrictlyPositiveAmount(input.totalAmount);

  if (!teacherId) {
    return { success: false, message: "معرّف المعلم غير صالح." };
  }
  if (!due) {
    return { success: false, message: "تاريخ الاستحقاق غير صالح (استخدم YYYY-MM-DD)." };
  }
  if (amount <= 0) {
    return { success: false, message: "المبلغ يجب أن يكون أكبر من صفر." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const supabase = await createClient();
  const { data: t, error: tErr } = await supabase
    .from("teachers")
    .select("id")
    .eq("id", teacherId)
    .eq("school_id", auth.schoolId)
    .maybeSingle();

  if (tErr || !t) {
    return { success: false, message: tErr?.message ?? "المعلم غير موجود." };
  }

  const { error } = await supabase.from("teacher_installments").insert({
    school_id: auth.schoolId,
    teacher_id: teacherId,
    total_amount: amount,
    due_date: due,
  });

  if (error) {
    return { success: false, message: error.message ?? "فشل إضافة القسط." };
  }

  revalidateTeacherFinanceViews();
  return { success: true, message: "تمت إضافة القسط." };
}
