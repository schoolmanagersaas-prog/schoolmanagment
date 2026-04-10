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

/** قيم payment_status من v_installment_status */
export type InstallmentPaymentStatus = "paid_full" | "paid_partial" | "late" | "unpaid";

export type InstallmentLineItem = {
  installmentId: string;
  studentId: string;
  studentName: string;
  className: string | null;
  totalAmount: number;
  totalPaid: number;
  remaining: number;
  dueDate: string;
  paymentStatus: InstallmentPaymentStatus;
};

export type ListInstallmentLinesFilters = {
  paymentStatus?: InstallmentPaymentStatus | "all";
  classId?: string;
};

export type ListInstallmentLinesResult =
  | { success: true; lines: InstallmentLineItem[]; message: string }
  | { success: false; lines: []; message: string };

export type RecordTuitionPaymentInput = {
  studentId: string;
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

function parsePaymentStatus(raw: string | null | undefined): InstallmentPaymentStatus | null {
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

function revalidateStudentFinanceViews() {
  revalidatePath("/staff/student-installments");
  revalidatePath("/staff/studentlist");
  revalidatePath("/staff/expenses");
  revalidatePath("/staff/revenues");
  revalidatePath("/admin");
}

type InstallmentStatusViewRow = {
  installment_id: string;
  school_id: string;
  student_id: string;
  total_amount: number | string;
  due_date: string;
  total_paid: number | string;
  remaining: number | string;
  payment_status: string;
};

type StudentMetaRow = {
  id: string;
  full_name: string;
  class_id: string | null;
  classes: { name: string } | { name: string }[] | null;
};

export async function listInstallmentLines(
  filters?: ListInstallmentLinesFilters,
): Promise<ListInstallmentLinesResult> {
  const auth = await getAuthContext();
  if (!auth.ok) {
    return { success: false, lines: [], message: auth.message };
  }

  const supabase = await createClient();
  let query = supabase
    .from("v_installment_status")
    .select(
      "installment_id,school_id,student_id,total_amount,due_date,total_paid,remaining,payment_status",
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
      message: viewError.message ?? "فشل جلب حالة الأقساط (تأكد من وجود المنظر v_installment_status).",
    };
  }

  const rows = (viewRows ?? []) as InstallmentStatusViewRow[];
  const studentIds = [...new Set(rows.map((r) => r.student_id))];

  const studentMap = new Map<string, { name: string; className: string | null }>();
  if (studentIds.length > 0) {
    const { data: studentsData, error: studentsError } = await supabase
      .from("students")
      .select("id,full_name,class_id,classes!students_class_school_fk(name)")
      .eq("school_id", auth.schoolId)
      .in("id", studentIds);

    if (studentsError) {
      return {
        success: false,
        lines: [],
        message: studentsError.message ?? "فشل جلب بيانات الطلاب.",
      };
    }

    for (const s of (studentsData ?? []) as StudentMetaRow[]) {
      const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes;
      studentMap.set(s.id, {
        name: s.full_name,
        className: cls?.name ?? null,
      });
    }
  }

  const classFilter = filters?.classId?.trim();
  let lines: InstallmentLineItem[] = rows.map((r) => {
    const meta = studentMap.get(r.student_id);
    const st = parsePaymentStatus(r.payment_status) ?? "unpaid";
    return {
      installmentId: r.installment_id,
      studentId: r.student_id,
      studentName: meta?.name ?? "—",
      className: meta?.className ?? null,
      totalAmount: toNumber(r.total_amount),
      totalPaid: toNumber(r.total_paid),
      remaining: toNumber(r.remaining),
      dueDate: r.due_date?.slice(0, 10) ?? "",
      paymentStatus: st,
    };
  });

  if (classFilter) {
    const { data: inClass, error: classErr } = await supabase
      .from("students")
      .select("id")
      .eq("school_id", auth.schoolId)
      .eq("class_id", classFilter);

    if (classErr) {
      return { success: false, lines: [], message: classErr.message ?? "فشل تصفية الصف." };
    }
    const allowed = new Set((inClass ?? []).map((x: { id: string }) => x.id));
    lines = lines.filter((l) => allowed.has(l.studentId));
  }

  return {
    success: true,
    lines,
    message: "تم جلب الأقساط.",
  };
}

export async function recordTuitionPayment(input: RecordTuitionPaymentInput): Promise<ActionResult> {
  const studentId = input.studentId?.trim();
  const installmentId = input.installmentId?.trim();
  const amount = toStrictlyPositiveAmount(input.amount);

  if (!studentId || !installmentId) {
    return { success: false, message: "بيانات الطالب أو القسط ناقصة." };
  }
  if (amount <= 0) {
    return { success: false, message: "مبلغ الدفعة يجب أن يكون أكبر من صفر." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const supabase = await createClient();
  const { data: inst, error: instErr } = await supabase
    .from("installments")
    .select("id,student_id")
    .eq("id", installmentId)
    .eq("school_id", auth.schoolId)
    .maybeSingle();

  if (instErr || !inst) {
    return { success: false, message: instErr?.message ?? "القسط غير موجود." };
  }

  if ((inst as { student_id: string }).student_id !== studentId) {
    return { success: false, message: "القسط لا يتبع هذا الطالب." };
  }

  const { error } = await supabase.from("payments").insert({
    school_id: auth.schoolId,
    student_id: studentId,
    installment_id: installmentId,
    amount,
  });

  if (error) {
    return { success: false, message: error.message ?? "فشل تسجيل الدفعة." };
  }

  revalidateStudentFinanceViews();
  return { success: true, message: "تم تسجيل الدفعة وربطها بالقسط." };
}

export async function deleteStudentInstallment(installmentId: string): Promise<ActionResult> {
  const id = installmentId?.trim();
  if (!id) {
    return { success: false, message: "معرّف القسط غير صالح." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const supabase = await createClient();
  const { data: existingPay, error: payErr } = await supabase
    .from("payments")
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

  const { error } = await supabase.from("installments").delete().eq("id", id).eq("school_id", auth.schoolId);
  if (error) {
    return { success: false, message: error.message ?? "فشل حذف القسط." };
  }

  revalidateStudentFinanceViews();
  return { success: true, message: "تم حذف القسط." };
}

export async function updateStudentInstallment(input: {
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
    .from("installments")
    .select("id")
    .eq("id", installmentId)
    .eq("school_id", auth.schoolId)
    .maybeSingle();

  if (instErr || !inst) {
    return { success: false, message: instErr?.message ?? "القسط غير موجود." };
  }

  const { data: payments, error: pErr } = await supabase
    .from("payments")
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
    .from("installments")
    .update({ total_amount: amount, due_date: due })
    .eq("id", installmentId)
    .eq("school_id", auth.schoolId);

  if (upErr) {
    return { success: false, message: upErr.message ?? "فشل تحديث القسط." };
  }

  revalidateStudentFinanceViews();
  return { success: true, message: "تم تحديث القسط." };
}

export async function createStudentInstallment(input: {
  studentId: string;
  totalAmount: number | undefined;
  dueDate: string | undefined;
}): Promise<ActionResult> {
  const studentId = input.studentId?.trim();
  const due = parseDueDateString(input.dueDate);
  const amount = toStrictlyPositiveAmount(input.totalAmount);

  if (!studentId) {
    return { success: false, message: "معرّف الطالب غير صالح." };
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
  const { data: st, error: stErr } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("school_id", auth.schoolId)
    .maybeSingle();

  if (stErr || !st) {
    return { success: false, message: stErr?.message ?? "الطالب غير موجود." };
  }

  const { error } = await supabase.from("installments").insert({
    school_id: auth.schoolId,
    student_id: studentId,
    total_amount: amount,
    due_date: due,
  });

  if (error) {
    return { success: false, message: error.message ?? "فشل إضافة القسط." };
  }

  revalidateStudentFinanceViews();
  return { success: true, message: "تمت إضافة القسط." };
}
