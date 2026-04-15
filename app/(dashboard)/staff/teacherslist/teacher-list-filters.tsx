"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TeacherListFiltersProps = {
  initialQuery: string;
  initialDate: string;
  initialMonth: string;
};

export function TeacherListFilters({ initialQuery, initialDate, initialMonth }: TeacherListFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const [date, setDate] = useState(initialDate);
  const [month, setMonth] = useState(initialMonth);

  const baseParams = useMemo(() => {
    const sp = new URLSearchParams();
    if (query.trim()) sp.set("q", query.trim());
    if (date.trim()) sp.set("date", date.trim());
    if (month.trim()) sp.set("month", month.trim());
    return sp;
  }, [query, date, month]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const qs = baseParams.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 300);
    return () => clearTimeout(timer);
  }, [baseParams, pathname, router]);

  return (
    <section className="bg-white rounded-3xl shadow-lg border p-6 space-y-5">
      <h2 className="text-lg font-semibold text-gray-800 border-b pb-2">تصفية المعلمين</h2>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="q">بحث</Label>
          <Input
            id="q"
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="اسم، هاتف، أو مادة"
            className="rounded-xl focus-visible:ring-2 focus-visible:ring-yellow-400"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="month">شهر نسبة الحضور</Label>
          <Input
            id="month"
            name="month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-xl focus-visible:ring-2 focus-visible:ring-yellow-400"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">تاريخ الحضور اليومي</Label>
          <Input
            id="date"
            name="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl focus-visible:ring-2 focus-visible:ring-yellow-400"
          />
        </div>
      </div>
    </section>
  );
}
