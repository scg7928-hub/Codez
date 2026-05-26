import { Router } from "express";
import { db } from "@workspace/db";
import {
  codesTable, staffTable, tasksTable, leavesTable,
  announcementsTable, promotionRequestsTable, activityLogsTable,
} from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import {
  CreateCodeBody, DeleteCodeParams,
  CreateStaffBody, DeleteStaffParams, UpdateStaffParams, UpdateStaffBody, StaffLoginBody,
  CreateTaskBody, UpdateTaskParams, UpdateTaskBody, DeleteTaskParams,
  CreateLeaveBody, UpdateLeaveParams, UpdateLeaveBody,
} from "@workspace/api-zod";

const router = Router();

const fmt = (row: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
};

async function logActivity(
  type: string,
  description: string,
  staffId?: number,
  staffUsername?: string,
) {
  try {
    await db.insert(activityLogsTable).values({
      type, description,
      staffId: staffId ?? null,
      staffUsername: staffUsername ?? null,
    });
  } catch { /* non-fatal */ }
}

// ── Codes ──────────────────────────────────────────────────────────────────
router.get("/codes", async (_req, res) => {
  const rows = await db.select().from(codesTable).orderBy(codesTable.createdAt);
  res.json(rows.map(fmt));
});

router.post("/codes", async (req, res) => {
  const body = CreateCodeBody.parse(req.body);
  const [row] = await db.insert(codesTable).values(body).returning();
  await logActivity("code_added", `Code "${body.title}" (${body.type}) added`);
  res.status(201).json(fmt(row));
});

router.delete("/codes/:id", async (req, res) => {
  const { id } = DeleteCodeParams.parse({ id: Number(req.params.id) });
  const [code] = await db.select().from(codesTable).where(eq(codesTable.id, id));
  await db.delete(codesTable).where(eq(codesTable.id, id));
  await logActivity("code_removed", `Code "${code?.title ?? id}" removed`);
  res.json({ ok: true });
});

// ── Staff ──────────────────────────────────────────────────────────────────
const staffFields = {
  id: staffTable.id,
  username: staffTable.username,
  role: staffTable.role,
  tasksCompleted: staffTable.tasksCompleted,
  tasksFailed: staffTable.tasksFailed,
  warnings: staffTable.warnings,
  notes: staffTable.notes,
  createdAt: staffTable.createdAt,
};

router.get("/staff", async (_req, res) => {
  const rows = await db.select(staffFields).from(staffTable).orderBy(staffTable.createdAt);
  res.json(rows.map(fmt));
});

router.post("/staff", async (req, res) => {
  const body = CreateStaffBody.parse(req.body);
  const [row] = await db.insert(staffTable).values(body).returning(staffFields);
  await logActivity("staff_added", `${body.username} joined as ${body.role}`, row.id, body.username);
  res.status(201).json(fmt(row));
});

router.delete("/staff/:id", async (req, res) => {
  const { id } = DeleteStaffParams.parse({ id: Number(req.params.id) });
  const [member] = await db.select().from(staffTable).where(eq(staffTable.id, id));
  await db.delete(staffTable).where(eq(staffTable.id, id));
  await logActivity("staff_removed", `${member?.username ?? id} was removed from staff`);
  res.json({ ok: true });
});

router.patch("/staff/:id", async (req, res) => {
  const { id } = UpdateStaffParams.parse({ id: Number(req.params.id) });
  const body = UpdateStaffBody.parse(req.body);
  const [before] = await db.select().from(staffTable).where(eq(staffTable.id, id));
  const [row] = await db.update(staffTable).set(body).where(eq(staffTable.id, id)).returning(staffFields);
  if (body.role && before?.role !== body.role) {
    await logActivity("role_changed", `${row.username}'s role changed: ${before?.role} → ${body.role}`, row.id, row.username);
  }
  res.json(fmt(row));
});

