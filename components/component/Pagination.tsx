"use client"
import Image from "next/image";

const Pagination = () => {
    return (
       <div className="flex items-center justify-between text-gray-500 border-t border-white/10 px-4 py-3 sm:px-6">
        <button disabled className="py-2 px-4 rounded-md bg-slate-200 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed">السابق</button>
     <div className="flex items-center gap-2">
  {[1, 2, 3, 4, 5].map((num, index) => (
    <button
      key={num}
      disabled={index !== 0} // الزر الأول مفعل والباقي معطل
      className="py-2 px-4 rounded-md bg-sky text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {num}
    </button>
  ))}
</div>
        <button className="py-2 px-4 rounded-md bg-slate-200 text-xs font-semibold disabled:opacity-50 disabled-cursor-not-allowed">التالي</button>
      
       </div>
    );
};
export default Pagination;
