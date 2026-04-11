import {
  BookOpen,
  LayoutDashboard,
  List,
  LucideIcon,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";

const staffMenuItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/staff", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/staff/class", label: "الصفوف", icon: BookOpen },
  { href: "/staff/students", label: "اضافة طالب", icon: UserPlus },
  { href: "/staff/studentlist", label: "قائمة الطلاب", icon: List },
  { href: "/staff/student-installments", label: "أقساط ودفعات الطلاب", icon: Wallet },
  { href: "/staff/addteachers", label: "إضافة معلم", icon: UserPlus },
  { href: "/staff/teacherslist", label: "قائمة المعلمين", icon: Users },
  { href: "/staff/teacher-installments", label: "رواتب وأقساط المعلمين", icon: PiggyBank },
  { href: "/staff/expenses", label: "المصاريف", icon: TrendingDown },
  { href: "/staff/revenues", label: "الإيرادات", icon: TrendingUp },
];

type StaffMenuProps = {
  roleLabel: string;
};

export function StaffMenu({ roleLabel }: StaffMenuProps) {
  return (
    <div className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto min-h-0" dir="rtl">
      <div className="mb-2 p-3 bg-Yellow rounded-lg flex-shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center gap-1 lg:gap-2">
          <span className="text-xs text-gray-600">الدور الحالي:</span>
          <span className="text-xs font-medium text-gray-800">{roleLabel}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="hidden lg:block text-gray-700 font-medium text-xs px-3 py-2 bg-sky rounded-lg">
          القائمة الرئيسية
        </span>
        {staffMenuItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-center lg:justify-start gap-3 text-gray-700 hover:bg-sky rounded-lg py-2 px-2 lg:px-3 transition-all duration-200 group"
            >
              <div className="p-1.5 rounded-lg bg-gray-50 group-hover:bg-sky transition-colors duration-200">
                <Icon
                  className="size-4 opacity-70 group-hover:opacity-100 transition-opacity duration-200"
                  aria-hidden
                />
              </div>
              <span className="hidden lg:block font-medium text-sm leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
