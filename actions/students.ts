"use server";

import { revalidatePath } from "next/cache";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";

type GenderType = "male" | "female";
type StudentStatus = "active" | "withdrawn";
type AttendanceStatus = "present" | "absent";
type AlertLevel = "none" | "medium" | "high";

type ActionResult =
  | { success: true; message: string }
  | { success: false; message: string };

type AuthContext =
  | { ok: true; userId: string; schoolId: string }
  | { ok: false; message: string };

type StudentRow = {
  id: string;
  full_name: string;
  class_id: string | null;
  gender: GenderType;
  base_tuition: number | string;
  guardian_phone: string | null;
  address: string | null;
  status: StudentStatus;
  created_at: string;
  classes?: { name: string } | { name: string }[] | null;
};

type InstallmentRow = {
  id: string;
  student_id: string;
  total_amount: number | string;
  due_date: string;
};

type PaymentRow = {
  installment_id: string | null;
  amount: number | string;
};

type AttendanceRow = {
  student_id: string;
  status: AttendanceStatus;
};

export type CreateStudentInput = {
  fullName: string;
  classId?: string | null;
  gender: GenderType;
  baseTuition?: number;
  /** عندما يكون القسط الأساسي أكبر من صفر يُنشأ تلقائياً صف في installments بهذا تاريخ الاستحقاق. */
  installmentDueDate?: string;
  guardianPhone?: string | null;
  address?: string | null;
  status?: StudentStatus;
};

export type UpdateStudentInput = {
  id: string;
  fullName?: string;
  classId?: string | null;
  gender?: GenderType;
  baseTuition?: number;
  guardianPhone?: string | null;
  address?: string | null;
  status?: StudentStatus;
};

export type DeleteStudentInput = {
  id: string;
};

export type StudentFilters = {
  query?: string;
  classId?: string;
  gender?: GenderType;
  status?: StudentStatus;
  hasLatePayments?: boolean;
  alertLevel?: AlertLevel;
  attendanceFrom?: string;
  attendanceTo?: string;
  limit?: number;
  /** إزاحة السجلات لدعم التصفح (مع limit). */
  offset?: number;
};

export type UpsertAttendanceInput = {
  studentId: string;
  attendanceDate: string;
  status: AttendanceStatus;
};

export type BackfillAbsentUnmarkedInput = {
  attendanceDate: string;
  studentIds: string[];
  /**
   * عند الاستدعاء أثناء render في صفحة Server Component يجب تعطيل revalidatePath
   * لتجنب خطأ Next.js runtime.
   */
  revalidateViews?: boolean;
};

export type BackfillAbsentUnmarkedResult =
  | { success: true; message: string; filled: number }
  | { success: false; message: string; filled: number };

export type StudentAttendanceFilter = {
  studentId: string;
  from?: string;
  to?: string;
  status?: AttendanceStatus;
};

