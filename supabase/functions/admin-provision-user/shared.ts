import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

export const JOBS = [
  "front_desk",
  "reservation_agent",
  "special_events",
  "website_editor",
  "accounts_manager",
  "site_manager",
] as const;

export const ADMIN_JOB = "admin" as const;

const LEGACY_TASKS = [
  "members",
  "passwords",
  "reservations_view",
  "reservations_manage",
  "website",
  "staff",
  "account_roles",
] as const;

const FUNCTIONS = [
  "view_reservations",
  "office_check_in",
  "occupancy_names",
  "make_reservation",
  "edit_reservation",
  "confirm_reservation",
  "cancel_reservation",
  "override_rule",
  "mark_calendar",
  "edit_calendar_note",
  "edit_calendar_heading",
  "manage_alerts",
  "alert_photos",
  "delete_alert",
  "resort_calendar",
  "gallery",
  "board_members",
  "member_accounts",
  "member_password",
  "member_charges",
  "run_reports",
  "create_staff",
  "edit_staff",
  "close_staff",
  "add_staff_access",
  "add_membership",
  "remove_staff_access",
] as const;

export const ALL_TASKS = [...JOBS, ADMIN_JOB, ...LEGACY_TASKS, ...FUNCTIONS] as const;

export function isAdminCode(code: unknown): boolean {
  return /^admin \d{3}$/i.test(String(code ?? "").trim());
}

export function isTopAdminCode(code: unknown): boolean {
  return /^admin 001$/i.test(String(code ?? "").trim());
}

export function isTopAdminProfile(row: {
  staff_code?: string | null;
  admin_level?: number | null;
} | null | undefined): boolean {
  if (!row) return false;
  return Number(row.admin_level) === 1 || isTopAdminCode(row.staff_code);
}

export function taskList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

export type Task = (typeof ALL_TASKS)[number];

/**
 * Level 1 and Site manager include every job and every function.
 * A job includes its functions. One extra function does not include the rest of a job.
 * Older task names still grant the job they were folded into.
 */
export function impliedAdminTask(
  task: string,
  adminLevel: number | null | undefined,
  adminTasks: string[],
  staffCode?: string | null,
): boolean {
  if (Number(adminLevel) === 1 || isTopAdminCode(staffCode)) return true;
  const has = (id: string) => adminTasks.includes(id);
  if (has("site_manager")) return true;
  const adminStaff = isAdminCode(staffCode) || has(ADMIN_JOB);
  const reservationAgent = has("reservation_agent") || has("reservations_manage");
  const frontDesk = has("front_desk") || reservationAgent || has("reservations_view");
  const websiteEditor = has("website_editor") || has("website");
  const specialEvents = has("special_events") || has("website");
  const accounts = has("accounts_manager") || has("members") || has("passwords");
  const legacyStaff = has("staff");
  const legacyRoles = has("account_roles");
  const staffFunctions =
    legacyStaff ||
    has("create_staff") ||
    has("edit_staff") ||
    has("close_staff") ||
    has("add_staff_access") ||
    has("add_membership") ||
    has("remove_staff_access");
  switch (task) {
    case "front_desk":
    case "reservations_view":
      return frontDesk;
    case "reservation_agent":
    case "reservations_manage":
      return reservationAgent;
    case "special_events":
      return specialEvents;
    case "website_editor":
    case "website":
      return websiteEditor;
    case "accounts_manager":
    case "members":
    case "passwords":
    case "reports":
    case "invoices":
      return accounts;
    case "staff":
      return staffFunctions || adminStaff;
    case "account_roles":
      return legacyRoles || adminStaff || has("add_staff_access") || has("add_membership") ||
        has("remove_staff_access");
    case "site_manager":
      return false;
    case "admin":
      return false;
    case "view_reservations":
    case "office_check_in":
    case "occupancy_names":
      return frontDesk || has(task);
    case "make_reservation":
    case "edit_reservation":
    case "confirm_reservation":
    case "cancel_reservation":
    case "override_rule":
      return reservationAgent || has(task);
    case "mark_calendar":
      return specialEvents || has(task);
    case "manage_alerts":
    case "alert_photos":
    case "resort_calendar":
    case "gallery":
    case "board_members":
    case "edit_calendar_note":
      return websiteEditor || has(task);
    case "delete_alert":
    case "edit_calendar_heading":
      return has(task);
    case "member_accounts":
    case "member_password":
    case "member_charges":
    case "run_reports":
      return accounts || has(task);
    case "create_staff":
    case "edit_staff":
    case "close_staff":
      return adminStaff || legacyStaff || has(task);
    case "add_staff_access":
    case "add_membership":
    case "remove_staff_access":
      return adminStaff || legacyRoles || has(task);
    default:
      return has(task);
  }
}

