import { NextResponse } from "next/server";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { buildWorkbookBuffer } from "@/lib/excel/export-workbook";
import { createClient } from "@/lib/supabase/server";

type ManualRevenueRow = {
  id: string;
  title: string;
  amount: number | string;
  revenue_date: string;
  created_at: string;
};

type TuitionPaymentRow = {
  id: string;
  amount: number | string;
  paid_at: string;
  installment_id: string | null;
  students: { full_name: string } | { full_name: string }[] | null;
};

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "يجب تسجيل الدخول أولًا." }, { status: 401 });
  }

  const schoolId = await resolveSchoolId(supabase, user.id, user.email);
  if (!schoolId) {
    return NextResponse.json({ message: "لم يتم العثور على مدرسة مرتبطة بحسابك." }, { status: 400 });
  }

  const [manualRes, tuitionRes] = await Promise.all([
    supabase
      .from("revenues")
      .select("id,title,amount,revenue_date,created_at")
      .eq("school_id", schoolId)
      .order("revenue_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("id,amount,paid_at,installment_id,students!payments_student_school_fk(full_name)")
      .eq("school_id", schoolId)
      .order("paid_at", { ascending: false }),
  ]);

  if (manualRes.error) {
    return NextResponse.json({ message: manualRes.error.message ?? "فشل جلب الإيرادات." }, { status: 500 });
  }
  if (tuitionRes.error) {
    return NextResponse.json({ message: tuitionRes.error.message ?? "فشل جلب دفعات الطلاب." }, { status: 500 });
  }

  const manualRows = ((manualRes.data ?? []) as ManualRevenueRow[]).map((r) => [
    "إيراد يدوي",
    r.title,
    toNumber(r.amount),
    r.revenue_date?.slice(0, 10) ?? "",
    r.created_at,
  ]);

  const tuitionRows = ((tuitionRes.data ?? []) as TuitionPaymentRow[]).map((r) => {
    const s = Array.isArray(r.students) ? r.students[0] : r.students;
    const studentName = s?.full_name ?? "طالب";
    const title = r.installment_id ? `دفعة قسط — ${studentName}` : `دفعة — ${studentName}`;
    return ["دفعة طالب", title, toNumber(r.amount), r.paid_at?.slice(0, 10) ?? "", r.paid_at ?? ""];
  });

  const workbook = buildWorkbookBuffer([
    {
      name: "revenues",
      header: ["المصدر", "العنوان", "المبلغ", "التاريخ", "وقت الإنشاء"],
      rows: [...manualRows, ...tuitionRows],
    },
  ]);

  const dateTag = new Date().toISOString().slice(0, 10);
  const bytes = new Uint8Array(workbook);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="revenues-export-${dateTag}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