// Staff notes
router.patch("/staff/:id/notes", async (req, res) => {
  const id = Number(req.params.id);
  const { notes } = req.body;
  const [row] = await db.update(staffTable).set({ notes: notes ?? null }).where(eq(staffTable.id, id)).returning(staffFields);
  if (!row) return res.status(404).json({ error: "Staff not found" });
  res.json(fmt(row));
});

// Issue a warning (+1)
router.post("/staff/:id/warn", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(staffTable)
    .set({ warnings: sql`${staffTable.warnings} + 1` })
    .where(eq(staffTable.id, id))
    .returning(staffFields);
  if (!row) return res.status(404).json({ error: "Staff not found" });
  await logActivity("warning_issued", `⚠️ Warning #${row.warnings} issued to ${row.username}`, row.id, row.username);
  res.json(fmt(row));
});

// Remove one warning
router.delete("/staff/:id/warn", async (req, res) => {
  const id = Number(req.params.id);
  const [cur] = await db.select({ warnings: staffTable.warnings, username: staffTable.username }).from(staffTable).where(eq(staffTable.id, id));
  if (!cur) return res.status(404).json({ error: "Staff not found" });
  const newCount = Math.max(0, cur.warnings - 1);
  const [row] = await db.update(staffTable).set({ warnings: newCount }).where(eq(staffTable.id, id)).returning(staffFields);
  await logActivity("warning_cleared", `Warning removed from ${cur.username} (now ${newCount})`, id, cur.username);
  res.json(fmt(row));
});

// Clear ALL warnings
router.delete("/staff/:id/warnings", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(staffTable).set({ warnings: 0 }).where(eq(staffTable.id, id)).returning(staffFields);
  if (!row) return res.status(404).json({ error: "Staff not found" });
  await logActivity("warning_cleared", `All warnings cleared for ${row.username}`, row.id, row.username);
  res.json(fmt(row));
});

router.post("/staff/login", async (req, res) => {
  const body = StaffLoginBody.parse(req.body);
  const [full] = await db.select().from(staffTable).where(eq(staffTable.username, body.username));
  if (!full) return res.status(401).json({ error: "Invalid credentials" });
  if (full.password !== body.password) return res.status(401).json({ error: "Invalid credentials" });
  const { password: _, ...safe } = full;
  return res.json(fmt(safe));
});

// ── Tasks ──────────────────────────────────────────────────────────────────
router.get("/tasks", async (_req, res) => {
  const rows = await db.select().from(tasksTable).orderBy(tasksTable.createdAt);
  res.json(rows.map(fmt));
});

router.post("/tasks", async (req, res) => {
  const body = CreateTaskBody.parse(req.body);
  const [member] = await db.select().from(staffTable).where(eq(staffTable.id, body.staffId));
  if (!member) return res.status(404).json({ error: "Staff member not found" });
  const dueAt = req.body.dueAt ? new Date(req.body.dueAt) : null;
  const [row] = await db.insert(tasksTable)
    .values({ ...body, staffUsername: member.username, status: "pending", dueAt })
    .returning();
  await logActivity("task_assigned", `Task "${body.title}" assigned to ${member.username}`, member.id, member.username);
  res.status(201).json(fmt(row));
});

router.patch("/tasks/:id", async (req, res) => {
  const { id } = UpdateTaskParams.parse({ id: Number(req.params.id) });
  const body = UpdateTaskBody.parse(req.body);
  const updates: Record<string, unknown> = { ...body };

  if (body.status === "done") {
    updates.doneAt = new Date();
    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    if (task && task.status !== "done") {
      await db.update(staffTable)
        .set({ tasksCompleted: sql`${staffTable.tasksCompleted} + 1` })
        .where(eq(staffTable.id, task.staffId));
      await logActivity("task_completed", `${task.staffUsername} completed task "${task.title}"`, task.staffId, task.staffUsername);
    }
  } else if (body.status === "failed") {
    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    if (task && task.status !== "failed") {
      await db.update(staffTable)
        .set({ tasksFailed: sql`${staffTable.tasksFailed} + 1`, warnings: sql`${staffTable.warnings} + 1` })
        .where(eq(staffTable.id, task.staffId));
      await logActivity("task_failed", `❌ ${task.staffUsername} failed task "${task.title}" (+1 warning)`, task.staffId, task.staffUsername);
    }
  }

  const [row] = await db.update(tasksTable).set(updates as Parameters<typeof db.update>[0]).where(eq(tasksTable.id, id)).returning();
  res.json(fmt(row));
});

