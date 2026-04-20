import { backfillAbsentForPastTeachersUnmarked, createTeacher, deleteTeacher, listTeachers, updateTeacher } from "@/actions/teachers";
import Pagination from "@/components/component/Pagination";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DailyTeacherAttendanceCheckbox } from "./daily-attendance-checkbox";
import { InstantTeacherFilters } from "./instant-teacher-filters";
import { TeacherCreateDialog, TeacherRowActions } from "./teacher-crud-actions";

const TEACHER_PAGE_SIZE = 20;

type TeachersListPageProps = {
  searchParams?: Promise<{
    q?: string;
    date?: string;
    month?: string;
    page?: string;
    status?: string;
    message?: string;
  }>;
};

type TeachersListQuery = {
  q?: string;
  date?: string;
  month?: string;
  page?: number;
  status?: string;
  message?: string;
};

function parsePageParam(value: string | undefined): number {
  const n = Number.parseInt(String(value ?? "").trim() || "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

function buildTeachersListHref(parts: TeachersListQuery): string {
  const sp = new URLSearchParams();
  if (parts.q?.trim()) sp.set("q", parts.q.trim());
  if (parts.date?.trim()) sp.set("date", parts.date.trim());
  if (parts.month?.trim()) sp.set("month", parts.month.trim());
  if (parts.page != null && parts.page > 1) sp.set("page", String(parts.page));
  if (parts.status?.trim()) sp.set("status", parts.status.trim());
  if (parts.message?.trim()) sp.set("message", parts.message.trim());
  const qs = sp.toString();
  return qs ? `/staff/teacherslist?${qs}` : "/staff/teacherslist";
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
  daysInSchoolMonth: number;
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
      daysInSchoolMonth: daysInMonth,
      ratePercent,
    });
  }
  return out;
}

