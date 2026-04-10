"use client";

import type { StaffAttendanceWeekDay } from "@/actions/staff-dashboard";
import moreIcon from "@/app/images/moreDark.png";
import Image from "next/image";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type AttendanceProps = {
  data: StaffAttendanceWeekDay[];
};

const emptyWeek: StaffAttendanceWeekDay[] = [
  { name: "الأحد", حاضر: 0, غائب: 0 },
  { name: "الاثنين", حاضر: 0, غائب: 0 },
  { name: "الثلاثاء", حاضر: 0, غائب: 0 },
  { name: "الأربعاء", حاضر: 0, غائب: 0 },
  { name: "الخميس", حاضر: 0, غائب: 0 },
];

export default function Attendance({ data }: AttendanceProps) {
  const chartData = data.length > 0 ? data : emptyWeek;

  return (
    <div className="bg-white rounded-lg p-4 h-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 mb-1">الحضور</h1>
          <p className="text-sm text-gray-500">إحصائيات الحضور والغياب الأسبوعية (طلاب)</p>
        </div>
        <div className="p-2 hover:bg-gray-200 transition-colors duration-200 cursor-pointer">
          <Image src={moreIcon} alt="المزيد من الخيارات" width={20} height={20} />
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} barSize={20}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ddd" />
            <XAxis dataKey="name" axisLine={false} tick={{ fill: "#6b7280" }} tickLine={false} />
            <YAxis
              axisLine={false}
              tick={{ fill: "#6b7280" }}
              tickLine={false}
              tickFormatter={(v) => Number(v).toLocaleString("en-US")}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "10px",
                borderColor: "lightgray",
                backgroundColor: "white",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              }}
              formatter={(value) =>
                typeof value === "number"
                  ? value.toLocaleString("en-US")
                  : Number(value).toLocaleString("en-US")
              }
            />
            <Legend
              align="right"
              verticalAlign="top"
              wrapperStyle={{ paddingTop: "20px", paddingBottom: "20px" }}
              formatter={(value) => <span className="text-black font-medium m-2">{value}</span>}
            />
            <Bar dataKey="حاضر" fill="#FAE27C" legendType="circle" name="حاضر" />
            <Bar dataKey="غائب" fill="#C3EBFA" legendType="circle" name="غائب" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
