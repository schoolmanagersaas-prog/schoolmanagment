import {
  getStaffDashboardMonthlyFinance,
  getStaffDashboardStats,
  getStaffDashboardStudentAttendanceWeek,
  getStaffDashboardStudentGenderBreakdown,
} from "@/actions/staff-dashboard";
import Attendance from "@/components/component/Attendance";
import CountCharts from "@/components/component/CountCharts";
import FinanceChart from "@/components/component/FinanceChart";
import UserCard from "@/components/component/UserCard";
import EventCalender from "@/components/component/EventCalender";
function formatShortDate(iso: string): string {
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return iso;
  try {
    return new Date(`${d}T12:00:00Z`).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      numberingSystem: "latn",
    });
  } catch {
    return d;
  }
}

export default async function StaffPage() {
  const dash = await getStaffDashboardStats();
  if (!dash.success) {
    return (
      <div
        className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-900"
        dir="rtl"
      >
        {dash.message}
      </div>
    );
  }

  const monthLabel = formatShortDate(dash.monthStartedAt);

  const [weekAtt, genderBreakdown, financeY] = await Promise.all([
    getStaffDashboardStudentAttendanceWeek(),
    getStaffDashboardStudentGenderBreakdown(),
    getStaffDashboardMonthlyFinance(),
  ]);

  return (
    <div className="p-4 flex flex-col gap-8" dir="rtl">
      <div className="flex gap-4 flex-col lg:flex-row lg:items-start">
        <div className="w-full lg:w-2/3 flex flex-col gap-8 min-w-0">
          <div className="flex gap-4 justify-between flex-wrap">
            <UserCard type="طالب" count={dash.totalStudentsActive} />
            <UserCard type="مدرس" count={dash.totalTeachers} />
            <UserCard type="ولي أمر" count={0} />
            <UserCard type="طاقم عمل" count={dash.teachersPaidThisMonthCount} badgeLabel={monthLabel} />
          </div>

          {!weekAtt.success ? (
            <p className="text-sm text-amber-800">{weekAtt.message}</p>
          ) : null}
          {!genderBreakdown.success ? (
            <p className="text-sm text-amber-800">{genderBreakdown.message}</p>
          ) : null}
          {!financeY.success ? <p className="text-sm text-amber-800">{financeY.message}</p> : null}

          <div className="flex gap-4 flex-col lg:flex-row">
            <div className="w-full lg:w-1/3 h-[450px] min-h-[320px]">
              <CountCharts
                payload={genderBreakdown.success ? genderBreakdown.payload : null}
              />
            </div>
            <div className="w-full lg:w-2/3 h-[450px] min-h-[320px]">
              <Attendance data={weekAtt.days} />
            </div>
          </div>
        </div>

        <div className="w-full lg:w-1/3 flex flex-col gap-8 shrink-0">
          <div className="rounded-xl bg-muted/20 p-4 text-center text-sm text-muted-foreground sm:p-5">
            <EventCalender />
          </div>
          <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            الإعلانات — قريبًا
          </div>
        </div>
      </div>

      <div className="w-full min-w-0">
        <FinanceChart
          months={financeY.success ? financeY.months : []}
          totalRevenue={financeY.success ? financeY.totalRevenue : 0}
          totalExpenses={financeY.success ? financeY.totalExpenses : 0}
          year={financeY.year}
        />
      </div>
    </div>
  );
}