export type StudentListItem = {
  id: string;
  fullName: string;
  classId: string | null;
  className: string | null;
  gender: GenderType;
  baseTuition: number;
  guardianPhone: string | null;
  address: string | null;
  status: StudentStatus;
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

export type ListStudentsResult =
  | {
      success: true;
      students: StudentListItem[];
      total: number;
      message: string;
    }
  | {
      success: false;
      students: [];
      total: 0;
      message: string;
    };

export type StudentAttendanceResult =
  | {
      success: true;
      message: string;
      rows: Array<{
        id: string;
        studentId: string;
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

/** تاريخ تقويمي سابق عن «اليوم» بتوقيت UTC (نفس تنسيق الحقول date في الواجهة). */
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

function revalidateStudentsViews() {
  revalidatePath("/staff/students");
  revalidatePath("/staff/studentlist");
  revalidatePath("/staff/student-installments");
  revalidatePath("/staff");
  revalidatePath("/admin");
}

/** YYYY-MM-DD صالح أو null */
function installmentDueDateStringOrNull(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return v.slice(0, 10);
}

export async function createStudent(input: CreateStudentInput): Promise<ActionResult> {
  const fullName = input.fullName?.trim();
  const baseTuition = toPositiveAmount(input.baseTuition);
  const classId = normalizeNullableText(input.classId);
  const guardianPhone = normalizeNullableText(input.guardianPhone);
  const address = normalizeNullableText(input.address);
  const status: StudentStatus = input.status ?? "active";

  if (!fullName) {
    return { success: false, message: "اسم الطالب مطلوب." };
  }

  if (baseTuition < 0) {
    return { success: false, message: "قيمة القسط الأساسي غير صحيحة." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  if (baseTuition > 0) {
    const due = installmentDueDateStringOrNull(input.installmentDueDate);
    if (!due) {
      return {
        success: false,
        message: "عند إدخال قسط أساسي أكبر من صفر يجب تحديد تاريخ استحقاق القسط الأول.",
      };
    }
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("students")
    .insert({
      school_id: auth.schoolId,
      full_name: fullName,
      class_id: classId,
      gender: input.gender,
      base_tuition: baseTuition,
      guardian_phone: guardianPhone,
      address,
      status,
    })
    .select("id")
    .single();

  if (error || !inserted?.id) {
    return { success: false, message: error?.message ?? "فشل إضافة الطالب." };
  }

  const newStudentId = inserted.id as string;

  if (baseTuition > 0) {
    const due = installmentDueDateStringOrNull(input.installmentDueDate)!;
    const { error: instError } = await supabase.from("installments").insert({
      school_id: auth.schoolId,
      student_id: newStudentId,
      total_amount: baseTuition,
      due_date: due,
    });

    if (instError) {
      await supabase.from("students").delete().eq("id", newStudentId).eq("school_id", auth.schoolId);
      return {
        success: false,
        message: instError.message ?? "فشل إنشاء القسط المرتبط بالطالب.",
      };
    }
  }

  revalidateStudentsViews();
  return {
    success: true,
    message:
      baseTuition > 0
        ? "تمت إضافة الطالب وإنشاء قسطه الأول بنفس مبلغ القسط الأساسي."
        : "تمت إضافة الطالب بنجاح.",
  };
}

export async function updateStudent(input: UpdateStudentInput): Promise<ActionResult> {
  const studentId = input.id?.trim();
  if (!studentId) {
    return { success: false, message: "معرّف الطالب مطلوب." };
  }

  const updates: Record<string, unknown> = {};

  if (input.fullName !== undefined) {
    const fullName = input.fullName.trim();
    if (!fullName) return { success: false, message: "اسم الطالب غير صالح." };
    updates.full_name = fullName;
  }

  if (input.classId !== undefined) {
    updates.class_id = normalizeNullableText(input.classId);
  }

  if (input.gender !== undefined) updates.gender = input.gender;

  if (input.baseTuition !== undefined) {
    const baseTuition = toPositiveAmount(input.baseTuition);
    if (baseTuition < 0) {
      return { success: false, message: "قيمة القسط الأساسي غير صحيحة." };
    }
    updates.base_tuition = baseTuition;
  }

  if (input.guardianPhone !== undefined) {
    updates.guardian_phone = normalizeNullableText(input.guardianPhone);
  }

  if (input.address !== undefined) {
    updates.address = normalizeNullableText(input.address);
  }

  if (input.status !== undefined) {
    updates.status = input.status;
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, message: "لا يوجد أي حقل لتعديله." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update(updates)
    .eq("id", studentId)
    .eq("school_id", auth.schoolId);

  if (error) {
    return { success: false, message: error.message ?? "فشل تعديل بيانات الطالب." };
  }

  revalidateStudentsViews();
  return { success: true, message: "تم تعديل بيانات الطالب بنجاح." };
}

export async function deleteStudent(input: DeleteStudentInput): Promise<ActionResult> {
  const studentId = input.id?.trim();
  if (!studentId) {
    return { success: false, message: "معرّف الطالب مطلوب." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .delete()
    .eq("id", studentId)
    .eq("school_id", auth.schoolId);

  if (error) {
    return { success: false, message: error.message ?? "فشل حذف الطالب." };
  }

  revalidateStudentsViews();
  return { success: true, message: "تم حذف الطالب بنجاح." };
}

export async function listStudents(filters: StudentFilters = {}): Promise<ListStudentsResult> {
  const auth = await getAuthContext();
  if (!auth.ok) {
    return { success: false, students: [], total: 0, message: auth.message };
  }

  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 1000);
  const offset = Math.max(0, Math.floor(filters.offset ?? 0));
  const supabase = await createClient();

  const selectColumns =
    "id,full_name,class_id,gender,base_tuition,guardian_phone,address,status,created_at,classes!students_class_school_fk(name)";

  let countQuery = supabase
    .from("students")
    .select("*", { count: "exact", head: true })
    .eq("school_id", auth.schoolId);

  let dataQuery = supabase
    .from("students")
    .select(selectColumns)
    .eq("school_id", auth.schoolId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.classId) {
    countQuery = countQuery.eq("class_id", filters.classId);
    dataQuery = dataQuery.eq("class_id", filters.classId);
  }
  if (filters.gender) {
    countQuery = countQuery.eq("gender", filters.gender);
    dataQuery = dataQuery.eq("gender", filters.gender);
  }
  if (filters.status) {
    countQuery = countQuery.eq("status", filters.status);
    dataQuery = dataQuery.eq("status", filters.status);
  }

  if (filters.query?.trim()) {
    const q = filters.query.trim();
    const orFilter = `full_name.ilike.%${q}%,guardian_phone.ilike.%${q}%`;
    countQuery = countQuery.or(orFilter);
    dataQuery = dataQuery.or(orFilter);
  }

  const [{ count: totalCount, error: countError }, { data: studentRows, error: studentsError }] =
    await Promise.all([countQuery, dataQuery]);

  if (studentsError) {
    return {
      success: false,
      students: [],
      total: 0,
      message: studentsError.message ?? "فشل تحميل بيانات الطلاب.",
    };
  }

  const students = (studentRows ?? []) as StudentRow[];
  const matchedTotal = countError ? students.length : (totalCount ?? 0);

  if (students.length === 0) {
    return {
      success: true,
      students: [],
      total: matchedTotal,
      message:
        matchedTotal === 0
          ? "لا يوجد طلاب مطابقون للبحث."
          : "تم تحميل الطلاب بنجاح.",
    };
  }

  const studentIds = students.map((s) => s.id);
  const attendanceFrom = filters.attendanceFrom ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const attendanceTo = filters.attendanceTo ?? new Date().toISOString().slice(0, 10);

  const [
    { data: installmentRows, error: installmentsError },
    { data: paymentRows, error: paymentsError },
    { data: attendanceRows, error: attendanceError },
  ] = await Promise.all([
    supabase
      .from("installments")
      .select("id,student_id,total_amount,due_date")
      .eq("school_id", auth.schoolId)
      .in("student_id", studentIds),
    supabase
      .from("payments")
      .select("installment_id,amount")
      .eq("school_id", auth.schoolId)
      .in("student_id", studentIds),
    supabase
      .from("student_attendance")
      .select("student_id,status")
      .eq("school_id", auth.schoolId)
      .in("student_id", studentIds)
      .gte("attendance_date", attendanceFrom)
      .lte("attendance_date", attendanceTo),
  ]);

  const installmentsPermissionDenied = isPermissionDeniedError(installmentsError);
  const paymentsPermissionDenied = isPermissionDeniedError(paymentsError);
  const attendancePermissionDenied = isPermissionDeniedError(attendanceError);
  const financeUnavailable = installmentsPermissionDenied || paymentsPermissionDenied;

  if (installmentsError && !installmentsPermissionDenied) {
    return {
      success: false,
      students: [],
      total: 0,
      message: installmentsError.message ?? "فشل تحميل بيانات الأقساط.",
    };
  }

  if (paymentsError && !paymentsPermissionDenied) {
    return {
      success: false,
      students: [],
      total: 0,
      message: paymentsError.message ?? "فشل تحميل بيانات الدفعات.",
    };
  }

  if (attendanceError && !attendancePermissionDenied) {
    return {
      success: false,
      students: [],
      total: 0,
      message: attendanceError.message ?? "فشل تحميل بيانات الحضور.",
    };
  }

  const installmentMap = new Map<
    string,
    { remainingTotal: number; overdueInstallments: number; maxLateDays: number }
  >();
  const attendanceMap = new Map<string, { present: number; absent: number }>();
  const paidByInstallment = new Map<string, number>();

  for (const payment of financeUnavailable ? [] : ((paymentRows ?? []) as PaymentRow[])) {
    if (!payment.installment_id) continue;
    const paid = toNumber(payment.amount);
    const prev = paidByInstallment.get(payment.installment_id) ?? 0;
    paidByInstallment.set(payment.installment_id, prev + paid);
  }

  for (const row of financeUnavailable ? [] : ((installmentRows ?? []) as InstallmentRow[])) {
    const prev = installmentMap.get(row.student_id) ?? {
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

    installmentMap.set(row.student_id, prev);
  }

  for (const row of (attendanceRows ?? []) as AttendanceRow[]) {
    const prev = attendanceMap.get(row.student_id) ?? { present: 0, absent: 0 };
    if (row.status === "present") prev.present += 1;
    if (row.status === "absent") prev.absent += 1;
    attendanceMap.set(row.student_id, prev);
  }

  let mapped: StudentListItem[] = students.map((row) => {
    const classInfo = Array.isArray(row.classes) ? row.classes[0] : row.classes;
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
      classId: row.class_id,
      className: classInfo?.name ?? null,
      gender: row.gender,
      baseTuition: toNumber(row.base_tuition),
      guardianPhone: row.guardian_phone,
      address: row.address,
      status: row.status,
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

  if (!financeUnavailable && filters.hasLatePayments === true) {
    mapped = mapped.filter((row) => row.finance.overdueInstallments > 0);
  }

  if (!financeUnavailable && filters.hasLatePayments === false) {
    mapped = mapped.filter((row) => row.finance.overdueInstallments === 0);
  }

  if (!financeUnavailable && filters.alertLevel) {
    mapped = mapped.filter((row) => row.finance.alertLevel === filters.alertLevel);
  }

  return {
    success: true,
    students: mapped,
    total: matchedTotal,
    message: financeUnavailable
      ? "تم تحميل الطلاب بنجاح، لكن البيانات المالية غير متاحة بسبب الصلاحيات."
      : "تم تحميل الطلاب بنجاح.",
  };
}

export async function upsertStudentAttendance(
  input: UpsertAttendanceInput,
): Promise<ActionResult> {
  const studentId = input.studentId?.trim();
  const attendanceDate = input.attendanceDate?.trim();

  if (!studentId) {
    return { success: false, message: "معرّف الطالب مطلوب." };
  }

  if (!parseDateOnly(attendanceDate)) {
    return { success: false, message: "تاريخ الحضور غير صالح." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message };

  const supabase = await createClient();
  const { error } = await supabase.from("student_attendance").upsert(
    {
      school_id: auth.schoolId,
      student_id: studentId,
      attendance_date: attendanceDate,
      status: input.status,
    },
    {
      onConflict: "school_id,student_id,attendance_date",
    },
  );

  if (error) {
    return { success: false, message: error.message ?? "فشل حفظ الحضور/الغياب." };
  }

  revalidateStudentsViews();
  return { success: true, message: "تم حفظ الحضور/الغياب بنجاح." };
}

/**
 * لأيام مضت: يسجّل «غائب» تلقائيًا لكل طالب من القائمة لا يملك صفًا في student_attendance لذلك التاريخ.
 * لا يغيّر الصفوف الموجودة (حاضر/غائب). لا يُنفَّذ لتاريخ اليوم أو المستقبل.
 */
export async function backfillAbsentForPastUnmarked(
  input: BackfillAbsentUnmarkedInput,
): Promise<BackfillAbsentUnmarkedResult> {
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

  const studentIds = [
    ...new Set(
      (input.studentIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ];

  if (studentIds.length === 0) {
    return { success: true, message: "لا يوجد طلاب للمعالجة.", filled: 0 };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, message: auth.message, filled: 0 };

  const supabase = await createClient();
  const { data: existingRows, error: existingError } = await supabase
    .from("student_attendance")
    .select("student_id")
    .eq("school_id", auth.schoolId)
    .eq("attendance_date", attendanceDate)
    .in("student_id", studentIds);

  if (existingError) {
    return {
      success: false,
      message: existingError.message ?? "فشل التحقق من سجلات الحضور.",
      filled: 0,
    };
  }

  const alreadyMarked = new Set(
    (existingRows ?? []).map((row) => row.student_id as string),
  );
  const missingIds = studentIds.filter((id) => !alreadyMarked.has(id));

  if (missingIds.length === 0) {
    return { success: true, message: "جميع الطلاب لهم سجل لهذا التاريخ.", filled: 0 };
  }

  const chunkSize = 150;
  let filled = 0;
  for (let i = 0; i < missingIds.length; i += chunkSize) {
    const chunk = missingIds.slice(i, i + chunkSize);
    const rows = chunk.map((student_id) => ({
      school_id: auth.schoolId,
      student_id,
      attendance_date: attendanceDate,
      status: "absent" as const,
    }));

    const { error: insertError } = await supabase.from("student_attendance").insert(rows);
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
    revalidateStudentsViews();
  }

  return {
    success: true,
    message:
      filled > 0
        ? `تم تسجيل غياب تلقائي لـ ${filled} طالبًا في ${attendanceDate}.`
        : "لم يُضف أي سجل.",
    filled,
  };
}

export async function getStudentAttendance(
  filter: StudentAttendanceFilter,
): Promise<StudentAttendanceResult> {
  const studentId = filter.studentId?.trim();
  if (!studentId) {
    return { success: false, rows: [], message: "معرّف الطالب مطلوب." };
  }

  const auth = await getAuthContext();
  if (!auth.ok) return { success: false, rows: [], message: auth.message };

  const from = filter.from ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = filter.to ?? new Date().toISOString().slice(0, 10);
  if (!parseDateOnly(from) || !parseDateOnly(to)) {
    return { success: false, rows: [], message: "نطاق التاريخ غير صالح." };
  }

  let query = (await createClient())
    .from("student_attendance")
    .select("id,student_id,attendance_date,status,created_at")
    .eq("school_id", auth.schoolId)
    .eq("student_id", studentId)
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
      studentId: row.student_id as string,
      attendanceDate: row.attendance_date as string,
      status: row.status as AttendanceStatus,
      createdAt: row.created_at as string,
    })),
  };
}
