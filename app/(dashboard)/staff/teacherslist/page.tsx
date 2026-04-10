import { backfillAbsentForPastTeachersUnmarked, listTeachers } from "@/actions/teachers";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DailyTeacherAttendanceCheckbox } from "./daily-attendance-checkbox";

type TeachersListPageProps = {
  searchParams?: Promise<{
    q?: string;
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

function buildMonthlyStatsByTeacher(
  rows: { teacher_id: string; status: string }[],
  daysInMonth: number,
): Map<string, MonthlyAttendanceStats> {
  const counts = new Map<string, { present: number; absent: number }>();
  for (const row of rows) {
    const tid = row.teacher_id;
    const cur = counts.get(tid) ?? { present: 0, absent: 0 };
    if (row.status === "present") cur.present += 1;
    else if (row.status === "absent") cur.absent += 1;
    counts.set(tid, cur);
  }
  const out = new Map<string, MonthlyAttendanceStats>();
  const denom = Math.max(daysInMonth, 1);
  for (const [tid, { present, absent }] of counts) {
    const recorded = present + absent;
    const ratePercent = Math.round((present / denom) * 1000) / 10;
    out.set(tid, {
      presentDays: present,
      recordedDays: recorded,
      daysInCalendarMonth: daysInMonth,
      ratePercent,
    });
  }
  return out;
}

export default async function StaffTeachersListPage({ searchParams }: TeachersListPageProps) {
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
  const attendanceDate = parseDateParam(params.date);
  const monthRange = parseYearMonthParam(params.month);

  const [{ data: schoolRow }, teachersResult] = await Promise.all([
    supabase.from("schools").select("name").eq("id", schoolId).maybeSingle(),
    listTeachers({
      query,
      limit: 1000,
      attendanceFrom: attendanceDate,
      attendanceTo: attendanceDate,
    }),
  ]);

  const schoolName = (schoolRow as { name?: string } | null)?.name ?? "مدرستك";

  const teacherIds =
    teachersResult.success && teachersResult.teachers.length > 0
      ? teachersResult.teachers.map((t) => t.id)
      : [];

  async function fetchAttendanceInRange(
    from: string,
    to: string,
  ): Promise<{ teacher_id: string; status: string }[]> {
    if (teacherIds.length === 0) return [];
    const pageSize = 1000;
    const all: { teacher_id: string; status: string }[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("teacher_attendance")
        .select("teacher_id,status")
        .eq("school_id", schoolId)
        .gte("attendance_date", from)
        .lte("attendance_date", to)
        .in("teacher_id", teacherIds)
        .range(offset, offset + pageSize - 1);
      if (error) break;
      const chunk = (data ?? []) as { teacher_id: string; status: string }[];
      all.push(...chunk);
      if (chunk.length < pageSize) break;
    }
    return all;
  }

  if (teacherIds.length > 0 && isPastAttendanceDateUtc(attendanceDate)) {
    await backfillAbsentForPastTeachersUnmarked({
      attendanceDate,
      teacherIds,
    });
  }

  const [dailyRows, monthlyRows] =
    teacherIds.length > 0
      ? await Promise.all([
          supabase
            .from("teacher_attendance")
            .select("teacher_id,status")
            .eq("school_id", schoolId)
            .eq("attendance_date", attendanceDate)
            .in("teacher_id", teacherIds)
            .then(({ data }) => (data ?? []) as { teacher_id: string; status: string }[]),
          fetchAttendanceInRange(monthRange.from, monthRange.to),
        ])
      : [[], []];

  const presentByTeacher = new Map<string, boolean>();
  for (const row of dailyRows) {
    presentByTeacher.set(row.teacher_id, row.status === "present");
  }

  const calendarDaysInMonth = daysInCalendarMonth(monthRange.value);
  const monthlyStatsByTeacher = buildMonthlyStatsByTeacher(monthlyRows, calendarDaysInMonth);

  return (
    <div className="w-full max-w-6xl space-y-6" dir="rtl">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">قائمة المعلمين</h1>
        <p className="text-sm text-muted-foreground">
          عرض المعلمين المسجلين في مدرستك، مع البحث بالاسم أو الهاتف أو المادة، وتسجيل الحضور اليومي حسب
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="q" className="text-xs font-medium text-muted-foreground">
              بحث (الاسم، الهاتف، أو المادة)
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
            href="/staff/teacherslist"
            className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            إعادة ضبط
          </a>
        </div>
      </form>

      <section className="overflow-hidden rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-3 text-sm">
          <span className="font-semibold">
            المعلمون ({teachersResult.success ? teachersResult.total : 0}) — تسجيل اليوم: {attendanceDate} — نسبة
            الحضور: شهر {monthRange.value}
          </span>
          {!teachersResult.success ? (
            <span className="text-red-700">{teachersResult.message}</span>
          ) : null}
        </div>

        {!teachersResult.success ? null : teachersResult.teachers.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">لا يوجد معلمون مطابقون للبحث الحالي.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-right">
                  <th className="px-3 py-3 font-medium">الاسم</th>
                  <th className="px-3 py-3 font-medium">المادة</th>
                  <th className="px-3 py-3 font-medium">الهاتف</th>
                  <th className="px-3 py-3 font-medium">الراتب</th>
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
                {teachersResult.teachers.map((teacher) => {
                  const isPresent = presentByTeacher.get(teacher.id) === true;
                  const monthly = monthlyStatsByTeacher.get(teacher.id);
                  return (
                    <tr key={teacher.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-3 font-medium">{teacher.fullName}</td>
                      <td className="px-3 py-3 text-muted-foreground">{teacher.subject ?? "—"}</td>
                      <td className="px-3 py-3 text-muted-foreground tabular-nums">{teacher.phone ?? "—"}</td>
                      <td className="px-3 py-3 tabular-nums">
                        {teacher.salary.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
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
                                {rate.toLocaleString("en-US")}%
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {presentDays.toLocaleString("en-US")} يوم حضور من أصل{" "}
                                {dim.toLocaleString("en-US")} يومًا في الشهر
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <DailyTeacherAttendanceCheckbox
                          teacherId={teacher.id}
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
        إن لم يُسجَّل حضور لمعلم في التاريخ المحدد يظهر المربع غير محدد؛ عند التفعيل يُحفظ «حاضر»، وعند
        إلغاء التفعيل يُحفظ «غائب»، وفق جدول{" "}
        <code className="rounded bg-muted px-1">teacher_attendance</code>. نسبة الحضور الشهرية = (عدد أيام
        «حاضر» في الشهر ÷ عدد أيام ذلك الشهر التقويمي) × 100. إن لم يوجد أي سجل في الشهر يُعرض شرطة (—).
        للأيام الماضية (قبل اليوم بتوقيت UTC)، يُسجَّل «غائب» تلقائيًا لأي معلم لا يملك سجلًا لذلك التاريخ عند
        فتح هذه الصفحة، دون تعديل من سُجِّل له حضور أو غياب مسبقًا.
      </p>
    </div>
  );
}
