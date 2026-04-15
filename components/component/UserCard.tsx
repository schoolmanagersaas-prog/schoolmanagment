import moreIcon from "@/app/images/more.png";
import Image from "next/image";

export type UserCardProps = {
  type: string;
  count: number;
  /** نص الشارة الصغيرة (مثل تاريخ التحديث) */
  badgeLabel?: string;
  /** بادئة للرقم المعروض (مثل $) */
  valuePrefix?: string;
};

function formatBadgeDate(): string {
  try {
    return new Intl.DateTimeFormat("ar-EG-u-ca-gregory", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      numberingSystem: "latn",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10).replaceAll("-", "/");
  }
}

export default function UserCard({ type, count, badgeLabel, valuePrefix }: UserCardProps) {
  const badge = badgeLabel ?? formatBadgeDate();

  return (
    <div className="cursor-pointer rounded-2xl odd:bg-sky even:bg-Yellow p-4 w-full sm:w-[250px] md:w-[220px] lg:w-[200px] flex-none transition-all duration-300 hover:scale-105 hover:shadow-lg">
      <div className="flex justify-between items-center">
        <span className="text-[10px] bg-white px-2 py-1 rounded-full text-green-600 transition-all duration-200 hover:scale-110">
          {badge}
        </span>
        <div className="p-2 transition-all duration-200 hover:scale-110 hover:rotate-12 cursor-pointer">
          <Image src={moreIcon} alt="المزيد من الخيارات" width={20} height={20} />
        </div>
      </div>
      <h1 className="text-2xl font-semibold my-4 transition-colors duration-300">
        {valuePrefix ?? ""}
        {count.toLocaleString("en-US")}
      </h1>
      <h2 className="capitalize text-sm font-medium text-gray-500 text-semibold transition-all duration-200 hover:text-purple-600 hover:translate-x-2">
        {type}
      </h2>
    </div>
  );
}