router.delete("/tasks/:id", async (req, res) => {
  const { id } = DeleteTaskParams.parse({ id: Number(req.params.id) });
  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  if (task) await logActivity("task_deleted", `Task "${task.title}" deleted`);
  res.json({ ok: true });
});

// ── Leaves ─────────────────────────────────────────────────────────────────
router.get("/leaves", async (_req, res) => {
  const rows = await db.select().from(leavesTable).orderBy(leavesTable.createdAt);
  res.json(rows.map(fmt));
});

router.post("/leaves", async (req, res) => {
  const body = CreateLeaveBody.parse(req.body);
  const [row] = await db.insert(leavesTable).values({ ...body, status: "pending" }).returning();
  await logActivity("leave_requested", `${body.staffUsername} submitted a leave request`, body.staffId, body.staffUsername);
  res.status(201).json(fmt(row));
});

router.patch("/leaves/:id", async (req, res) => {
  const { id } = UpdateLeaveParams.parse({ id: Number(req.params.id) });
  const body = UpdateLeaveBody.parse(req.body);
  const [row] = await db.update(leavesTable).set({ ...body, reviewedAt: new Date() }).where(eq(leavesTable.id, id)).returning();
  if (row) await logActivity(`leave_${body.status}`, `${row.staffUsername}'s leave was ${body.status}`, row.staffId, row.staffUsername);
  res.json(fmt(row));
});

// ── Stats ──────────────────────────────────────────────────────────────────
router.get("/stats", async (_req, res) => {
  const [codeStats] = await db.select({
    total: sql<number>`count(*)::int`,
    free: sql<number>`count(*) filter (where type = 'free')::int`,
    paid: sql<number>`count(*) filter (where type = 'paid')::int`,
  }).from(codesTable);

  const [staffStats] = await db.select({ total: sql<number>`count(*)::int` }).from(staffTable);

  const [taskStats] = await db.select({
    total: sql<number>`count(*)::int`,
    done: sql<number>`count(*) filter (where status = 'done')::int`,
    pending: sql<number>`count(*) filter (where status = 'pending')::int`,
    failed: sql<number>`count(*) filter (where status = 'failed')::int`,
  }).from(tasksTable);

  const [leaveStats] = await db.select({
    pending: sql<number>`count(*) filter (where status = 'pending')::int`,
  }).from(leavesTable);

  const [promoStats] = await db.select({
    pending: sql<number>`count(*) filter (where status = 'pending')::int`,
  }).from(promotionRequestsTable);

  res.json({
    totalCodes: codeStats.total,
    freeCodes: codeStats.free,
    paidCodes: codeStats.paid,
    totalStaff: staffStats.total,
    totalTasks: taskStats.total,
    completedTasks: taskStats.done,
    pendingTasks: taskStats.pending,
    failedTasks: taskStats.failed,
    pendingLeaves: leaveStats.pending,
    pendingPromotions: promoStats.pending,
  });
});

// ── Announcements ──────────────────────────────────────────────────────────
router.get("/announcements", async (req, res) => {
  const type = req.query.type as string | undefined;
  const rows = type
    ? await db.select().from(announcementsTable).where(eq(announcementsTable.type, type)).orderBy(announcementsTable.createdAt)
    : await db.select().from(announcementsTable).orderBy(announcementsTable.createdAt);
  res.json(rows.map(fmt));
});

