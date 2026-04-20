import { backfillAbsentForPastUnmarked, createStudent, deleteStudent, listStudents, updateStudent } from "@/actions/students";
import { Button } from "@/components/ui/button";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import { ArrowUpDown, Filter, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DailyAttendanceCheckbox } from "./daily-attendance-checkbox";
import { StudentCreateDialog, StudentRowActions } from "./student-crud-actions";

const STUDENT_PAGE_SIZE = 10;

type StudentListPageProps = {
  searchParams?: Promise<{
    q?: string;
    classId?: string;
    date?: string;
    page?: string;
    status?: string;
    message?: string;
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
  status?: string;
  message?: string;
};

function buildStudentListHref(parts: StudentListQuery): string {
  const sp = new URLSearchParams();
  if (parts.q?.trim()) sp.set("q", parts.q.trim());
  if (parts.classId?.trim()) sp.set("classId", parts.classId.trim());
  if (parts.date?.trim()) sp.set("date", parts.date.trim());
  if (parts.page != null && parts.page > 1) sp.set("page", String(parts.page));
  if (parts.status?.trim()) sp.set("status", parts.status.trim());
  if (parts.message?.trim()) sp.set("message", parts.message.trim());
  const qs = sp.toString();
  return qs ? `/staff/studentlist?${qs}` : "/staff/studentlist";
}

function asNullableText(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function asNullableNumber(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return undefined;
  return number;
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
  const flashStatus = params.status === "success" ? "success" : params.status === "error" ? "error" : null;
  const flashMessage = params.message?.trim() || null;
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
  const preserveState = {
    q: query ?? "",
    classId: classId ?? "",
    date: attendanceDate,
    page: String(page),
  };

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

  async function createStudentAction(formData: FormData) {
    "use server";
    const preserveQ = String(formData.get("preserveQ") ?? "").trim();
    const preserveClassId = String(formData.get("preserveClassId") ?? "").trim();
    const preserveDate = String(formData.get("preserveDate") ?? "").trim();
    const preservePage = parsePageParam(String(formData.get("preservePage") ?? "1"));
    const result = await createStudent({
      fullName: String(formData.get("fullName") ?? "").trim(),
      classId: asNullableText(formData.get("classId")),
      gender: (String(formData.get("gender") ?? "male").trim() === "female" ? "female" : "male") as "male" | "female",
      baseTuition: asNullableNumber(formData.get("baseTuition")),
      installmentDueDate: new Date().toISOString().slice(0, 10),
      guardianPhone: asNullableText(formData.get("guardianPhone")),
      address: asNullableText(formData.get("address")),
      status: String(formData.get("status") ?? "active").trim() === "withdrawn" ? "withdrawn" : "active",
    });
    redirect(
      buildStudentListHref({
        q: preserveQ,
        classId: preserveClassId,
        date: preserveDate,
        page: preservePage,
        status: result.success ? "success" : "error",
        message: result.message,
      }),
    );
  }

  async function updateStudentAction(formData: FormData) {
    "use server";
    const preserveQ = String(formData.get("preserveQ") ?? "").trim();
    const preserveClassId = String(formData.get("preserveClassId") ?? "").trim();
    const preserveDate = String(formData.get("preserveDate") ?? "").trim();
    const preservePage = parsePageParam(String(formData.get("preservePage") ?? "1"));
    const result = await updateStudent({
      id: String(formData.get("studentId") ?? "").trim(),
      fullName: String(formData.get("fullName") ?? "").trim(),
      classId: asNullableText(formData.get("classId")),
      gender: (String(formData.get("gender") ?? "male").trim() === "female" ? "female" : "male") as "male" | "female",
      baseTuition: asNullableNumber(formData.get("baseTuition")),
      guardianPhone: asNullableText(formData.get("guardianPhone")),
      address: asNullableText(formData.get("address")),
      status: String(formData.get("status") ?? "active").trim() === "withdrawn" ? "withdrawn" : "active",
    });
    redirect(
      buildStudentListHref({
        q: preserveQ,
        classId: preserveClassId,
        date: preserveDate,
        page: preservePage,
        status: result.success ? "success" : "error",
        message: result.message,
      }),
    );
  }

  async function deleteStudentAction(formData: FormData) {
    "use server";
    const preserveQ = String(formData.get("preserveQ") ?? "").trim();
    const preserveClassId = String(formData.get("preserveClassId") ?? "").trim();
    const preserveDate = String(formData.get("preserveDate") ?? "").trim();
    const preservePage = parsePageParam(String(formData.get("preservePage") ?? "1"));
    const result = await deleteStudent({
      id: String(formData.get("studentId") ?? "").trim(),
    });
    redirect(
      buildStudentListHref({
        q: preserveQ,
        classId: preserveClassId,
        date: preserveDate,
        page: preservePage,
        status: result.success ? "success" : "error",
        message: result.message,
      }),
    );
  }

  return (
    <div className="bg-white p-4 rounded-md mt-4 max-w-6xl mx-auto" dir="rtl">
      <p className="mb-2 text-xs text-muted-foreground">{schoolName}</p>

      {flashStatus && flashMessage ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            flashStatus === "success"
              ? "border-green-500/40 bg-green-500/10 text-green-800"
              : "border-red-500/40 bg-red-500/10 text-red-800"
          }`}
        >
          {flashMessage}
        </div>
      ) : null}

      <section className="bg-white rounded-md overflow-hidden">
        <div className="flex items-center justify-between">
          <h1 className="hidden md:block text-lg font-semibold mr-2">قائمة الطلاب</h1>
          <form method="get" className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
            <div className="relative w-full md:w-auto">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                name="q"
                defaultValue={query ?? ""}
                placeholder="ابحث باسم الطالب أو رقم ولي الأمر"
                className="h-8 w-full md:w-64 rounded-md border border-input bg-background pr-9 pl-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </div>

            <select
              name="classId"
              defaultValue={classId ?? ""}
              className="h-8 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            >
              <option value="">كل الصفوف</option>
              {((classes ?? []) as { id: string; name: string }[]).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <input
              type="date"
              name="date"
              defaultValue={attendanceDate}
              className="h-8 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <button type="submit" className="hidden" aria-hidden />
            <div className="flex items-center gap-4">
              <StudentCreateDialog
                classes={(classes ?? []) as { id: string; name: string }[]}
                preserve={preserveState}
                createStudentAction={createStudentAction}
              />
              <button type="button" className="w-8 h-8 flex items-center justify-center rounded-full bg-Yellow p-2">
                <Filter className="size-4" />
              </button>
              <button type="button" className="w-8 h-8 flex items-center justify-center rounded-full bg-Yellow p-2">
                <ArrowUpDown className="size-4" />
              </button>
            </div>
          </form>
        </div>
        {!studentsResult.success ? <span className="text-sm text-red-700">{studentsResult.message}</span> : null}

        {!studentsResult.success ? null : studentsResult.students.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">لا يوجد طلاب مطابقون.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm mt-4">
              <thead>
                <tr className="border-b bg-white text-right text-gray-800">
                  <th className="px-4 py-3 font-semibold text-center">الاسم الكامل</th>
                  <th className="hidden md:table-cell px-4 py-3 font-semibold text-center">الصف</th>
                  <th className="hidden md:table-cell px-4 py-3 font-semibold text-center">النوع</th>
                  <th className="hidden lg:table-cell px-4 py-3 font-semibold text-center">القسط الأساسي</th>
                  <th className="hidden lg:table-cell px-4 py-3 font-semibold text-center">هاتف ولي الأمر</th>
                  <th className="hidden xl:table-cell px-4 py-3 font-semibold text-center">العنوان</th>
                  <th className="hidden md:table-cell px-4 py-3 font-semibold text-center">نسبة الحضور</th>
                  <th className="px-4 py-3 text-start font-semibold whitespace-nowrap">الاجراءات</th>
                </tr>
              </thead>
              <tbody>
                {studentsResult.students.map((student) => {
                  const isPresent = presentByStudent.get(student.id) === true;
                  const monthly = monthlyStatsByStudent.get(student.id);
                  const studentIdLabel = student.id.slice(0, 8).toUpperCase();
                  const attendedDays = monthly?.presentDays ?? 0;
                  const fixedSchoolDays = 22;
                  const rate = Math.round((attendedDays / fixedSchoolDays) * 1000) / 10;
                  return (
                    <tr key={student.id} className="hover:bg-slate-100 border-b even:bg-slate-50">
                      <td className="w-full md:w-auto flex flex-row gap-3 m-3">
                        <div className="flex size-10 items-center justify-center rounded-full bg-sky/20 text-sm font-bold text-sky-700 md:hidden xl:flex">
                          {student.fullName.slice(0, 1)}
                        </div>
                        <div className="flex flex-col">
                          <h3 className="font-semibold text-gray-900">{student.fullName}</h3>
                          <h4 className="text-xs text-gray-500">{student.className ?? "بدون صف"}</h4>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-center">{student.className ?? "—"}</td>
                      <td className="hidden md:table-cell px-4 py-3 text-center">
                        {student.gender === "male" ? "ذكر" : "أنثى"}
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3 text-center">
                        {student.baseTuition.toLocaleString("en-US")}
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3 text-center">{student.guardianPhone ?? "—"}</td>
                      <td className="hidden xl:table-cell px-4 py-3 text-center text-muted-foreground">
                        {student.address ?? "—"}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-center">
                        <div className="font-semibold tabular-nums text-foreground">{rate.toLocaleString("en-US")}%</div>
                        <div className="text-xs text-muted-foreground">{attendedDays.toLocaleString("en-US")} يوم من أصل 22</div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <DailyAttendanceCheckbox
                            studentId={student.id}
                            attendanceDate={attendanceDate}
                            initialPresent={isPresent}
                          />
                          <StudentRowActions
                            student={{
                              id: student.id,
                              fullName: student.fullName,
                              classId: student.classId,
                              gender: student.gender,
                              baseTuition: student.baseTuition,
                              guardianPhone: student.guardianPhone,
                              address: student.address,
                              status: student.status,
                            }}
                            classes={(classes ?? []) as { id: string; name: string }[]}
                            preserve={preserveState}
                            updateStudentAction={updateStudentAction}
                            deleteStudentAction={deleteStudentAction}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between text-gray-500 border-t border-white/10 px-4 py-3 sm:px-6">
          {!studentsResult.success || page <= 1 || listTotal === 0 ? (
            <Button type="button" className="py-2 px-4 rounded-md bg-slate-200 text-xs font-semibold" disabled>
              السابق
            </Button>
          ) : (
            <Button className="py-2 px-4 rounded-md bg-slate-200 text-xs font-semibold" asChild>
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
          <span className="tabular-nums text-muted-foreground text-xs">
            {studentsResult.success
              ? `صفحة ${page.toLocaleString("en-US")} من ${totalPages.toLocaleString("en-US")}`
              : "—"}
          </span>
          {!studentsResult.success || page >= totalPages || listTotal === 0 ? (
            <Button type="button" className="py-2 px-4 rounded-md bg-slate-200 text-xs font-semibold" disabled>
              التالي
            </Button>
          ) : (
            <Button className="py-2 px-4 rounded-md bg-slate-200 text-xs font-semibold" asChild>
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
