"use server";

import { revalidatePath } from "next/cache";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";

export type CreateClassInput = {
  name: string;
  stage?: string | null;
  description?: string | null;
};

export type CreateClassResult =
  | {
      success: true;
      classId: string;
      message: string;
    }
  | {
      success: false;
      message: string;
    };

/**
 * إنشاء صف جديد لمدرسة المستخدم الحالي (owner أو staff حسب الـ RLS على public.classes).
 */
export async function createClass(
  input: CreateClassInput,
): Promise<CreateClassResult> {
  const name = input.name?.trim();
  const stage =
    input.stage === undefined || input.stage === null
      ? null
      : input.stage.trim() || null;
  const description =
    input.description === undefined || input.description === null
      ? null
      : input.description.trim() || null;

  if (!name || name.length < 1) {
    return {
      success: false,
      message: "اسم الصف مطلوب.",
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      message: "يجب تسجيل الدخول لإنشاء صف.",
    };
  }

  const schoolId = await resolveSchoolId(supabase, user.id, user.email);

  if (!schoolId) {
    return {
      success: false,
      message: "لم يتم العثور على مدرسة مرتبطة بحسابك.",
    };
  }

  const { data: row, error: insertError } = await supabase
    .from("classes")
    .insert({
      school_id: schoolId,
      name,
      stage,
      description,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return {
        success: false,
        message: "يوجد بالفعل صف بهذا الاسم في مدرستك.",
      };
    }
    return {
      success: false,
      message: insertError.message ?? "فشل إنشاء الصف.",
    };
  }

  if (!row?.id) {
    return {
      success: false,
      message: "فشل إنشاء الصف.",
    };
  }

  revalidatePath("/staff/class");
  revalidatePath("/admin");

  return {
    success: true,
    classId: row.id,
    message: "تم إنشاء الصف بنجاح.",
  };
}
