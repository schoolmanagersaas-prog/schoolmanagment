"use server";

import { revalidatePath } from "next/cache";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";

type AttendanceStatus = "present" | "absent";
type AlertLevel = "none" | "medium" | "high";

type ActionResult =
  | { success: true; message: string }
  | { success: false; message: string };

type AuthContext =
  | { ok: true; userId: string; schoolId: string }
  | { ok: false; message: string };

/** صف من جدول teachers حسب schame.md: full_name, phone, salary, subject */
type TeacherRow = {
  id: string;
  full_name: string;
  phone: string | null;
  salary: number | string;
  subject: string | null;
  created_at: string;
};

type TeacherInstallmentRow = {
  id: string;
  teacher_id: string;
  total_amount: number | string;
  due_date: string;
};

type TeacherPaymentRow = {
  installment_id: string | null;
  amount: number | string;
};

type TeacherAttendanceRow = {
  teacher_id: string;
  status: AttendanceStatus;
};

export type CreateTeacherInput = {
  fullName: string;
  phone?: string | null;
  salary?: number;
  subject?: string | null;
  /** عندما يكون الراتب أكبر من صفر يُنشأ تلقائياً قسط راتب بنفس المبلغ مع هذا تاريخ الاستحقاق. */
  salaryInstallmentDueDate?: string;
};

export type UpdateTeacherInput = {
  id: string;
  fullName?: string;
  phone?: string | null;
  salary?: number;
  subject?: string | null;
};

export type DeleteTeacherInput = {
  id: string;
};

export type TeacherFilters = {
  query?: string;
  hasLatePayments?: boolean;
  alertLevel?: AlertLevel;
  attendanceFrom?: string;
  attendanceTo?: string;
  limit?: number;
};

export type UpsertTeacherAttendanceInput = {
  teacherId: string;
  attendanceDate: string;
  status: AttendanceStatus;
};

export type BackfillTeacherAbsentUnmarkedInput = {
  attendanceDate: string;
  teacherIds: string[];
  /**
   * عند الاستدعاء أثناء render في صفحة Server Component يجب تعطيل revalidatePath
   * لتجنب خطأ Next.js runtime.
   */
  revalidateViews?: boolean;
};

export type BackfillTeacherAbsentUnmarkedResult =
  | { success: true; message: string; filled: number }
  | { success: false; message: string; filled: number };

export type TeacherAttendanceFilter = {
  teacherId: string;
  from?: string;
  to?: string;
  status?: AttendanceStatus;
};

export type TeacherListItem = {
  id: string;
  fullName: string;
  phone: string | null;
  salary: number;
  subject: string | null;
  createdAt: string;
  attendance: {
    presentCount: number;
    absentCount: number;
  };
  finance: {
    remainingTotal: number;
    overdueInstallments: number;
    maxLateDays: number;
    alertLevel: AlertLevel;
    alertMessage: string | null;
  };
};

export type ListTeachersResult =
  | {
      success: true;
      teachers: TeacherListItem[];
      total: number;
      message: string;
    }
  | {
      success: false;
      teachers: [];
      total: 0;
      message: string;
    };

export type TeacherAttendanceResult =
  | {
      success: true;
      message: string;
      rows: Array<{
        id: string;
        teacherId: string;
        attendanceDate: string;
        status: AttendanceStatus;
        createdAt: string;
      }>;
    }
  | {
      success: false;
      message: string;
      rows: [];
    };

function normalizeNullableText(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toPositiveAmount(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isFinite(value) || value < 0) return -1;
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

function parseDateOnly(dateText: string): Date | null {
  const value = dateText?.trim();
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function utcTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function isStrictlyBeforeTodayDate(dateText: string): boolean {
  if (!parseDateOnly(dateText)) return false;
  const day = dateText.trim().slice(0, 10);
  return day < utcTodayDateString();
}

function computeLateDays(dueDate: string): number {
  const due = parseDateOnly(dueDate);
  if (!due) return 0;
  const now = new Date();
  const diff = now.getTime() - due.getTime();
  if (diff <= 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function computeAlert(
  remainingTotal: number,
  overdueInstallments: number,
  maxLateDays: number,
): { level: AlertLevel; message: string | null } {
  if (remainingTotal <= 0 && overdueInstallments === 0) {
    return { level: "none", message: null };
  }

  if (overdueInstallments >= 2 || maxLateDays >= 30) {
    return {
      level: "high",
      message: "تنبيه مرتفع: يوجد تأخير كبير في الأقساط ويحتاج متابعة عاجلة.",
    };
  }

  return {
    level: "medium",
    message: "تنبيه متوسط: يوجد تأخير في القسط ويحتاج متابعة.",
  };
}

function isPermissionDeniedError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code?.trim();
  const message = error.message?.toLowerCase() ?? "";
  return code === "42501" || message.includes("permission denied");
}

async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      message: "يجب تسجيل الدخول أولًا.",
    };
  }

  const schoolId = await resolveSchoolId(supabase, user.id, user.email);
  if (!schoolId) {
    return {
      ok: false,
      message: "لم يتم العثور على مدرسة مرتبطة بحسابك.",
    };
  }

  return {
    ok: true,
    userId: user.id,
    schoolId,
  };
}

