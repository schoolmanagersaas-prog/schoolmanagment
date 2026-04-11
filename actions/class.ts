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

export type MutateClassResult =
  | { success: true; message: string }
  | { success: false; message: string };

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

/**
 * تحديث صف تملكه مدرسة المستخدم الحالي.
 */
export async function updateClass(input: {
  id: string;
  name: string;
  stage?: string | null;
}): Promise<MutateClassResult> {
  const id = input.id?.trim();
  const name = input.name?.trim();
  const stage =
    input.stage === undefined || input.stage === null
      ? null
      : String(input.stage).trim() || null;

  if (!id) {
    return { success: false, message: "معرّف الصف غير صالح." };
  }
  if (!name || name.length < 1) {
    return { success: false, message: "اسم الصف مطلوب." };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, message: "يجب تسجيل الدخول." };
  }

  const schoolId = await resolveSchoolId(supabase, user.id, user.email);
  if (!schoolId) {
    return { success: false, message: "لم يتم العثور على مدرسة مرتبطة بحسابك." };
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("classes")
    .select("id")
    .eq("id", id)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { success: false, message: "الصف غير موجود أو لا تملك صلاحية تعديله." };
  }

  const { error: updateError } = await supabase
    .from("classes")
    .update({ name, stage })
    .eq("id", id)
    .eq("school_id", schoolId);

  if (updateError) {
    if (updateError.code === "23505") {
      return { success: false, message: "يوجد بالفعل صف بهذا الاسم في مدرستك." };
    }
    return { success: false, message: updateError.message ?? "فشل تحديث الصف." };
  }

  revalidatePath("/staff/class");
  revalidatePath("/admin");

  return { success: true, message: "تم تحديث الصف بنجاح." };
}

/**
 * حذف صف تملكه مدرسة المستخدم الحالي (إن لم يكن مرتبطاً بطلاب).
 */
export async function deleteClass(classId: string): Promise<MutateClassResult> {
  const id = classId?.trim();
  if (!id) {
    return { success: false, message: "معرّف الصف غير صالح." };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, message: "يجب تسجيل الدخول." };
  }

  const schoolId = await resolveSchoolId(supabase, user.id, user.email);
  if (!schoolId) {
    return { success: false, message: "لم يتم العثور على مدرسة مرتبطة بحسابك." };
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("classes")
    .select("id")
    .eq("id", id)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { success: false, message: "الصف غير موجود أو لا تملك صلاحية حذفه." };
  }

  const { count, error: countError } = await supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .eq("class_id", id);

  if (countError) {
    return { success: false, message: countError.message ?? "تعذر التحقق من الطلاب." };
  }
  if ((count ?? 0) > 0) {
    return {
      success: false,
      message: "لا يمكن حذف الصف لوجود طلاب مرتبطين به. انقل الطلاب إلى صف آخر أولاً.",
    };
  }

  const { error: deleteError } = await supabase.from("classes").delete().eq("id", id).eq("school_id", schoolId);

  if (deleteError) {
    if (deleteError.code === "23503") {
      return {
        success: false,
        message: "لا يمكن حذف الصف لارتباطه ببيانات أخرى في النظام.",
      };
    }
    return { success: false, message: deleteError.message ?? "فشل حذف الصف." };
  }

  revalidatePath("/staff/class");
  revalidatePath("/admin");

  return { success: true, message: "تم حذف الصف بنجاح." };
}