export function filterAssignableJobs(
  requested: unknown,
  callerLevel: number | null | undefined,
  callerTasks: string[],
  callerCode?: string | null,
): Task[] {
  const caller = { staff_code: callerCode, admin_level: callerLevel };
  const top = isTopAdminProfile(caller);
  const admin = top || isAdminCode(callerCode);
  return asTasks(requested).filter((job) => {
    if (job === ADMIN_JOB) return top;
    if (job === "site_manager") return admin;
    return impliedAdminTask(job, callerLevel, callerTasks, callerCode);
  });
}

export function isRegularStaffRecord(row: {
  staff_code?: string | null;
  admin_level?: number | null;
  admin_tasks?: string[] | null;
} | null | undefined): boolean {
  if (!row) return false;
  if (isTopAdminProfile(row) || isAdminCode(row.staff_code)) return false;
  return !taskList(row.admin_tasks).includes("site_manager");
}

export function staffRecordDenial(opts: {
  caller: {
    id?: string;
    staff_code?: string | null;
    admin_level?: number | null;
    admin_tasks?: string[] | null;
  };
  target: {
    id?: string;
    staff_code?: string | null;
    admin_level?: number | null;
    admin_tasks?: string[] | null;
  };
  nextTasks?: string[];
  closingStaff?: boolean;
  deleting?: boolean;
}): string | null {
  const { caller, target } = opts;
  const self = Boolean(caller.id && target.id && caller.id === target.id);
  const callerTop = isTopAdminProfile(caller);
  const targetTop = isTopAdminProfile(target);
  const targetAdmin = targetTop || isAdminCode(target.staff_code);
  const callerAdmin = callerTop || isAdminCode(caller.staff_code);
  const callerTasks = taskList(caller.admin_tasks);
  const targetTasks = taskList(target.admin_tasks);

  if (targetTop && (opts.closingStaff || opts.deleting)) {
    return "Nobody can delete or close admin 001.";
  }
  if (self && opts.closingStaff) {
    return "You cannot close or suspend your own signed-in account from this page.";
  }
  if (callerTop) {
    if (self && callerTasks.includes("site_manager") && opts.nextTasks &&
      !opts.nextTasks.includes("site_manager")) {
      return "You cannot remove your own Site manager job.";
    }
    return null;
  }
  if (targetAdmin) {
    return "You cannot change an admin record.";
  }
  if (callerAdmin) {
    if (self) return "You cannot change an admin record.";
    if (self && callerTasks.includes("site_manager") && opts.nextTasks &&
      !opts.nextTasks.includes("site_manager")) {
      return "You cannot remove your own Site manager job.";
    }
    return null;
  }
  if (targetTasks.includes("site_manager") && !self) {
    return "You cannot change a site manager or an admin.";
  }
  if (self && callerTasks.includes("site_manager") && opts.nextTasks &&
    !opts.nextTasks.includes("site_manager")) {
    return "You cannot remove your own Site manager job.";
  }
  return null;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function asTasks(value: unknown): Task[] {
  if (!Array.isArray(value)) return [];
  return value.filter((t): t is Task => ALL_TASKS.includes(t as Task));
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const MEMBER_STATUSES = [
  "pending_activation",
  "active",
  "suspended",
  "closed",
] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export function isMemberStatus(value: string): value is MemberStatus {
  return (MEMBER_STATUSES as readonly string[]).includes(value);
}

export function isBlockedStatus(status: string) {
  return status === "closed" || status === "suspended";
}

function cleanStatus(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Staff side for the job gate. staff_status wins when set. A staff-only account
 * with no staff_status uses account_status. A dual account does not inherit
 * Closed or Suspended from the member side.
 */
export function staffGateStatus(row: {
  account_kind?: string | null;
  is_admin?: boolean | null;
  staff_code?: string | null;
  member_id?: string | null;
  account_status?: string | null;
  staff_status?: string | null;
} | null): string {
  if (!row || !isStaffRow(row)) return "";
  const explicit = cleanStatus(row.staff_status);
  if (explicit) return explicit;
  const account = cleanStatus(row.account_status) || "active";
  if (!hasMemberId(row)) return account;
  if (account === "pending_activation") return "pending_activation";
  return "active";
}

/** Jobs and extra functions require an Active staff side and a cleared password flag. */
export function staffCanUseJobs(row: {
  account_kind?: string | null;
  is_admin?: boolean | null;
  staff_code?: string | null;
  member_id?: string | null;
  account_status?: string | null;
  staff_status?: string | null;
  must_change_password?: boolean | null;
} | null): boolean {
  if (!row || !isStaffRow(row)) return false;
  if (row.must_change_password === true) return false;
  return staffGateStatus(row) === "active";
}

export function isStaffRow(row: {
  account_kind?: string | null;
  is_admin?: boolean | null;
  staff_code?: string | null;
} | null) {
  if (!row) return false;
  if (row.account_kind === "admin" || row.account_kind === "both") return true;
  if (row.is_admin === true) return true;
  return Boolean(String(row.staff_code || "").trim());
}

export function hasMemberId(row: { member_id?: string | null } | null) {
  return Boolean(String(row?.member_id || "").trim());
}

export function normalizeUsername(value: unknown): string | null {
  const cleaned = String(value ?? "").trim().toLowerCase();
  return cleaned || null;
}

export function usernameError(username: string): string | null {
  if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(username)) {
    return "Username must be 3–30 characters and use only letters, numbers, underscore, or hyphen.";
  }
  return null;
}

export function hasOpenSide(row: {
  account_kind?: string | null;
  is_admin?: boolean | null;
  staff_code?: string | null;
  member_id?: string | null;
  account_status?: string | null;
  staff_status?: string | null;
} | null): boolean {
  if (!row) return false;
  const staff = isStaffRow(row);
  const member = hasMemberId(row);
  const staffBlocked = staff && isBlockedStatus(String(row.staff_status || "active"));
  const memberBlocked = member && isBlockedStatus(String(row.account_status || "active"));
  if (staff && member) return !(staffBlocked && memberBlocked);
  if (staff) return !staffBlocked;
  if (member) return !memberBlocked;
  return !isBlockedStatus(String(row.account_status || "active"));
}

export async function syncAuthBan(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
) {
  const { data: row } = await adminClient
    .from("profiles")
    .select("id,is_admin,staff_code,member_id,account_kind,account_status,staff_status")
    .eq("id", userId)
    .maybeSingle();
  await applyAuthAccess(adminClient, userId, row ? !hasOpenSide(row) : false);
}

export async function applyAuthAccess(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  blocked: boolean,
) {
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: blocked ? "876000h" : "none",
  });
  if (error) {
    console.error("Could not update Auth ban:", error.message);
  }
  if (blocked) {
    try {
      await adminClient.auth.admin.signOut(userId, "global");
    } catch (err) {
      console.error(
        "Could not revoke sessions:",
        err instanceof Error ? err.message : err,
      );
    }
  }
}