function revalidateTeachersViews() {
  revalidatePath("/staff/addteachers");
  revalidatePath("/staff/teacherslist");
  revalidatePath("/staff/teacher-installments");
  revalidatePath("/staff");
  revalidatePath("/admin");
}

/** YYYY-MM-DD صالح أو null */
function salaryInstallmentDueDateStringOrNull(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return v.slice(0, 10);
}

export async function createTeacher(input: CreateTeacherInput): Promise<ActionResult> {
  const fullName = input.fullName?.trim();
  const salary = toPositiveAmount(input.salary);
  const phone = normalizeNullableText(input.phone);
  const subject = normalizeNullableText(input.subject);

  if (!fullName) {
    return { success: false, message: "اسم المعلم مطلوب." };
  }

  if (salary < 0) {
    return { success: false, message: "قيمة الراتب غير صحيحة." };
  }

  if (salary > 0) {
    const due = salaryInstallmentDueDateStringOrNull(input.salaryInstallmentDueDate);
    if (!due) {
      return {
        success: false,
        message: "عند إدخال راتب أكبر من صفر يجب تحديد تاريخ استحقاق قسط الراتب الأول.",
      };
    }
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("teachers")
    .insert({
      school_id: auth.schoolId,
      full_name: fullName,
      phone,
      salary,
      subject,
    })
    .select("id")
    .single();

  if (error || !inserted?.id) {
    return { success: false, message: error?.message ?? "فشل إضافة المعلم." };
  }

  const newTeacherId = inserted.id as string;

  if (salary > 0) {
    const due = salaryInstallmentDueDateStringOrNull(input.salaryInstallmentDueDate)!;
    const { error: instError } = await supabase.from("teacher_installments").insert({
      school_id: auth.schoolId,
      teacher_id: newTeacherId,
      total_amount: salary,
      due_date: due,
    });

    if (instError) {
      await supabase.from("teachers").delete().eq("id", newTeacherId).eq("school_id", auth.schoolId);
      return {
        success: false,
        message: instError.message ?? "فشل إنشاء قسط الراتب المرتبط بالمعلم (تأكد من إنشاء الجداول في قاعدة البيانات).",
      };
    }
  }

  revalidateTeachersViews();
  return {
    success: true,
    message:
      salary > 0
        ? "تمت إضافة المعلم وإنشاء قسط الراتب الأول بنفس مبلغ الراتب."
        : "تمت إضافة المعلم بنجاح.",
  };
}

export async function updateTeacher(input: UpdateTeacherInput): Promise<ActionResult> {
  const teacherId = input.id?.trim();
  if (!teacherId) {
    return { success: false, message: "معرّف المعلم مطلوب." };
  }

  const updates: Record<string, unknown> = {};

  if (input.fullName !== undefined) {
    const fullName = input.fullName.trim();
    if (!fullName) return { success: false, message: "اسم المعلم غير صالح." };
    updates.full_name = fullName;
  }

  if (input.salary !== undefined) {
    const salary = toPositiveAmount(input.salary);
    if (salary < 0) {
      return { success: false, message: "قيمة الراتب غير صحيحة." };
    }
    updates.salary = salary;
  }

  if (input.phone !== undefined) {
    updates.phone = normalizeNullableText(input.phone);
  }

  if (input.subject !== undefined) {
    updates.subject = normalizeNullableText(input.subject);
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, message: "لا يوجد أي حقل لتعديله." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("teachers")
    .update(updates)
    .eq("id", teacherId)
    .eq("school_id", auth.schoolId);

  if (error) {
    return { success: false, message: error.message ?? "فشل تعديل بيانات المعلم." };
  }

  revalidateTeachersViews();
  return { success: true, message: "تم تعديل بيانات المعلم بنجاح." };
}

export async function deleteTeacher(input: DeleteTeacherInput): Promise<ActionResult> {
  const teacherId = input.id?.trim();
  if (!teacherId) {
    return { success: false, message: "معرّف المعلم مطلوب." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("teachers")
    .delete()
    .eq("id", teacherId)
    .eq("school_id", auth.schoolId);

  if (error) {
    return { success: false, message: error.message ?? "فشل حذف المعلم." };
  }

  revalidateTeachersViews();
  return { success: true, message: "تم حذف المعلم بنجاح." };
}

export async function listTeachers(filters: TeacherFilters = {}): Promise<ListTeachersResult> {
  const auth = await getAuthContext();
  if (!auth.ok) {
    return { success: false, teachers: [], total: 0, message: auth.message };
  }

  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 1000);
  const supabase = await createClient();

  let query = supabase
    .from("teachers")
    .select("id,full_name,phone,salary,subject,created_at")
    .eq("school_id", auth.schoolId)
    .limit(limit)
    .order("created_at", { ascending: false });

  if (filters.query?.trim()) {
    const q = filters.query.trim();
    query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,subject.ilike.%${q}%`);
  }

  const { data: teacherRows, error: teachersError } = await query;
  if (teachersError) {
    return {
      success: false,
      teachers: [],
      total: 0,
      message: teachersError.message ?? "فشل تحميل بيانات المعلمين.",
    };
  }

  const teachers = (teacherRows ?? []) as TeacherRow[];
  if (teachers.length === 0) {
    return {
      success: true,
      teachers: [],
      total: 0,
      message: "لا يوجد معلمون مطابقون للبحث.",
    };
  }

  const teacherIds = teachers.map((t) => t.id);
  const attendanceFrom = filters.attendanceFrom ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const attendanceTo = filters.attendanceTo ?? new Date().toISOString().slice(0, 10);

  const [
    { data: installmentRows, error: installmentsError },
    { data: paymentRows, error: paymentsError },
    { data: attendanceRows, error: attendanceError },
  ] = await Promise.all([
    supabase
      .from("teacher_installments")
      .select("id,teacher_id,total_amount,due_date")
      .eq("school_id", auth.schoolId)
      .in("teacher_id", teacherIds),
    supabase
      .from("teacher_payments")
      .select("installment_id,amount")
      .eq("school_id", auth.schoolId)
      .in("teacher_id", teacherIds),
    supabase
      .from("teacher_attendance")
      .select("teacher_id,status")
      .eq("school_id", auth.schoolId)
      .in("teacher_id", teacherIds)
      .gte("attendance_date", attendanceFrom)
      .lte("attendance_date", attendanceTo),
  ]);

  const installmentsPermissionDenied = isPermissionDeniedError(installmentsError);
  const paymentsPermissionDenied = isPermissionDeniedError(paymentsError);
  const attendancePermissionDenied = isPermissionDeniedError(attendanceError);
  const financeUnavailable = installmentsPermissionDenied || paymentsPermissionDenied;

  const tableMissing = (err: { message?: string; code?: string } | null | undefined) => {
    const msg = err?.message?.toLowerCase() ?? "";
    const code = err?.code?.trim();
    return code === "42P01" || msg.includes("does not exist") || msg.includes("schema cache");
  };

  if (installmentsError && !installmentsPermissionDenied) {
    if (!tableMissing(installmentsError)) {
      return {
        success: false,
        teachers: [],
        total: 0,
        message: installmentsError.message ?? "فشل تحميل بيانات الأقساط.",
      };
    }
  }

  if (paymentsError && !paymentsPermissionDenied) {
    if (!tableMissing(paymentsError)) {
      return {
        success: false,
        teachers: [],
        total: 0,
        message: paymentsError.message ?? "فشل تحميل بيانات الدفعات.",
      };
    }
  }

  if (attendanceError && !attendancePermissionDenied) {
    return {
      success: false,
      teachers: [],
      total: 0,
      message: attendanceError.message ?? "فشل تحميل بيانات الحضور.",
    };
  }

  const financeReallyUnavailable =
    financeUnavailable ||
    tableMissing(installmentsError) ||
    tableMissing(paymentsError);

  const installmentMap = new Map<
    string,
    { remainingTotal: number; overdueInstallments: number; maxLateDays: number }
  >();
  const attendanceMap = new Map<string, { present: number; absent: number }>();
  const paidByInstallment = new Map<string, number>();

  for (const payment of financeReallyUnavailable ? [] : ((paymentRows ?? []) as TeacherPaymentRow[])) {
    if (!payment.installment_id) continue;
    const paid = toNumber(payment.amount);
    const prev = paidByInstallment.get(payment.installment_id) ?? 0;
    paidByInstallment.set(payment.installment_id, prev + paid);
  }

  for (const row of financeReallyUnavailable ? [] : ((installmentRows ?? []) as TeacherInstallmentRow[])) {
    const prev = installmentMap.get(row.teacher_id) ?? {
      remainingTotal: 0,
      overdueInstallments: 0,
      maxLateDays: 0,
    };

    const totalAmount = toNumber(row.total_amount);
    const totalPaid = paidByInstallment.get(row.id) ?? 0;
    const remaining = Math.max(totalAmount - totalPaid, 0);
    const lateDays = computeLateDays(row.due_date);
    const isLate = totalPaid <= 0 && remaining > 0 && lateDays > 0;

    prev.remainingTotal += remaining > 0 ? remaining : 0;
    if (isLate) {
      prev.overdueInstallments += 1;
      prev.maxLateDays = Math.max(prev.maxLateDays, lateDays);
    }

    installmentMap.set(row.teacher_id, prev);
  }

  for (const row of (attendanceRows ?? []) as TeacherAttendanceRow[]) {
    const prev = attendanceMap.get(row.teacher_id) ?? { present: 0, absent: 0 };
    if (row.status === "present") prev.present += 1;
    if (row.status === "absent") prev.absent += 1;
    attendanceMap.set(row.teacher_id, prev);
  }

  let mapped: TeacherListItem[] = teachers.map((row) => {
    const finance = installmentMap.get(row.id) ?? {
      remainingTotal: 0,
      overdueInstallments: 0,
      maxLateDays: 0,
    };
    const attendance = attendanceMap.get(row.id) ?? { present: 0, absent: 0 };
    const alert = computeAlert(
      finance.remainingTotal,
      finance.overdueInstallments,
      finance.maxLateDays,
    );

    return {
      id: row.id,
      fullName: row.full_name,
      phone: row.phone,
      salary: toNumber(row.salary),
      subject: row.subject,
      createdAt: row.created_at,
      attendance: {
        presentCount: attendance.present,
        absentCount: attendance.absent,
      },
      finance: {
        remainingTotal: Number(finance.remainingTotal.toFixed(2)),
        overdueInstallments: finance.overdueInstallments,
        maxLateDays: finance.maxLateDays,
        alertLevel: alert.level,
        alertMessage: alert.message,
      },
    };
  });

  if (!financeReallyUnavailable && filters.hasLatePayments === true) {
    mapped = mapped.filter((row) => row.finance.overdueInstallments > 0);
  }

  if (!financeReallyUnavailable && filters.hasLatePayments === false) {
    mapped = mapped.filter((row) => row.finance.overdueInstallments === 0);
  }

  if (!financeReallyUnavailable && filters.alertLevel) {
    mapped = mapped.filter((row) => row.finance.alertLevel === filters.alertLevel);
  }

  return {
    success: true,
    teachers: mapped,
    total: mapped.length,
    message: financeReallyUnavailable
      ? "تم تحميل المعلمين بنجاح، لكن البيانات المالية غير متاحة بسبب الصلاحيات أو الجداول غير المُنشأة."
      : "تم تحميل المعلمين بنجاح.",
  };
}

export async function upsertTeacherAttendance(
  input: UpsertTeacherAttendanceInput,
): Promise<ActionResult> {
  const teacherId = input.teacherId?.trim();
  const attendanceDate = input.attendanceDate?.trim();

  if (!teacherId) {
    return { success: false, message: "معرّف المعلم مطلوب." };
  }

  if (!parseDateOnly(attendanceDate)) {
    return { success: false, message: "تاريخ الحضور غير صالح." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const supabase = await createClient();
  const { error } = await supabase.from("teacher_attendance").upsert(
    {
      school_id: auth.schoolId,
      teacher_id: teacherId,
      attendance_date: attendanceDate,
      status: input.status,
    },
    {
      onConflict: "school_id,teacher_id,attendance_date",
    },
  );

  if (error) {
    return { success: false, message: error.message ?? "فشل حفظ الحضور/الغياب." };
  }

  revalidateTeachersViews();
  return { success: true, message: "تم حفظ الحضور/الغياب بنجاح." };
}

export async function backfillAbsentForPastTeachersUnmarked(
  input: BackfillTeacherAbsentUnmarkedInput,
): Promise<BackfillTeacherAbsentUnmarkedResult> {
  const attendanceDate = input.attendanceDate?.trim();
  if (!parseDateOnly(attendanceDate)) {
    return { success: false, message: "تاريخ الحضور غير صالح.", filled: 0 };
  }

  if (!isStrictlyBeforeTodayDate(attendanceDate)) {
    return {
      success: true,
      message: "لا حاجة للتعبئة التلقائية إلا للأيام الماضية.",
      filled: 0,
    };
  }

  const teacherIds = [
    ...new Set(
      (input.teacherIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ];

  if (teacherIds.length === 0) {
    return { success: true, message: "لا يوجد معلمون للمعالجة.", filled: 0 };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message, filled: 0 };

  const supabase = await createClient();
  const { data: existingRows, error: existingError } = await supabase
    .from("teacher_attendance")
    .select("teacher_id")
    .eq("school_id", auth.schoolId)
    .eq("attendance_date", attendanceDate)
    .in("teacher_id", teacherIds);

  if (existingError) {
    return {
      success: false,
      message: existingError.message ?? "فشل التحقق من سجلات الحضور.",
      filled: 0,
    };
  }

  const alreadyMarked = new Set(
    (existingRows ?? []).map((row) => row.teacher_id as string),
  );
  const missingIds = teacherIds.filter((id) => !alreadyMarked.has(id));

  if (missingIds.length === 0) {
    return { success: true, message: "جميع المعلمين لهم سجل لهذا التاريخ.", filled: 0 };
  }

  const chunkSize = 150;
  let filled = 0;
  for (let i = 0; i < missingIds.length; i += chunkSize) {
    const chunk = missingIds.slice(i, i + chunkSize);
    const rows = chunk.map((teacher_id) => ({
      school_id: auth.schoolId,
      teacher_id,
      attendance_date: attendanceDate,
      status: "absent" as const,
    }));

    const { error: insertError } = await supabase.from("teacher_attendance").insert(rows);
    if (insertError) {
      return {
        success: false,
        message: insertError.message ?? "فشل تسجيل الغياب التلقائي.",
        filled,
      };
    }
    filled += chunk.length;
  }

  if (filled > 0 && input.revalidateViews !== false) {
    revalidateTeachersViews();
  }

  return {
    success: true,
    message:
      filled > 0
        ? `تم تسجيل غياب تلقائي لـ ${filled} معلمًا في ${attendanceDate}.`
        : "لم يُضف أي سجل.",
    filled,
  };
}

export async function getTeacherAttendance(
  filter: TeacherAttendanceFilter,
): Promise<TeacherAttendanceResult> {
  const teacherId = filter.teacherId?.trim();
  if (!teacherId) {
    return { success: false, rows: [], message: "معرّف المعلم مطلوب." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, rows: [], message: auth.message };

  const from = filter.from ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = filter.to ?? new Date().toISOString().slice(0, 10);
  if (!parseDateOnly(from) || !parseDateOnly(to)) {
    return { success: false, rows: [], message: "نطاق التاريخ غير صالح." };
  }

  let query = (await createClient())
    .from("teacher_attendance")
    .select("id,teacher_id,attendance_date,status,created_at")
    .eq("school_id", auth.schoolId)
    .eq("teacher_id", teacherId)
    .gte("attendance_date", from)
    .lte("attendance_date", to)
    .order("attendance_date", { ascending: false });

  if (filter.status) query = query.eq("status", filter.status);

  const { data, error } = await query;
  if (error) {
    return {
      success: false,
      rows: [],
      message: error.message ?? "فشل تحميل سجل الحضور/الغياب.",
    };
  }

  return {
    success: true,
    message: "تم تحميل سجل الحضور/الغياب بنجاح.",
    rows: (data ?? []).map((row) => ({
      id: row.id as string,
      teacherId: row.teacher_id as string,
      attendanceDate: row.attendance_date as string,
      status: row.status as AttendanceStatus,
      createdAt: row.created_at as string,
    })),
  };
}
