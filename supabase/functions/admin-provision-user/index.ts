import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALL_TASKS = [
  "members",
  "passwords",
  "reservations_view",
  "reservations_manage",
  "website",
  "staff",
] as const;

type Task = (typeof ALL_TASKS)[number];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asTasks(value: unknown): Task[] {
  if (!Array.isArray(value)) return [];
  return value.filter((t): t is Task => ALL_TASKS.includes(t as Task));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(500, { error: "Server configuration error" });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { error: "Missing authorization" });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceKey);

  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser();
  if (callerError || !caller) {
    return json(401, { error: "Not signed in" });
  }

  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("id,is_admin,account_kind,account_status,admin_level,admin_tasks")
    .eq("id", caller.id)
    .maybeSingle();

  if (profileError || !callerProfile) {
    return json(403, { error: "Admin profile not found" });
  }
  if (
    !callerProfile.is_admin ||
    callerProfile.account_kind !== "admin" ||
    callerProfile.account_status !== "active"
  ) {
    return json(403, { error: "Admin access required" });
  }

  const isLevel1 = callerProfile.admin_level === 1;
  const callerTasks: string[] = Array.isArray(callerProfile.admin_tasks)
    ? callerProfile.admin_tasks
    : [];
  const can = (task: Task) => isLevel1 || callerTasks.includes(task);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const kind = String(body.kind || "member");
  if (kind !== "member" && kind !== "admin") {
    return json(400, { error: "kind must be member or admin" });
  }

  if (kind === "member" && !can("members")) {
    return json(403, { error: "You are not assigned the Members task" });
  }
  if (kind === "admin" && !can("staff")) {
    return json(403, { error: "You are not assigned the Staff task" });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.temporary_password || body.password || "");
  const fullName = String(body.full_name || "").trim();
  const phone = String(body.phone || "").trim();
  const address = String(body.address || "").trim();
  const city = String(body.city || "").trim();
  const state = String(body.state || "").trim();
  const zip = String(body.zip || "").trim();

  if (!email || !password) {
    return json(400, { error: "Email and temporary password are required" });
  }
  if (password.length < 8) {
    return json(400, { error: "Temporary password must be at least 8 characters" });
  }

  if (kind === "member") {
    const memberId = String(body.member_id || "").trim();
    if (!memberId) {
      return json(400, { error: "Member ID is required" });
    }
    if (!fullName || !phone || !address) {
      return json(400, {
        error: "Full name, phone, and address are required for members",
      });
    }

    const { data: existingMember } = await adminClient
      .from("profiles")
      .select("id")
      .eq("member_id", memberId)
      .maybeSingle();
    if (existingMember) {
      return json(409, { error: "That member ID is already in use" });
    }

    const { data: created, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone,
          address,
          city,
          state,
          zip,
          member_id: memberId,
          account_kind: "member",
          account_status: "pending_activation",
          must_change_password: true,
          is_admin: false,
        },
      });

    if (createError || !created.user) {
      return json(400, {
        error: createError?.message || "Could not create member account",
      });
    }

    const { error: upsertError } = await adminClient.from("profiles").upsert({
      id: created.user.id,
      email,
      full_name: fullName,
      phone,
      address,
      city,
      state,
      zip,
      member_id: memberId,
      account_kind: "member",
      account_status: "pending_activation",
      must_change_password: true,
      is_admin: false,
      admin_level: null,
      admin_seat: null,
      staff_code: null,
      admin_tasks: [],
      updated_at: new Date().toISOString(),
    });

    if (upsertError) {
      return json(500, { error: upsertError.message });
    }

    return json(200, {
      ok: true,
      kind: "member",
      user_id: created.user.id,
      email,
      member_id: memberId,
      temporary_password: password,
      message:
        "Member access created. Give the member their ID, email, and temporary password to activate on the website.",
    });
  }

  const adminLevel = Number(body.admin_level || 0);
  if (!Number.isInteger(adminLevel) || adminLevel < 2) {
    return json(400, {
      error: "New staff must be level 2 or lower (level 1 is reserved)",
    });
  }
  if (!isLevel1 && adminLevel <= Number(callerProfile.admin_level || 99)) {
    return json(403, {
      error: "You can only create staff below your level",
    });
  }

  const adminSeat = String(body.admin_seat || "").trim().toLowerCase();
  const staffCode = String(body.staff_code || "").trim();
  let tasks = asTasks(body.admin_tasks);
  if (!isLevel1) {
    tasks = tasks.filter((t) => callerTasks.includes(t) && t !== "staff");
  } else {
    tasks = tasks.filter((t) => t !== "staff" || adminLevel === 1);
  }
  if (!tasks.length) {
    return json(400, { error: "Assign at least one task" });
  }
  if (!staffCode) {
    return json(400, { error: "Staff code is required" });
  }
  if (!fullName) {
    return json(400, { error: "Full name is required" });
  }

  const { data: createdAdmin, error: createAdminError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone,
        account_kind: "admin",
        account_status: "active",
        must_change_password: true,
        is_admin: true,
        admin_level: String(adminLevel),
        admin_seat: adminSeat,
        staff_code: staffCode,
        admin_tasks: tasks,
      },
    });

  if (createAdminError || !createdAdmin.user) {
    return json(400, {
      error: createAdminError?.message || "Could not create admin account",
    });
  }

  const { error: upsertAdminError } = await adminClient.from("profiles").upsert({
    id: createdAdmin.user.id,
    email,
    full_name: fullName,
    phone,
    account_kind: "admin",
    account_status: "active",
    must_change_password: true,
    is_admin: true,
    admin_level: adminLevel,
    admin_seat: adminSeat || null,
    staff_code: staffCode,
    admin_tasks: tasks,
    updated_at: new Date().toISOString(),
  });

  if (upsertAdminError) {
    return json(500, { error: upsertAdminError.message });
  }

  return json(200, {
    ok: true,
    kind: "admin",
    user_id: createdAdmin.user.id,
    email,
    admin_level: adminLevel,
    admin_seat: adminSeat || null,
    staff_code: staffCode,
    admin_tasks: tasks,
    temporary_password: password,
    message: "Admin staff account created.",
  });
});