export default async function StaffTeachersListPage({ searchParams }: TeachersListPageProps) {
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
  const attendanceDate = parseDateParam(params.date);
  const monthRange = parseYearMonthParam(params.month);
  const page = parsePageParam(params.page);
  const offset = (page - 1) * TEACHER_PAGE_SIZE;
  const preserveState = {
    q: query ?? "",
    date: attendanceDate,
    month: monthRange.value,
  };

  const [{ data: schoolRow }, teachersResult] = await Promise.all([
    supabase.from("schools").select("name").eq("id", schoolId).maybeSingle(),
    listTeachers({
      query,
      limit: TEACHER_PAGE_SIZE,
      offset,
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
      revalidateViews: false,
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

  const schoolDaysInMonth = daysInSchoolMonthExcludingFriSat(monthRange.value);
  const monthlyStatsByTeacher = buildMonthlyStatsByTeacher(monthlyRows, schoolDaysInMonth);

  const totalTeachers = teachersResult.success ? teachersResult.total : 0;
  const totalPages = Math.max(1, Math.ceil(totalTeachers / TEACHER_PAGE_SIZE));
  if (teachersResult.success && page > totalPages) {
    redirect(
      buildTeachersListHref({
        q: query,
        date: attendanceDate,
        month: monthRange.value,
        page: totalTeachers === 0 ? 1 : totalPages,
      }),
    );
  }

  async function createTeacherAction(formData: FormData) {
    "use server";
    const preserveQ = String(formData.get("preserveQ") ?? "").trim();
    const preserveDate = String(formData.get("preserveDate") ?? "").trim();
    const preserveMonth = String(formData.get("preserveMonth") ?? "").trim();
    const result = await createTeacher({
      fullName: String(formData.get("fullName") ?? "").trim(),
      academicQualification: asNullableText(formData.get("academicQualification")),
      certificateObtainedDate: asNullableText(formData.get("certificateObtainedDate")) ?? undefined,
      certificateSource: asNullableText(formData.get("certificateSource")),
      yearsOfExperience: asNullableNumber(formData.get("yearsOfExperience")),
      phone: asNullableText(formData.get("phone")),
      subject: asNullableText(formData.get("subject")),
      salary: asNullableNumber(formData.get("salary")),
      salaryInstallmentDueDate: asNullableText(formData.get("salaryInstallmentDueDate")) ?? undefined,
    });
    redirect(
      buildTeachersListHref({
        q: preserveQ,
        date: preserveDate,
        month: preserveMonth,
        status: result.success ? "success" : "error",
        message: result.message,
      }),
    );
  }

  async function updateTeacherAction(formData: FormData) {
    "use server";
    const preserveQ = String(formData.get("preserveQ") ?? "").trim();
    const preserveDate = String(formData.get("preserveDate") ?? "").trim();
    const preserveMonth = String(formData.get("preserveMonth") ?? "").trim();
    const result = await updateTeacher({
      id: String(formData.get("teacherId") ?? "").trim(),
      fullName: String(formData.get("fullName") ?? "").trim(),
      academicQualification: asNullableText(formData.get("academicQualification")),
      certificateObtainedDate: asNullableText(formData.get("certificateObtainedDate")) ?? undefined,
      certificateSource: asNullableText(formData.get("certificateSource")),
      yearsOfExperience: asNullableNumber(formData.get("yearsOfExperience")),
      phone: asNullableText(formData.get("phone")),
      subject: asNullableText(formData.get("subject")),
      salary: asNullableNumber(formData.get("salary")),
    });
    redirect(
      buildTeachersListHref({
        q: preserveQ,
        date: preserveDate,
        month: preserveMonth,
        status: result.success ? "success" : "error",
        message: result.message,
      }),
    );
  }

  async function deleteTeacherAction(formData: FormData) {
    "use server";
    const preserveQ = String(formData.get("preserveQ") ?? "").trim();
    const preserveDate = String(formData.get("preserveDate") ?? "").trim();
    const preserveMonth = String(formData.get("preserveMonth") ?? "").trim();
    const result = await deleteTeacher({
      id: String(formData.get("teacherId") ?? "").trim(),
    });
    redirect(
      buildTeachersListHref({
        q: preserveQ,
        date: preserveDate,
        month: preserveMonth,
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
          <h1 className="hidden md:block text-lg font-semibold mr-2">قائمة الموظفين</h1>
          <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
            <InstantTeacherFilters initialQuery={query ?? ""} initialDate={attendanceDate} initialMonth={monthRange.value} />
            <div className="flex items-center gap-4">
              <TeacherCreateDialog preserve={preserveState} createTeacherAction={createTeacherAction} />
              {!teachersResult.success ? <span className="text-sm text-red-700">{teachersResult.message}</span> : null}
            </div>
          </div>
        </div>

        {!teachersResult.success ? null : teachersResult.teachers.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">لا يوجد موظفون مطابقون.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm mt-4">
              <thead>
                <tr className="border-b bg-white text-right text-gray-800">
                  <th className="px-4 py-3 font-semibold text-center">الاسم</th>
                  <th className="px-4 py-3 font-semibold text-center">المادة</th>
                  <th className="px-4 py-3 font-semibold text-center">الهاتف</th>
                  <th className="px-4 py-3 font-semibold text-center">الراتب</th>
                  <th className="px-4 py-3 font-semibold text-center">المؤهل العلمي</th>
                  <th className="px-4 py-3 font-semibold text-center">نسبة الحضور</th>
                  <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">الحضور اليومي</th>
                  <th className="px-4 py-3 text-start font-semibold whitespace-nowrap">الاجراءات</th>
                </tr>
              </thead>
              <tbody>
                {teachersResult.teachers.map((teacher, index) => {
                  const isPresent = presentByTeacher.get(teacher.id) === true;
                  const monthly = monthlyStatsByTeacher.get(teacher.id);
                  const displayId = offset + index + 1;
                  return (
                    <tr key={teacher.id} className="hover:bg-slate-100 border-b even:bg-slate-50">
                      <td className="px-4 py-3 text-center font-medium text-gray-900">{teacher.fullName}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{teacher.subject ?? "—"}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground tabular-nums">{teacher.phone ?? "—"}</td>
                      <td className="px-4 py-3 text-center tabular-nums text-foreground">
                        ${teacher.salary.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{teacher.academicQualification ?? "—"}</td>
                      <td className="px-4 py-3 text-center">
                        {(() => {
                          const presentDays = monthly?.presentDays ?? 0;
                          const hasAnyRecord = (monthly?.recordedDays ?? 0) > 0;
                          if (!hasAnyRecord && presentDays === 0) {
                            return <span className="text-muted-foreground">—</span>;
                          }
                          const rate = monthly?.ratePercent ?? 0;
                          const dim = monthly?.daysInSchoolMonth ?? schoolDaysInMonth;
                          return (
                            <div className="space-y-0.5">
                              <div className="font-semibold tabular-nums text-foreground">{rate.toLocaleString("en-US")}%</div>
                              <div className="text-xs text-muted-foreground">
                                {presentDays.toLocaleString("en-US")} يوم حضور من أصل {dim.toLocaleString("en-US")} يوم دوام في الشهر
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center">
                          <DailyTeacherAttendanceCheckbox
                            teacherId={teacher.id}
                            attendanceDate={attendanceDate}
                            initialPresent={isPresent}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <TeacherRowActions
                          teacher={{
                            id: teacher.id,
                            displayId,
                            fullName: teacher.fullName,
                            academicQualification: teacher.academicQualification,
                            certificateObtainedDate: teacher.certificateObtainedDate,
                            certificateSource: teacher.certificateSource,
                            yearsOfExperience: teacher.yearsOfExperience,
                            phone: teacher.phone,
                            salary: teacher.salary,
                            subject: teacher.subject,
                          }}
                          preserve={preserveState}
                          updateTeacherAction={updateTeacherAction}
                          deleteTeacherAction={deleteTeacherAction}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {teachersResult.success && totalTeachers > 0 ? <Pagination currentPage={page} totalPages={totalPages} /> : null}
      </section>
    </div>
  );
}
