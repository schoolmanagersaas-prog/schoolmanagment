"use client";

import type { StaffFinanceMonthRow } from "@/actions/staff-dashboard";
import moreDarkIcon from "@/app/images/moreDark.png";
import Image from "next/image";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type FinanceChartProps = {
  months: StaffFinanceMonthRow[];
  totalRevenue: number;
  totalExpenses: number;
  year: number;
};

export default function FinanceChart({ months, totalRevenue, totalExpenses, year }: FinanceChartProps) {
  const data = months.length > 0 ? months : [];

  return (
    <div className="bg-white rounded-xl w-full h-full p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 mb-1">المالية</h1>
          <p className="text-sm text-gray-500">
            إحصائيات الإيرادات والمصروفات الشهرية — {year}
          </p>
        </div>
        <div className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors duration-200 cursor-pointer">
          <Image src={moreDarkIcon} alt="المزيد من الخيارات" width={20} height={20} />
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={data}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 20,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="name"
              axisLine={false}
              tick={{ fill: "#6b7280", fontSize: 12 }}
              tickLine={false}
              tickMargin={10}
            />
            <YAxis
              axisLine={false}
              tick={{ fill: "#6b7280", fontSize: 12 }}
              tickLine={false}
              tickMargin={20}
              tickFormatter={(v) => Number(v).toLocaleString("en-US")}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              }}
              formatter={(value) =>
                typeof value === "number"
                  ? value.toLocaleString("en-US")
                  : Number(value).toLocaleString("en-US")
              }
            />
            <Legend
              align="center"
              verticalAlign="top"
              wrapperStyle={{ paddingTop: "20px", paddingBottom: "20px" }}
              formatter={(value) => (
                <span className="text-black font-medium">
                  {value === "الايرادات" ? "الإيرادات" : value === "المصروفات" ? "المصروفات" : String(value)}
                </span>
              )}
            />
            <Line
              type="monotone"
              dataKey="الايرادات"
              stroke="#C3EBFA"
              strokeWidth={3}
              dot={{ fill: "#C3EBFA", strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: "#C3EBFA", strokeWidth: 2 }}
              name="الايرادات"
            />
            <Line
              type="monotone"
              dataKey="المصروفات"
              stroke="#FAE27C"
              strokeWidth={3}
              dot={{ fill: "#FAE27C", strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: "#FAE27C", strokeWidth: 2 }}
              name="المصروفات"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 pt-4 border-t border-gray-100">
        <div className="grid grid-cols-2 gap-6">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-3 h-3 bg-sky rounded-full" />
              <span className="text-sm font-medium text-gray-600">إجمالي الإيرادات</span>
            </div>
            <h3 className="text-2xl font-bold text-sky tabular-nums">
              {totalRevenue.toLocaleString("en-US")}
            </h3>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-3 h-3 bg-Yellow rounded-full" />
              <span className="text-sm font-medium text-gray-600">إجمالي المصروفات</span>
            </div>
            <h3 className="text-2xl font-bold text-Yellow tabular-nums">
              {totalExpenses.toLocaleString("en-US")}
            </h3>
          </div>
        </div>
      </div>
    </div>
  );
}
