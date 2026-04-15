import { backfillAbsentForPastUnmarked, listStudents } from "@/actions/students";
import { Button } from "@/components/ui/button";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DailyAttendanceCheckbox } from "./daily-attendance-checkbox";
import { StudentListFilters } from "./student-list-filters";

const STUDENT_PAGE_SIZE = 10;

type StudentListPageProps = {
  searchParams?: Promise<{
    q?: string;
    classId?: string;
    date?: string;
    page?: string;
  }>;
};

function parsePageParam(value: string | undefined): number {
  const n = Number.parseInt(String(value ?? "").trim() || "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

type StudentListQuery = {
  q?: string;
  classId?: string;
  date?: string;
  page?: number;
};

function buildStudentListHref(parts: StudentListQuery): string {
  const sp = new URLSearchParams();
  if (parts.q?.trim()) sp.set("q", parts.q.trim());
  if (parts.classId?.trim()) sp.set("classId", parts.classId.trim());
  if (parts.date?.trim()) sp.set("date", parts.date.trim());
  if (parts.page != null && parts.page > 1) sp.set("page", String(parts.page));
  const qs = sp.toString();
  return qs ? `/staff/studentlist?${qs}` : "/staff/studentlist";
}

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
  daysInSchoolMonth: number;
  /** (أيام الحضور ÷ أيام الدوام في الشهر) × 100 */
  ratePercent: number;
};

function daysInSchoolMonthExcludingFriSat(ymValue: string): number {
  const parsed = monthToDateRange(ymValue);
  if (!parsed) return 22;
  const y = Number(parsed.from.slice(0, 4));
  const mo = Number(parsed.from.slice(5, 7));
  if (!Number.isFinite(y) || mo < 1 || mo > 12) return 22;
  const lastDay = new Date(y, mo, 0).getDate();
  let schoolDays = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    const weekday = new Date(Date.UTC(y, mo - 1, day)).getUTCDay();
    if (weekday === 5 || weekday === 6) continue; // الجمعة والسبت
    schoolDays += 1;
  }
  return schoolDays;
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
      daysInSchoolMonth: daysInMonth,
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
      <div className="p-6 flex flex-col gap-6" dir="rtl">
        <div className="rounded-2xl border border-amber-400/40 bg-amber-100/40 p-6 text-amber-900 text-center text-sm">
          لم يتم العثور على مدرسة مرتبطة بحسابك.
        </div>
      </div>
    );
  }

  const query = params.q?.trim() || undefined;
  const classId = params.classId?.trim() || undefined;
  const attendanceDate = parseDateParam(params.date);
  const monthRange = parseYearMonthParam(undefined);
  const page = parsePageParam(params.page);
  const offset = (page - 1) * STUDENT_PAGE_SIZE;

  const [{ data: schoolRow }, { data: classes }, studentsResult] = await Promise.all([
    supabase.from("schools").select("name").eq("id", schoolId).maybeSingle(),
    supabase.from("classes").select("id,name").eq("school_id", schoolId).order("name", { ascending: true }),
    listStudents({
      query,
      classId,
      limit: STUDENT_PAGE_SIZE,
      offset,
      attendanceFrom: attendanceDate,
      attendanceTo: attendanceDate,
    }),
  ]);

  const schoolName = (schoolRow as { name?: string } | null)?.name ?? "مدرستك";

  const listTotal = studentsResult.success ? studentsResult.total : 0;
  const totalPages = Math.max(1, Math.ceil(listTotal / STUDENT_PAGE_SIZE));
  if (studentsResult.success && page > totalPages) {
    redirect(
      buildStudentListHref({
        q: query,
        classId,
        date: attendanceDate,
        page: listTotal === 0 ? 1 : totalPages,
      }),
    );
  }

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
      revalidateViews: false,
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

  const schoolDaysInMonth = daysInSchoolMonthExcludingFriSat(monthRange.value);
  const monthlyStatsByStudent = buildMonthlyStatsByStudent(monthlyRows, schoolDaysInMonth);

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-6" dir="rtl">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">قائمة الطلاب</h1>
          <p className="text-sm text-muted-foreground">{schoolName}</p>
        </div>
      </div>

      <StudentListFilters
        classes={(classes ?? []) as { id: string; name: string }[]}
        initialQuery={query ?? ""}
        initialClassId={classId ?? ""}
        initialDate={attendanceDate}
      />

      <section className="bg-white rounded-3xl shadow-lg border overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/80 px-6 py-4 text-sm">
          <div className="font-semibold text-gray-800">
            الطلاب: {studentsResult.success ? studentsResult.total.toLocaleString("en-US") : "—"}
            {studentsResult.success && studentsResult.total > 0 ? (
              <>
                <span className="mx-2 font-normal text-muted-foreground">·</span>
                <span className="font-normal text-muted-foreground">
                  عرض {(page - 1) * STUDENT_PAGE_SIZE + 1}–
                  {Math.min(page * STUDENT_PAGE_SIZE, studentsResult.total).toLocaleString("en-US")}
                </span>
              </>
            ) : null}
            <span className="mx-2 font-normal text-muted-foreground">·</span>
            <span className="font-normal text-muted-foreground">اليوم {attendanceDate}</span>
            <span className="mx-2 font-normal text-muted-foreground">·</span>
            <span className="font-normal text-muted-foreground">الشهر {monthRange.value}</span>
          </div>
          {!studentsResult.success ? <span className="text-sm text-red-700">{studentsResult.message}</span> : null}
        </div>

        {!studentsResult.success ? null : studentsResult.students.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">لا يوجد طلاب مطابقون.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-right text-gray-800">
                  <th className="px-4 py-3 font-semibold">الاسم</th>
                  <th className="px-4 py-3 font-semibold">الصف</th>
                  <th className="px-4 py-3 font-semibold">النوع</th>
                  <th className="px-4 py-3 font-semibold">الحالة</th>
                  <th className="px-4 py-3 font-semibold">
                    نسبة الحضور
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{monthRange.value}</span>
                  </th>
                  <th className="px-4 py-3 text-center font-semibold">حاضر</th>
                </tr>
              </thead>
              <tbody>
                {studentsResult.students.map((student) => {
                  const isPresent = presentByStudent.get(student.id) === true;
                  const monthly = monthlyStatsByStudent.get(student.id);
                  return (
                    <tr key={student.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/80">
                      <td className="px-4 py-3 font-medium text-gray-900">{student.fullName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{student.className ?? "—"}</td>
                      <td className="px-4 py-3">{student.gender === "male" ? "ذكر" : "أنثى"}</td>
                      <td className="px-4 py-3">
                        {student.status === "active" ? (
                          <span className="text-green-700">نشط</span>
                        ) : (
                          <span className="text-muted-foreground">منسحب</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
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
                          const dim = monthly?.daysInSchoolMonth ?? schoolDaysInMonth;
                          return (
                            <div className="space-y-0.5">
                              <div className="font-semibold tabular-nums text-foreground">
                                {rate.toLocaleString("en-US")}%
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {presentDays.toLocaleString("en-US")} يوم حضور من أصل{" "}
                                {dim.toLocaleString("en-US")} يوم دوام في الشهر
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-center">
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

        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-gray-100 bg-gray-50/50 px-6 py-4 text-sm">
          {!studentsResult.success || page <= 1 || listTotal === 0 ? (
            <Button type="button" variant="outline" className="rounded-md" disabled>
              السابق
            </Button>
          ) : (
            <Button variant="outline" className="rounded-md" asChild>
              <Link
                href={buildStudentListHref({
                  q: query,
                  classId,
                  date: attendanceDate,
                  page: page - 1,
                })}
              >
                السابق
              </Link>
            </Button>
          )}
          <span className="tabular-nums text-muted-foreground">
            {studentsResult.success
              ? `صفحة ${page.toLocaleString("en-US")} من ${totalPages.toLocaleString("en-US")}`
              : "—"}
          </span>
          {!studentsResult.success || page >= totalPages || listTotal === 0 ? (
            <Button type="button" variant="outline" className="rounded-md" disabled>
              التالي
            </Button>
          ) : (
            <Button variant="outline" className="rounded-md" asChild>
              <Link
                href={buildStudentListHref({
                  q: query,
                  classId,
                  date: attendanceDate,
                  page: page + 1,
                })}
              >
                التالي
              </Link>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