export async function sendMemberWelcomeEmail(opts: {
  to: string;
  fullName: string;
  memberId: string;
  temporaryPassword: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return {
      sent: false,
      error:
        "RESEND_API_KEY is not set in Supabase Edge Function secrets. Account was created; email was not sent.",
    };
  }

  const from =
    Deno.env.get("MEMBER_EMAIL_FROM") ||
    "East Canyon Resort <onboarding@resend.dev>";
  const appUrl = (Deno.env.get("MEMBER_APP_URL") || "").replace(/\/$/, "");
  const activateUrl = appUrl
    ? `${appUrl}/create-account.html`
    : "create-account.html on the East Canyon website";
  const loginUrl = appUrl ? `${appUrl}/login.html` : "the Members sign-in page";

  const safeName = escapeHtml(opts.fullName || "Member");
  const safeEmail = escapeHtml(opts.to);
  const safeMemberId = escapeHtml(opts.memberId);
  const safePassword = escapeHtml(opts.temporaryPassword);

  const html = `
    <p>Hello ${safeName},</p>
    <p>East Canyon Resort has created your member website access.</p>
    <p><strong>Sign-in information</strong></p>
    <ul>
      <li>Email: ${safeEmail}</li>
      <li>Member ID: ${safeMemberId}</li>
      <li>Temporary password: ${safePassword}</li>
    </ul>
    <p>
      Activate your account here:
      ${
        appUrl
          ? `<a href="${activateUrl}">${activateUrl}</a>`
          : escapeHtml(activateUrl)
      }
    </p>
    <p>
      Enter your email, member ID, and temporary password, then choose a username and your own password.
      After that, sign in with your username or email at ${
        appUrl ? `<a href="${loginUrl}">${loginUrl}</a>` : escapeHtml(loginUrl)
      }.
    </p>
    <p>If you did not expect this message, contact the resort office at (801) 359-9030.</p>
    <p>East Canyon Resort</p>
  `;

  const text = [
    `Hello ${opts.fullName || "Member"},`,
    "",
    "East Canyon Resort has created your member website access.",
    "",
    `Email: ${opts.to}`,
    `Member ID: ${opts.memberId}`,
    `Temporary password: ${opts.temporaryPassword}`,
    "",
    `Activate: ${activateUrl}`,
    "Enter your email, member ID, and temporary password, then choose a username and your own password.",
    `Then sign in with your username or email at: ${loginUrl}`,
    "",
    "If you did not expect this message, contact the resort office at (801) 359-9030.",
    "East Canyon Resort",
  ].join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: "Your East Canyon Resort member website access",
        html,
        text,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        sent: false,
        error:
          (data && (data.message || data.error)) ||
          `Email provider returned ${response.status}`,
      };
    }
    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : "Could not send email",
    };
  }
}

