import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const codesTable = pgTable("codes", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  code: text("code"),
  link: text("link"),
  emoji: text("emoji"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCodeSchema = createInsertSchema(codesTable).omit({ id: true, createdAt: true });
export type InsertCode = z.infer<typeof insertCodeSchema>;
export type Code = typeof codesTable.$inferSelect;

export const staffTable = pgTable("staff", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("Staff"),
  tasksCompleted: integer("tasks_completed").notNull().default(0),
  tasksFailed: integer("tasks_failed").notNull().default(0),
  warnings: integer("warnings").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStaffSchema = createInsertSchema(staffTable).omit({ id: true, createdAt: true, tasksCompleted: true, tasksFailed: true });
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type StaffMember = typeof staffTable.$inferSelect;

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull(),
  staffUsername: text("staff_username").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  consequence: text("consequence"),
  status: text("status").notNull().default("pending"),
  dueAt: timestamp("due_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  doneAt: timestamp("done_at"),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, doneAt: true, status: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;

export const leavesTable = pgTable("leaves", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull(),
  staffUsername: text("staff_username").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
});

export const insertLeaveSchema = createInsertSchema(leavesTable).omit({ id: true, createdAt: true, reviewedAt: true, status: true });
export type InsertLeave = z.infer<typeof insertLeaveSchema>;
export type LeaveRequest = typeof leavesTable.$inferSelect;

export const promotionRequestsTable = pgTable("promotion_requests", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull(),
  staffUsername: text("staff_username").notNull(),
  currentRole: text("current_role").notNull(),
  requestedRole: text("requested_role").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
});

export type PromotionRequest = typeof promotionRequestsTable.$inferSelect;

export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  pinned: text("pinned").notNull().default("false"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Announcement = typeof announcementsTable.$inferSelect;

export const activityLogsTable = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  staffId: integer("staff_id"),
  staffUsername: text("staff_username"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ActivityLog = typeof activityLogsTable.$inferSelect;
