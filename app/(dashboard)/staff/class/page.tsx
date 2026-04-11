import { createClass, deleteClass, updateClass } from "@/actions/class";
import StaffClassManage from "@/components/staff/staff-class-manage";
import { resolveSchoolId } from "@/lib/auth/resolve-school-id";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type ClassPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
  }>;
};

export default async function StaffClassPage({ searchParams }: ClassPageProps) {
  const params = (await searchParams) ?? {};
  const status = params.status;
  const message = params.message;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const schoolId = await resolveSchoolId(supabase, user.id, user.email);

  const [{ data: classes }, { data: studentRows }] = schoolId
    ? await Promise.all([
        supabase
          .from("classes")
          .select("id,name,stage")
          .eq("school_id", schoolId)
          .order("name", { ascending: true }),
        supabase
          .from("students")
          .select("id,full_name,class_id,status")
          .eq("school_id", schoolId),
      ])
    : [{ data: [] }, { data: [] }];

  const studentsByClassId: Record<string, { id: string; full_name: string; status: string | null }[]> = {};
  for (const row of studentRows ?? []) {
    const cid = row.class_id;
    if (!cid) continue;
    if (!studentsByClassId[cid]) studentsByClassId[cid] = [];
    studentsByClassId[cid].push({
      id: row.id,
      full_name: row.full_name,
      status: row.status,
    });
  }
  for (const k of Object.keys(studentsByClassId)) {
    studentsByClassId[k].sort((a, b) => a.full_name.localeCompare(b.full_name, "ar"));
  }

  async function createClassAction(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "");
    const stage = String(formData.get("stage") ?? "");

    const result = await createClass({
      name,
      stage,
      description: null,
    });

    if (!result.success) {
      redirect(`/staff/class?status=error&message=${encodeURIComponent(result.message)}`);
    }

    redirect(`/staff/class?status=success&message=${encodeURIComponent(result.message)}`);
  }

  async function updateClassAction(formData: FormData) {
    "use server";

    const id = String(formData.get("classId") ?? "");
    const name = String(formData.get("name") ?? "");
    const stage = String(formData.get("stage") ?? "");

    const result = await updateClass({ id, name, stage });

    if (!result.success) {
      redirect(`/staff/class?status=error&message=${encodeURIComponent(result.message)}`);
    }

    redirect(`/staff/class?status=success&message=${encodeURIComponent(result.message)}`);
  }

  async function deleteClassAction(formData: FormData) {
    "use server";

    const classId = String(formData.get("classId") ?? "");
    const result = await deleteClass(classId);

    if (!result.success) {
      redirect(`/staff/class?status=error&message=${encodeURIComponent(result.message)}`);
    }

    redirect(`/staff/class?status=success&message=${encodeURIComponent(result.message)}`);
  }

  return (
    <div className="p-4 flex flex-col gap-8" dir="rtl">
      <StaffClassManage
        classes={classes ?? []}
        studentsByClassId={studentsByClassId}
        hasSchool={!!schoolId}
        createClassAction={createClassAction}
        updateClassAction={updateClassAction}
        deleteClassAction={deleteClassAction}        status={status}
        message={message}
      />
    </div>
  );
}
