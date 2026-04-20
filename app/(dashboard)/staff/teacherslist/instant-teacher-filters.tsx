"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";

type InstantTeacherFiltersProps = {
  initialQuery: string;
  initialDate: string;
  initialMonth: string;
};

export function InstantTeacherFilters({ initialQuery, initialDate, initialMonth }: InstantTeacherFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const [date, setDate] = useState(initialDate);
  const [month, setMonth] = useState(initialMonth);

  const params = useMemo(() => {
    const sp = new URLSearchParams();
    if (query.trim()) sp.set("q", query.trim());
    if (date.trim()) sp.set("date", date.trim());
    if (month.trim()) sp.set("month", month.trim());
    return sp;
  }, [query, date, month]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 180);
    return () => clearTimeout(timer);
  }, [params, pathname, router]);

  return (
    <>
      <div className="relative w-full md:w-auto">
        <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث: اسم، هاتف، مادة، مؤهل"
          className="h-8 w-full md:w-64 rounded-md border border-input bg-background pr-9 pl-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
        />
      </div>
      <input
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
      />
    </>
  );
}
