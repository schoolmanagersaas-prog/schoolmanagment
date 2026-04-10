import { backfillAbsentForPastUnmarked, listStudents } from "@/actions/students";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DailyAttendanceCheckbox } from "./daily-attendance-checkbox";

type StudentListPageProps = {
  searchParams?: Promise<{
    q?: string;
    classId?: string;
    date?: string;
    month?: string;
  }>;
};

function parseDateParam(value: string | undefined): string {
  const raw = value?.trim();
  if (!raw) return new Date().toISOString().slice(0, 10);
  const d = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return raw.slice(0, 10);
}

/** مطابقة منطق الإجراء: مقارنة YYYY-MM-DD مع اليوم بتوقيت UTC. */
function isPastAttendanceDateUtc(dateStr: string): boolean {
  const day = dateStr.trim().slice(0, 10);
  return day < new Date().toISOString().slice(0, 10);
}

function currentYearMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** YYYY-MM → { from, to } inclusive date strings for DB */
function monthToDateRange(ym: string): { from: string; to: string; label: string } | null {
  const raw = ym.trim();
  const m = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12 || !Number.isFinite(y)) return null;
  const from = `${y}-${String(mo).padStart(2, "0")}-01`;
  const lastDay = new Date(y, mo, 0).getDate();
  const to = `${y}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to, label: raw };
}

function parseYearMonthParam(value: string | undefined): { from: string; to: string; value: string } {
  const parsed = value?.trim() ? monthToDateRange(value) : null;
  if (parsed) return { from: parsed.from, to: parsed.to, value: parsed.label };
  const fallback = monthToDateRange(currentYearMonth())!;
  return { from: fallback.from, to: fallback.to, value: fallback.label };
}

type MonthlyAttendanceStats = {
  presentDays: number;
  recordedDays: number;
  daysInCalendarMonth: number;
  /** (أيام الحضور ÷ أيام الشهر التقويمي) × 100 */
  ratePercent: number;
};

function daysInCalendarMonth(ymValue: string): number {
  const parsed = monthToDateRange(ymValue);
  if (!parsed) return 30;
  const y = Number(parsed.from.slice(0, 4));
  const mo = Number(parsed.from.slice(5, 7));
  if (!Number.isFinite(y) || mo < 1 || mo > 12) return 30;
  return new Date(y, mo, 0).getDate();
}

function buildMonthlyStatsByStudent(
  rows: { student_id: string; status: string }[],
  daysInMonth: number,
): Map<string, MonthlyAttendanceStats> {
  const counts = new Map<string, { present: number; absent: number }>();
  for (const row of rows) {
    const sid = row.student_id;
    const cur = counts.get(sid) ?? { present: 0, absent: 0 };
    if (row.status === "present") cur.present += 1;
    else if (row.status === "absent") cur.absent += 1;
    counts.set(sid, cur);
  }
  const out = new Map<string, MonthlyAttendanceStats>();
  const denom = Math.max(daysInMonth, 1);
  for (const [sid, { present, absent }] of counts) {
    const recorded = present + absent;
    const ratePercent = Math.round((present / denom) * 1000) / 10;
    out.set(sid, {
      presentDays: present,
      recordedDays: recorded,
      daysInCalendarMonth: daysInMonth,
      ratePercent,
    });
  }
  return out;
}

export default async function StaffStudentListPage({ searchParams }: StudentListPageProps) {
  const params = (await searchParams) ?? {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const schoolId = await resolveSchoolId(supabase, user.id, user.email);
  if (!schoolId) {
    return (
      <div className="w-full max-w-6xl rounded-lg border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-700">
        لم يتم العثور على مدرسة مرتبطة بحسابك.
      </div>
    );
  }

  const query = params.q?.trim() || undefined;
  const classId = params.classId?.trim() || undefined;
  const attendanceDate = parseDateParam(params.date);
  const monthRange = parseYearMonthParam(params.month);

  const [{ data: schoolRow }, { data: classes }, studentsResult] = await Promise.all([
    supabase.from("schools").select("name").eq("id", schoolId).maybeSingle(),
    supabase.from("classes").select("id,name").eq("school_id", schoolId).order("name", { ascending: true }),
    listStudents({
      query,
      classId,
      limit: 1000,
      attendanceFrom: attendanceDate,
      attendanceTo: attendanceDate,
    }),
  ]);

  const schoolName = (schoolRow as { name?: string } | null)?.name ?? "مدرستك";

  const studentIds =
    studentsResult.success && studentsResult.students.length > 0
      ? studentsResult.students.map((s) => s.id)
      : [];

  async function fetchAttendanceInRange(
    from: string,
    to: string,
  ): Promise<{ student_id: string; status: string }[]> {
    if (studentIds.length === 0) return [];
    const pageSize = 1000;
    const all: { student_id: string; status: string }[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("student_attendance")
        .select("student_id,status")
        .eq("school_id", schoolId)
        .gte("attendance_date", from)
        .lte("attendance_date", to)
        .in("student_id", studentIds)
        .range(offset, offset + pageSize - 1);
      if (error) break;
      const chunk = (data ?? []) as { student_id: string; status: string }[];
      all.push(...chunk);
      if (chunk.length < pageSize) break;
    }
    return all;
  }

  if (studentIds.length > 0 && isPastAttendanceDateUtc(attendanceDate)) {
    await backfillAbsentForPastUnmarked({
      attendanceDate,
      studentIds,
    });
  }

  const [dailyRows, monthlyRows] =
    studentIds.length > 0
      ? await Promise.all([
          supabase
            .from("student_attendance")
            .select("student_id,status")
            .eq("school_id", schoolId)
            .eq("attendance_date", attendanceDate)
            .in("student_id", studentIds)
            .then(({ data }) => (data ?? []) as { student_id: string; status: string }[]),
          fetchAttendanceInRange(monthRange.from, monthRange.to),
        ])
      : [[], []];

  const presentByStudent = new Map<string, boolean>();
  for (const row of dailyRows) {
    presentByStudent.set(row.student_id, row.status === "present");
  }

  const calendarDaysInMonth = daysInCalendarMonth(monthRange.value);
  const monthlyStatsByStudent = buildMonthlyStatsByStudent(monthlyRows, calendarDaysInMonth);

  return (
    <div className="w-full max-w-6xl space-y-6" dir="rtl">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">قائمة الطلاب</h1>
        <p className="text-sm text-muted-foreground">
          عرض الطلاب المسجلين في مدرستك، مع البحث بالاسم، وتصفية حسب الصف، وتسجيل الحضور اليومي حسب
          التاريخ المختار، وعمود نسبة الحضور الشهرية المحسوبة من سجلات الشهر المحدد.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <span className="text-muted-foreground">المدرسة: </span>
        <span className="font-semibold">{schoolName}</span>
        <span className="mx-2 text-muted-foreground">|</span>
        <span className="text-muted-foreground">
          الحساب مرتبط بمدرسة واحدة؛ لتغيير المدرسة يجب استخدام حساب مرتبط بمدرسة أخرى.
        </span>
      </div>

      <form method="get" className="space-y-4 rounded-lg border p-5">
        <h2 className="text-lg font-semibold">البحث والتصفية</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label htmlFor="q" className="text-xs font-medium text-muted-foreground">
              بحث باسم الطالب (أو هاتف ولي الأمر)
            </label>
            <input
              id="q"
              name="q"
              defaultValue={query ?? ""}
              placeholder="اكتب للبحث…"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="classId" className="text-xs font-medium text-muted-foreground">
              الصف (ضمن المدرسة)
            </label>
            <select
              id="classId"
              name="classId"
              defaultValue={classId ?? ""}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">كل الصفوف</option>
              {(classes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="month" className="text-xs font-medium text-muted-foreground">
              شهر نسبة الحضور
            </label>
            <input
              id="month"
              name="month"
              type="month"
              defaultValue={monthRange.value}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="date" className="text-xs font-medium text-muted-foreground">
              تاريخ الحضور (اليومي)
            </label>
            <input
              id="date"
              name="date"
              type="date"
              defaultValue={attendanceDate}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            تطبيق
          </button>
          <a
            href="/staff/studentlist"
            className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            إعادة ضبط
          </a>
        </div>
      </form>

      <section className="overflow-hidden rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-3 text-sm">
          <span className="font-semibold">
            الطلاب ({studentsResult.success ? studentsResult.total : 0}) — تسجيل اليوم: {attendanceDate} — نسبة
            الحضور: شهر {monthRange.value}
          </span>
          {!studentsResult.success ? (
            <span className="text-red-700">{studentsResult.message}</span>
          ) : null}
        </div>

        {!studentsResult.success ? null : studentsResult.students.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">لا يوجد طلاب مطابقون للبحث الحالي.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-right">
                  <th className="px-3 py-3 font-medium">الاسم</th>
                  <th className="px-3 py-3 font-medium">الصف</th>
                  <th className="px-3 py-3 font-medium">النوع</th>
                  <th className="px-3 py-3 font-medium">الحالة</th>
                  <th className="px-3 py-3 font-medium">
                    نسبة الحضور
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      (شهر {monthRange.value})
                    </span>
                  </th>
                  <th className="px-3 py-3 font-medium text-center">حاضر ({attendanceDate})</th>
                </tr>
              </thead>
              <tbody>
                {studentsResult.students.map((student) => {
                  const isPresent = presentByStudent.get(student.id) === true;
                  const monthly = monthlyStatsByStudent.get(student.id);
                  return (
                    <tr key={student.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-3 font-medium">{student.fullName}</td>
                      <td className="px-3 py-3 text-muted-foreground">{student.className ?? "—"}</td>
                      <td className="px-3 py-3">{student.gender === "male" ? "ذكر" : "أنثى"}</td>
                      <td className="px-3 py-3">
                        {student.status === "active" ? (
                          <span className="text-green-700">نشط</span>
                        ) : (
                          <span className="text-muted-foreground">منسحب</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {(() => {
                          const presentDays = monthly?.presentDays ?? 0;
                          const hasAnyRecord = (monthly?.recordedDays ?? 0) > 0;
                          if (!hasAnyRecord && presentDays === 0) {
                            return (
                              <span
                                className="text-muted-foreground"
                                title="لا توجد أيام مسجّلة في هذا الشهر"
                              >
                                —
                              </span>
                            );
                          }
                          const rate = monthly?.ratePercent ?? 0;
                          const dim = monthly?.daysInCalendarMonth ?? calendarDaysInMonth;
                          return (
                            <div className="space-y-0.5">
                              <div className="font-semibold tabular-nums text-foreground">
                                {rate.toLocaleString("ar-EG")}%
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {presentDays.toLocaleString("ar-EG")} يوم حضور من أصل{" "}
                                {dim.toLocaleString("ar-EG")} يومًا في الشهر
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <DailyAttendanceCheckbox
                          studentId={student.id}
                          attendanceDate={attendanceDate}
                          initialPresent={isPresent}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        إن لم يُسجَّل حضور لطالب في التاريخ المحدد يظهر المربع غير محدد؛ عند التفعيل يُحفظ «حاضر»، وعند
        إلغاء التفعيل يُحفظ «غائب»، وفق جدول{" "}
        <code className="rounded bg-muted px-1">student_attendance</code>. نسبة الحضور الشهرية = (عدد أيام
        «حاضر» في الشهر ÷ عدد أيام ذلك الشهر التقويمي) × 100. إن لم يوجد أي سجل في الشهر يُعرض شرطة (—).
        للأيام الماضية (قبل اليوم بتوقيت UTC)، يُسجَّل «غائب» تلقائيًا لأي طالب لا يملك سجلًا لذلك التاريخ عند
        فتح هذه الصفحة، دون تعديل من سُجِّل له حضور أو غياب مسبقًا.
      </p>
    </div>
  );
}