router.post("/announcements", async (req, res) => {
  const { type, title, content, pinned } = req.body;
  if (!type || !title || !content) return res.status(400).json({ error: "type, title and content required" });
  const [row] = await db.insert(announcementsTable).values({ type, title, content, pinned: pinned ? "true" : "false" }).returning();
  await logActivity("announcement_posted", `${type === "staff" ? "🔒 Staff" : "🌍 Public"} announcement: "${title}"`);
  res.status(201).json(fmt(row));
});

router.delete("/announcements/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [ann] = await db.select().from(announcementsTable).where(eq(announcementsTable.id, id));
  await db.delete(announcementsTable).where(eq(announcementsTable.id, id));
  await logActivity("announcement_deleted", `Announcement "${ann?.title ?? id}" deleted`);
  res.json({ ok: true });
});

// ── Promotion Requests ─────────────────────────────────────────────────────
router.get("/promotion-requests", async (req, res) => {
  const staffId = req.query.staffId ? Number(req.query.staffId) : undefined;
  const rows = staffId
    ? await db.select().from(promotionRequestsTable).where(eq(promotionRequestsTable.staffId, staffId)).orderBy(promotionRequestsTable.createdAt)
    : await db.select().from(promotionRequestsTable).orderBy(promotionRequestsTable.createdAt);
  res.json(rows.map(fmt));
});

router.post("/promotion-requests", async (req, res) => {
  const { staffId, staffUsername, currentRole, requestedRole, reason } = req.body;
  if (!staffId || !staffUsername || !currentRole || !requestedRole || !reason)
    return res.status(400).json({ error: "all fields required" });
  const existing = await db.select().from(promotionRequestsTable).where(eq(promotionRequestsTable.staffId, staffId));
  if (existing.some(r => r.status === "pending"))
    return res.status(409).json({ error: "You already have a pending promotion request" });
  const [row] = await db.insert(promotionRequestsTable).values({ staffId, staffUsername, currentRole, requestedRole, reason }).returning();
  await logActivity("promo_requested", `${staffUsername} requested promotion: ${currentRole} → ${requestedRole}`, staffId, staffUsername);
  res.status(201).json(fmt(row));
});

router.put("/promotion-requests/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "status required" });
  const [row] = await db.update(promotionRequestsTable).set({ status, reviewedAt: new Date() }).where(eq(promotionRequestsTable.id, id)).returning();
  if (status === "approved" && row) {
    await db.update(staffTable).set({ role: row.requestedRole }).where(eq(staffTable.id, row.staffId));
    await logActivity("promo_approved", `⬆️ ${row.staffUsername} promoted: ${row.currentRole} → ${row.requestedRole}`, row.staffId, row.staffUsername);
  } else if (status === "denied" && row) {
    await logActivity("promo_denied", `${row.staffUsername}'s promotion request denied`, row.staffId, row.staffUsername);
  }
  res.json(fmt(row));
});

// ── Activity Log ───────────────────────────────────────────────────────────
router.get("/activity-logs", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const type = req.query.type as string | undefined;
  const staffId = req.query.staffId ? Number(req.query.staffId) : undefined;

  let rows;
  if (type && staffId) {
    rows = await db.select().from(activityLogsTable)
      .where(eq(activityLogsTable.type, type))
      .orderBy(desc(activityLogsTable.createdAt))
      .limit(limit);
  } else if (type) {
    rows = await db.select().from(activityLogsTable)
      .where(eq(activityLogsTable.type, type))
      .orderBy(desc(activityLogsTable.createdAt))
      .limit(limit);
  } else if (staffId) {
    rows = await db.select().from(activityLogsTable)
      .where(eq(activityLogsTable.staffId, staffId))
      .orderBy(desc(activityLogsTable.createdAt))
      .limit(limit);
  } else {
    rows = await db.select().from(activityLogsTable)
      .orderBy(desc(activityLogsTable.createdAt))
      .limit(limit);
  }
  res.json(rows.map(fmt));
});

export default router;
