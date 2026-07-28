import { sql } from "drizzle-orm";
import { integer, text, sqliteTable, real } from "drizzle-orm/sqlite-core";

// Users table
export const Users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  password: text("password"),
  role: text("role").notNull().default("citizen"), // 'citizen', 'collector', 'admin'
  fullName: text("full_name"),
  address: text("address"),
  wardNumber: text("ward_number"),
  phone: text("phone"),
  governmentId: text("government_id"),
  avatar: text("avatar"),
  rewardPoints: integer("reward_points").default(0),
  status: text("status").default("active"), // 'active', 'suspended'
  emailVerified: integer("email_verified", { mode: 'timestamp' }),
  resetPasswordToken: text("reset_password_token"),
  resetPasswordExpires: integer("reset_password_expires", { mode: 'timestamp' }),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// Reports table — with GPS fields for citizen submission and collector verification
export const Reports = sqliteTable("reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => Users.id).notNull(),
  location: text("location").notNull(),
  // Citizen GPS at report time
  latitude: real("latitude"),
  longitude: real("longitude"),
  formattedAddress: text("formatted_address"),
  wardNumber: text("ward_number"),
  wasteType: text("waste_type").notNull(),
  amount: text("amount").notNull(),
  imageUrl: text("image_url"),
  verificationResult: text("verification_result", { mode: 'json' }),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  collectorId: integer("collector_id").references(() => Users.id),
  // Collector GPS at collection time
  collectorLat: real("collector_lat"),
  collectorLng: real("collector_lng"),
  collectorVerifiedAt: integer("collector_verified_at", { mode: 'timestamp' }),
  locationVerified: integer("location_verified", { mode: 'boolean' }).default(false),
  distanceMeters: integer("distance_meters"),
});

// Rewards table — for Citizens only (reward catalogue items created by admin)
export const Rewards = sqliteTable("rewards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => Users.id).notNull(),
  points: integer("points").notNull().default(0),
  level: integer("level").notNull().default(1),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  isAvailable: integer("is_available", { mode: 'boolean' }).notNull().default(true),
  description: text("description"),
  name: text("name").notNull(),
  collectionInfo: text("collection_info").notNull(),
});

// CollectedWastes table
export const CollectedWastes = sqliteTable("collected_wastes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reportId: integer("report_id").references(() => Reports.id).notNull(),
  collectorId: integer("collector_id").references(() => Users.id).notNull(),
  collectionDate: integer("collection_date", { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  status: text("status").notNull().default("collected"),
});

// Notifications table
export const Notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => Users.id).notNull(),
  message: text("message").notNull(),
  type: text("type").notNull(),
  isRead: integer("is_read", { mode: 'boolean' }).notNull().default(false),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// Transactions table — Citizens only for reward history
export const Transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => Users.id).notNull(),
  type: text("type").notNull(), // 'earned_report_verified', 'earned_daily_login', 'referral_reward', 'redeemed'
  amount: integer("amount").notNull(),
  description: text("description").notNull(),
  date: integer("date", { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// Waste Categories table
export const WasteCategories = sqliteTable("waste_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  pointsValue: integer("points_value").notNull().default(0),
  isActive: integer("is_active", { mode: 'boolean' }).notNull().default(true),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// System Settings table
export const SystemSettings = sqliteTable("system_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value", { mode: 'json' }).notNull(),
  updatedAt: integer("updated_at", { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// Activity Logs table
export const ActivityLogs = sqliteTable("activity_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => Users.id),
  action: text("action").notNull(),
  targetTable: text("target_table"),
  targetId: integer("target_id"),
  details: text("details", { mode: 'json' }),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// AI Verification History table
export const AiVerificationHistory = sqliteTable("ai_verification_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reportId: integer("report_id").references(() => Reports.id).notNull(),
  checkerId: integer("checker_id").references(() => Users.id), // Nullable for citizen report
  checkType: text("check_type").notNull(), // 'citizen_report', 'collector_verify'
  fullResult: text("full_result", { mode: 'json' }).notNull(),
  imageUrl: text("image_url"),
  verificationStatus: text("verification_status").notNull(), // 'Verified', 'Suspicious', etc.
  finalDecision: text("final_decision").notNull(), // 'Accept Report', 'Needs Manual Review', 'Reject Report'
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});