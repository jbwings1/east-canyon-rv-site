import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  corsHeaders,
  json,
  impliedAdminTask,
  filterAssignableJobs,
  isMemberStatus,
  isBlockedStatus,
  isStaffRow,
  hasMemberId,
  normalizeUsername,
  usernameError,
  syncAuthBan,
  sendMemberWelcomeEmail,
  isTopAdminProfile,
  isAdminCode,
  isTopAdminCode,
  staffRecordDenial,
  staffCanUseJobs,
  asTasks,
} from "./shared.ts";

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
    .select(
      "id,is_admin,account_kind,account_status,staff_status,admin_level,admin_tasks,staff_code,must_change_password",
    )
    .eq("id", caller.id)
    .maybeSingle();

  if (profileError || !callerProfile) {
    return json(403, { error: "Admin profile not found" });
  }
  if (callerProfile.is_admin !== true || !staffCanUseJobs(callerProfile)) {
    if (callerProfile.must_change_password === true) {
      return json(403, {
        error: "Change your temporary password before using admin tasks.",
      });
    }
    return json(403, { error: "Admin access required" });
  }
  const { data: sessionIsAdmin, error: sessionRoleError } = await callerClient
    .rpc("is_admin");
  if (sessionRoleError || sessionIsAdmin !== true) {
    return json(403, { error: "Admin access required" });
  }

  const callerIsTop = isTopAdminProfile(callerProfile);
  const callerTasks: string[] = Array.isArray(callerProfile.admin_tasks)
    ? callerProfile.admin_tasks
    : [];
  const can = (task: string) =>
    impliedAdminTask(
      task,
      callerProfile.admin_level,
      callerTasks,
      callerProfile.staff_code,
    );

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const kind = String(body.kind || "member");
  if (
    kind !== "member" &&
    kind !== "admin" &&
    kind !== "reset_password" &&
    kind !== "update_member" &&
    kind !== "delete_member" &&
    kind !== "update_staff" &&
    kind !== "delete_staff"
  ) {
    return json(400, {
      error:
        "kind must be member, admin, reset_password, update_member, delete_member, update_staff, or delete_staff",
    });
  }

  if (
    (kind === "member" ||
      kind === "update_member" ||
      kind === "delete_member") &&
    !can("member_accounts")
  ) {
    return json(403, { error: "You are not assigned this function." });
  }
  if (kind === "admin" && !can("create_staff")) {
    return json(403, { error: "You are not assigned this function." });
  }
  if (kind === "reset_password" && !can("member_password")) {
    return json(403, { error: "You are not assigned this function." });
  }

  if (kind === "reset_password") {
    const userId = String(body.user_id || "").trim();
    const password = String(body.temporary_password || body.password || "");
    if (!userId) {
      return json(400, { error: "Member is required" });
    }
    if (password.length < 8) {
      return json(400, {
        error: "Temporary password must be at least 8 characters",
      });
    }

    const { data: memberProfile, error: memberError } = await adminClient
      .from("profiles")
      .select("id,email,account_kind,account_status,member_id")
      .eq("id", userId)
      .maybeSingle();
    if (memberError || !memberProfile) {
      return json(404, { error: "Member not found" });
    }
    if (!hasMemberId(memberProfile)) {
      return json(400, { error: "Password reset here is for members only" });
    }

    const { error: passwordError } = await adminClient.auth.admin.updateUserById(
      userId,
      { password },
    );
    if (passwordError) {
      return json(400, { error: passwordError.message });
    }

    const { error: profileError2 } = await adminClient
      .from("profiles")
      .update({
        must_change_password: true,
        account_status:
          memberProfile.account_status === "closed"
            ? "closed"
            : "pending_activation",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (profileError2) {
      return json(500, { error: profileError2.message });
    }

    return json(200, {
      ok: true,
      kind: "reset_password",
      user_id: userId,
      email: memberProfile.email,
      message: "Temporary password set. Member must change it after sign-in.",
    });
  }

  if (kind === "update_member") {
    const userId = String(body.user_id || "").trim();
    if (!userId) {
      return json(400, { error: "Member is required" });
    }

    const { data: member, error: memberError } = await adminClient
      .from("profiles")
      .select(
        "id,email,username,member_id,full_name,phone,address,city,state,zip,account_kind,account_status,staff_status,is_admin,staff_code,admin_level",
      )
      .eq("id", userId)
      .maybeSingle();
    if (memberError || !member) {
      return json(404, { error: "Member not found" });
    }
    if (!hasMemberId(member)) {
      return json(400, { error: "Only member accounts can be edited here" });
    }

    const memberId = String(body.member_id ?? member.member_id ?? "").trim();
    const fullName = String(body.full_name ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const address = String(body.address ?? "").trim();
    const city = String(body.city ?? "").trim();
    const state = String(body.state ?? "").trim();
    const zip = String(body.zip ?? "").trim();
    const email = String(body.email ?? member.email ?? "")
      .trim()
      .toLowerCase();
    const accountStatus = String(
      body.account_status ?? member.account_status ?? "active",
    ).trim();
    const statusScope = String(body.status_scope || "member").trim();
    const username = Object.prototype.hasOwnProperty.call(body, "username")
      ? normalizeUsername(body.username)
      : normalizeUsername(member.username);

    if (!memberId) {
      return json(400, { error: "Member ID is required" });
    }
    if (!fullName) {
      return json(400, { error: "Full name is required" });
    }
    if (!email || !email.includes("@")) {
      return json(400, { error: "A valid email is required" });
    }
    if (!isMemberStatus(accountStatus)) {
      return json(400, { error: "Account status is not valid" });
    }
    if (username) {
      const uerr = usernameError(username);
      if (uerr) return json(400, { error: uerr });
    }

    const { data: others, error: othersError } = await adminClient
      .from("profiles")
      .select("id,username,email,member_id")
      .neq("id", userId);
    if (othersError) {
      return json(500, { error: othersError.message });
    }
    const otherRows = others || [];
    const sameText = (value: unknown, expected: string) =>
      String(value || "").trim().toLowerCase() === expected;

    if (otherRows.some((row) => String(row.member_id || "").trim() === memberId)) {
      return json(409, { error: "That member ID is already in use" });
    }
    if (
      username &&
      otherRows.some(
        (row) => sameText(row.username, username) || sameText(row.email, username),
      )
    ) {
      return json(409, { error: "That username is already taken" });
    }

    const currentEmail = String(member.email || "").trim().toLowerCase();
    if (email !== currentEmail) {
      if (otherRows.some((row) => sameText(row.email, email))) {
        return json(409, { error: "That email is already in use" });
      }
      const { error: authEmailError } = await adminClient.auth.admin
        .updateUserById(userId, {
          email,
          email_confirm: true,
        });
      if (authEmailError) {
        return json(400, { error: authEmailError.message });
      }
    }

    const dual = isStaffRow(member) && hasMemberId(member);
    const blockedRequest = isBlockedStatus(accountStatus);
    if (dual && blockedRequest && !["staff", "member", "both"].includes(statusScope)) {
      return json(400, { error: "Choose Staff, Member, or Both." });
    }
    const touchStaff = dual
      ? blockedRequest && (statusScope === "staff" || statusScope === "both")
      : false;
    const touchMember = !dual || !blockedRequest || statusScope === "member" ||
      statusScope === "both";
    if (touchStaff && isTopAdminProfile(member)) {
      return json(400, { error: "Nobody can delete or close admin 001." });
    }
    if (touchStaff && blockedRequest && !can("close_staff")) {
      return json(403, { error: "You are not assigned this function." });
    }
    const nextMemberStatus = touchMember
      ? accountStatus
      : String(member.account_status || "active");
    const nextStaffStatus = touchStaff
      ? accountStatus
      : member.staff_status;

    const { error: updateError } = await adminClient
      .from("profiles")
      .update({
        member_id: memberId,
        full_name: fullName,
        phone,
        address,
        city,
        state,
        zip,
        email,
        username,
        account_status: nextMemberStatus,
        staff_status: isStaffRow(member) ? nextStaffStatus : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (updateError) {
      return json(500, { error: updateError.message });
    }

    await syncAuthBan(adminClient, userId);

    return json(200, {
      ok: true,
      kind: "update_member",
      user_id: userId,
      email,
      member_id: memberId,
      username,
      account_status: nextMemberStatus,
      staff_status: isStaffRow(member) ? nextStaffStatus : null,
      message: "Member record updated.",
    });
  }

  if (kind === "delete_member") {
    const userId = String(body.user_id || "").trim();
    if (!userId) {
      return json(400, { error: "Member is required" });
    }
    if (userId === caller.id) {
      return json(403, {
        error: "You cannot delete your own account from this page",
      });
    }

    const { data: member, error: memberError } = await adminClient
      .from("profiles")
      .select(
        "id,email,full_name,member_id,account_kind,account_status,is_admin,staff_code",
      )
      .eq("id", userId)
      .maybeSingle();
    if (memberError || !member) {
      return json(404, { error: "Member not found" });
    }
    if (!hasMemberId(member)) {
      return json(400, { error: "Only member accounts can be removed here" });
    }

    if (isStaffRow(member)) {
      const { error: stripError } = await adminClient
        .from("profiles")
        .update({
          member_id: null,
          username: null,
          reservation_type: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (stripError) {
        return json(500, { error: stripError.message });
      }
      await syncAuthBan(adminClient, userId);
      return json(200, {
        ok: true,
        kind: "delete_member",
        action: "removed",
        user_id: userId,
        email: member.email,
        member_id: member.member_id,
        message:
          "Membership removed. Staff access and the same Auth login stay. Reservation history stays visible to admins.",
      });
    }

    const { count, error: countError } = await adminClient
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (countError) {
      return json(500, { error: countError.message });
    }
    const bookingCount = count || 0;

    if (bookingCount > 0) {
      const { error: closeError } = await adminClient
        .from("profiles")
        .update({
          account_status: "closed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (closeError) {
        return json(500, { error: closeError.message });
      }
      await syncAuthBan(adminClient, userId);
      return json(200, {
        ok: true,
        kind: "delete_member",
        action: "closed",
        user_id: userId,
        email: member.email,
        member_id: member.member_id,
        booking_count: bookingCount,
        message:
          "Membership closed. The member cannot sign in. Reservation history stays visible to admins.",
      });
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(
      userId,
    );
    if (deleteError) {
      const { error: closeError } = await adminClient
        .from("profiles")
        .update({
          account_status: "closed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (closeError) {
        return json(400, { error: deleteError.message });
      }
      await syncAuthBan(adminClient, userId);
      return json(200, {
        ok: true,
        kind: "delete_member",
        action: "closed",
        user_id: userId,
        email: member.email,
        member_id: member.member_id,
        booking_count: 0,
        message:
          "Could not permanently delete the Auth user; membership was closed instead.",
      });
    }

    return json(200, {
      ok: true,
      kind: "delete_member",
      action: "deleted",
      user_id: userId,
      email: member.email,
      member_id: member.member_id,
      booking_count: 0,
      message: "Unused member account permanently deleted.",
    });
  }

  if (kind === "update_staff") {
    if (!can("edit_staff")) {
      return json(403, { error: "You are not assigned this function." });
    }
    const userId = String(body.user_id || "").trim();
    if (!userId) {
      return json(400, { error: "Staff is required" });
    }

    const { data: staff, error: staffError } = await adminClient
      .from("profiles")
      .select(
        "id,email,full_name,phone,staff_code,admin_level,admin_seat,admin_tasks,account_kind,account_status,staff_status,is_admin,member_id,must_change_password",
      )
      .eq("id", userId)
      .maybeSingle();
    if (staffError || !staff) {
      return json(404, { error: "Staff not found" });
    }
    if (!isStaffRow(staff)) {
      return json(400, { error: "Only staff accounts can be edited here" });
    }

    const fullName = String(body.full_name ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const staffCode = String(staff.staff_code || "").trim();
    const email = String(body.email ?? staff.email ?? "")
      .trim()
      .toLowerCase();
    const accountStatus = String(
      body.account_status ?? staff.staff_status ?? staff.account_status ?? "active",
    ).trim();
    const statusScope = String(body.status_scope || "staff").trim();
    const temporaryPassword = String(body.temporary_password || "");

    if (!fullName) {
      return json(400, { error: "Full name is required" });
    }
    if (!staffCode) {
      return json(400, { error: "Staff code is required" });
    }
    if (!email || !email.includes("@")) {
      return json(400, { error: "A valid email is required" });
    }
    if (!isMemberStatus(accountStatus)) {
      return json(400, { error: "Account status is not valid" });
    }
    if (temporaryPassword && temporaryPassword.length < 8) {
      return json(400, { error: "Temporary password must be at least 8 characters" });
    }

    const dual = isStaffRow(staff) && hasMemberId(staff);
    const blockedRequest = isBlockedStatus(accountStatus);
    if (dual && blockedRequest && !["staff", "member", "both"].includes(statusScope)) {
      return json(400, { error: "Choose Staff, Member, or Both." });
    }
    const touchStaff = !dual || !blockedRequest || statusScope === "staff" ||
      statusScope === "both";
    const touchMember = dual && blockedRequest &&
      (statusScope === "member" || statusScope === "both");
    if (touchStaff && blockedRequest && !can("close_staff")) {
      return json(403, { error: "You are not assigned this function." });
    }
    if (touchMember && blockedRequest && !can("member_accounts")) {
      return json(403, { error: "You are not assigned this function." });
    }

    const requestedTasks = asTasks(body.admin_tasks);
    if (requestedTasks.includes("admin") && !callerIsTop) {
      return json(403, { error: "You cannot assign Admin." });
    }
    if (
      requestedTasks.includes("site_manager") &&
      !callerIsTop &&
      !isAdminCode(callerProfile.staff_code)
    ) {
      return json(403, { error: "You cannot assign Site manager." });
    }
    let tasks = filterAssignableJobs(
      body.admin_tasks,
      callerProfile.admin_level,
      callerTasks,
      callerProfile.staff_code,
    );
    if (isTopAdminCode(staffCode) || Number(staff.admin_level) === 1) {
      tasks = tasks.filter((task) => task !== "admin");
    } else if (isAdminCode(staffCode) && !tasks.includes("admin")) {
      tasks = [...tasks, "admin"];
    }
    if (!tasks.length) {
      return json(400, { error: "Assign at least one job or function" });
    }

    const previousStaffStatus = String(staff.staff_status || staff.account_status || "active");
    const nextStaffStatus = touchStaff ? accountStatus : previousStaffStatus;
    const nextMemberStatus = touchMember
      ? accountStatus
      : String(staff.account_status || "active");
    const closingStaff = touchStaff && blockedRequest &&
      nextStaffStatus !== previousStaffStatus;
    const denial = staffRecordDenial({
      caller: callerProfile,
      target: staff,
      nextTasks: tasks,
      closingStaff,
    });
    if (denial) return json(403, { error: denial });

    const { data: others, error: othersError } = await adminClient
      .from("profiles")
      .select("id,email,staff_code")
      .neq("id", userId);
    if (othersError) {
      return json(500, { error: othersError.message });
    }
    const otherRows = others || [];
    const sameText = (value: unknown, expected: string) =>
      String(value || "").trim().toLowerCase() === expected;

    const currentEmail = String(staff.email || "").trim().toLowerCase();
    if (email !== currentEmail) {
      if (otherRows.some((row) => sameText(row.email, email))) {
        return json(409, { error: "That email is already in use" });
      }
      const { error: authEmailError } = await adminClient.auth.admin
        .updateUserById(userId, {
          email,
          email_confirm: true,
        });
      if (authEmailError) {
        return json(400, { error: authEmailError.message });
      }
    }

    if (temporaryPassword) {
      const { error: passwordError } = await adminClient.auth.admin.updateUserById(
        userId,
        { password: temporaryPassword },
      );
      if (passwordError) {
        return json(400, { error: passwordError.message });
      }
    }

    const storedLevel = isTopAdminCode(staffCode)
      ? 1
      : staff.admin_level ?? null;
    const { error: updateError } = await adminClient
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        email,
        staff_code: staffCode,
        admin_level: storedLevel,
        admin_seat: null,
        admin_tasks: tasks,
        staff_status: nextStaffStatus,
        account_status: dual ? nextMemberStatus : nextStaffStatus,
        must_change_password: temporaryPassword
          ? true
          : staff.must_change_password === true,
        is_admin: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (updateError) {
      return json(500, { error: updateError.message });
    }

    await syncAuthBan(adminClient, userId);

    return json(200, {
      ok: true,
      kind: "update_staff",
      user_id: userId,
      email,
      staff_code: staffCode,
      admin_level: storedLevel,
      admin_seat: null,
      admin_tasks: tasks,
      account_status: dual ? nextMemberStatus : nextStaffStatus,
      staff_status: nextStaffStatus,
      message: "Staff record updated.",
    });
  }

  if (kind === "delete_staff") {
    const userId = String(body.user_id || "").trim();
    if (!userId) {
      return json(400, { error: "Staff is required" });
    }
    if (userId === caller.id) {
      return json(403, {
        error: "You cannot delete your own account from this page",
      });
    }

    const { data: staff, error: staffError } = await adminClient
      .from("profiles")
      .select(
        "id,email,full_name,staff_code,admin_level,account_kind,account_status,is_admin,member_id",
      )
      .eq("id", userId)
      .maybeSingle();
    if (staffError || !staff) {
      return json(404, { error: "Staff not found" });
    }
    if (!isStaffRow(staff)) {
      return json(400, { error: "Only staff accounts can be removed here" });
    }

    const denial = staffRecordDenial({
      caller: callerProfile,
      target: staff,
      deleting: true,
    });
    if (denial) return json(403, { error: denial });

    const hasMembership = hasMemberId(staff);

    if (hasMembership && !can("remove_staff_access")) {
      return json(403, { error: "You are not assigned this function." });
    }
    if (!hasMembership && !can("close_staff")) {
      return json(403, { error: "You are not assigned this function." });
    }

    if (hasMembership) {
      const { error: stripError } = await adminClient
        .from("profiles")
        .update({
          is_admin: false,
          staff_code: null,
          admin_level: null,
          admin_seat: null,
          admin_tasks: [],
          staff_status: null,
          account_kind: "member",
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (stripError) {
        return json(500, { error: stripError.message });
      }
      await syncAuthBan(adminClient, userId);
      return json(200, {
        ok: true,
        kind: "delete_staff",
        action: "removed",
        user_id: userId,
        email: staff.email,
        staff_code: staff.staff_code,
        message:
          "Staff access removed. Membership, member login, and reservations stay.",
      });
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(
      userId,
    );
    if (deleteError) {
      return json(400, {
        error:
          deleteError.message ||
          "Could not delete the staff Auth account. The staff record was not kept as closed.",
      });
    }

    return json(200, {
      ok: true,
      kind: "delete_staff",
      action: "deleted",
      user_id: userId,
      email: staff.email,
      staff_code: staff.staff_code,
      message: "Staff account permanently deleted.",
    });
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

  const { data: existingEmail } = await adminClient
    .from("profiles")
    .select("id,member_id,staff_code,is_admin")
    .eq("email", email)
    .maybeSingle();
  if (existingEmail) {
    return json(409, {
      error:
        "An account with this email already exists. Do not create a second login. Open that record and use Add staff access or Add membership.",
    });
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
        // Contact fields only — never put is_admin / member_id / account_status
        // in user_metadata (user-editable). Privileges are set via service-role upsert.
        user_metadata: {
          full_name: fullName,
          phone,
          address,
          city,
          state,
          zip,
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

    const emailResult = await sendMemberWelcomeEmail({
      to: email,
      fullName,
      memberId,
      temporaryPassword: password,
    });

    return json(200, {
      ok: true,
      kind: "member",
      user_id: created.user.id,
      email,
      member_id: memberId,
      temporary_password: password,
      email_sent: emailResult.sent,
      email_error: emailResult.error || null,
      message: emailResult.sent
        ? "Member access created. A welcome email with sign-in information was sent."
        : `Member access created, but the welcome email was not sent${
            emailResult.error ? `: ${emailResult.error}` : "."
          } Give them the member ID, email, and temporary password.`,
    });
  }

  const requestedTasks = asTasks(body.admin_tasks);
  if (requestedTasks.includes("admin") && !callerIsTop) {
    return json(403, { error: "You cannot assign Admin." });
  }
  if (
    requestedTasks.includes("site_manager") &&
    !callerIsTop &&
    !isAdminCode(callerProfile.staff_code)
  ) {
    return json(403, { error: "You cannot assign Site manager." });
  }
  const tasks = filterAssignableJobs(
    body.admin_tasks,
    callerProfile.admin_level,
    callerTasks,
    callerProfile.staff_code,
  );
  if (!tasks.length) {
    return json(400, { error: "Assign at least one job or function" });
  }
  if (!fullName) {
    return json(400, { error: "Full name is required" });
  }

  const { data: reservedCode, error: codeError } = await adminClient.rpc(
    "reserve_staff_code",
    { p_tasks: tasks },
  );
  if (codeError || !reservedCode) {
    return json(500, {
      error: codeError?.message || "Could not assign a staff code",
    });
  }
  const staffCode = String(reservedCode);
  const adminLevel = isTopAdminCode(staffCode) ? 1 : null;

  const { data: createdAdmin, error: createAdminError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // Contact fields only — staff privileges come from the service-role upsert below.
      user_metadata: {
        full_name: fullName,
        phone,
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
    staff_status: "active",
    must_change_password: true,
    is_admin: true,
    admin_level: adminLevel,
    admin_seat: null,
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
    admin_seat: null,
    staff_code: staffCode,
    admin_tasks: tasks,
    temporary_password: password,
    message: "Admin staff account created.",
  });
});
