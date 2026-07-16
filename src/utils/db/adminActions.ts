"use server";

import { db } from './dbConfig';
import { 
  Users, Reports, Rewards, CollectedWastes, Notifications, Transactions, 
  WasteCategories, SystemSettings, ActivityLogs 
} from './schema';
import { eq, sql, and, desc, ne, like } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

// --- ACTIVITY LOGS ---
export async function logAdminAction(userId: number, action: string, targetTable: string, targetId?: number, details?: any) {
  try {
    await db.insert(ActivityLogs).values({
      userId,
      action,
      targetTable,
      targetId,
      details: details ? JSON.stringify(details) : null,
    }).execute();
  } catch (e) {
    console.error("Failed to log admin action:", e);
  }
}

export async function getRecentActivityLogs(limit: number = 50) {
  try {
    const logs = await db.select({
      id: ActivityLogs.id,
      userId: ActivityLogs.userId,
      action: ActivityLogs.action,
      targetTable: ActivityLogs.targetTable,
      targetId: ActivityLogs.targetId,
      details: ActivityLogs.details,
      createdAt: ActivityLogs.createdAt,
    }).from(ActivityLogs).orderBy(desc(ActivityLogs.createdAt)).limit(limit).execute();
    
    // Fetch user names for the logs
    const users = await db.select({ id: Users.id, name: Users.name }).from(Users).execute();
    const userMap = new Map(users.map(u => [u.id, u.name]));

    return logs.map(log => ({
      ...log,
      userName: log.userId ? userMap.get(log.userId) || 'Unknown' : 'System',
    }));
  } catch (error) {
    console.error("Error fetching activity logs:", error);
    return [];
  }
}

// --- USERS MANAGEMENT ---
export async function deleteUser(adminId: number, targetUserId: number) {
  try {
    // Delete associated data first (foreign key constraints)
    await db.delete(Transactions).where(eq(Transactions.userId, targetUserId)).execute();
    await db.delete(Notifications).where(eq(Notifications.userId, targetUserId)).execute();
    await db.delete(Rewards).where(eq(Rewards.userId, targetUserId)).execute();
    // Reassign or delete reports if needed (keeping them for now as orphaned or delete)
    await db.delete(Reports).where(eq(Reports.userId, targetUserId)).execute();
    
    await db.delete(Users).where(eq(Users.id, targetUserId)).execute();
    await logAdminAction(adminId, "DELETE_USER", "users", targetUserId);
    return true;
  } catch (error) {
    console.error("Error deleting user:", error);
    return false;
  }
}

export async function updateUserRole(adminId: number, targetUserId: number, newRole: string) {
  try {
    await db.update(Users).set({ role: newRole }).where(eq(Users.id, targetUserId)).execute();
    await logAdminAction(adminId, "UPDATE_USER_ROLE", "users", targetUserId, { role: newRole });
    return true;
  } catch (error) {
    console.error("Error updating user role:", error);
    return false;
  }
}

// --- WASTE CATEGORIES ---
export async function getWasteCategories() {
  try {
    return await db.select().from(WasteCategories).orderBy(desc(WasteCategories.createdAt)).execute();
  } catch (error) {
    console.error("Error fetching categories:", error);
    return [];
  }
}

export async function createWasteCategory(adminId: number, data: { name: string, description: string, pointsValue: number }) {
  try {
    const [category] = await db.insert(WasteCategories).values({
      name: data.name,
      description: data.description,
      pointsValue: data.pointsValue
    }).returning().execute();
    await logAdminAction(adminId, "CREATE_CATEGORY", "waste_categories", category.id, data);
    return category;
  } catch (error) {
    console.error("Error creating category:", error);
    return null;
  }
}

export async function updateWasteCategory(adminId: number, id: number, data: any) {
  try {
    const [category] = await db.update(WasteCategories).set(data).where(eq(WasteCategories.id, id)).returning().execute();
    await logAdminAction(adminId, "UPDATE_CATEGORY", "waste_categories", id, data);
    return category;
  } catch (error) {
    console.error("Error updating category:", error);
    return null;
  }
}

export async function deleteWasteCategory(adminId: number, id: number) {
  try {
    await db.delete(WasteCategories).where(eq(WasteCategories.id, id)).execute();
    await logAdminAction(adminId, "DELETE_CATEGORY", "waste_categories", id);
    return true;
  } catch (error) {
    console.error("Error deleting category:", error);
    return false;
  }
}

// --- SYSTEM SETTINGS ---
export async function getSystemSettings() {
  try {
    const settings = await db.select().from(SystemSettings).execute();
    return settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, any>);
  } catch (error) {
    console.error("Error fetching settings:", error);
    return {};
  }
}

export async function updateSystemSetting(adminId: number, key: string, value: any) {
  try {
    const existing = await db.select().from(SystemSettings).where(eq(SystemSettings.key, key)).execute();
    if (existing.length > 0) {
      await db.update(SystemSettings).set({ value, updatedAt: new Date() }).where(eq(SystemSettings.key, key)).execute();
    } else {
      await db.insert(SystemSettings).values({ key, value }).execute();
    }
    await logAdminAction(adminId, "UPDATE_SETTING", "system_settings", undefined, { key, value });
    return true;
  } catch (error) {
    console.error("Error updating setting:", error);
    return false;
  }
}

// --- REPORTS ---
export async function deleteReport(adminId: number, reportId: number) {
  try {
    await db.delete(CollectedWastes).where(eq(CollectedWastes.reportId, reportId)).execute();
    await db.delete(Reports).where(eq(Reports.id, reportId)).execute();
    await logAdminAction(adminId, "DELETE_REPORT", "reports", reportId);
    return true;
  } catch (error) {
    console.error("Error deleting report:", error);
    return false;
  }
}

// --- REWARDS ---
export async function createGlobalReward(adminId: number, data: { name: string, description: string, points: number, collectionInfo: string }) {
  try {
    // For global rewards, we can assign them to a generic admin user ID or user ID 0 (system)
    const [reward] = await db.insert(Rewards).values({
      userId: adminId, 
      name: data.name,
      description: data.description,
      points: data.points,
      collectionInfo: data.collectionInfo,
      isAvailable: true,
      level: 1,
    }).returning().execute();
    await logAdminAction(adminId, "CREATE_REWARD", "rewards", reward.id, data);
    return reward;
  } catch (error) {
    console.error("Error creating global reward:", error);
    return null;
  }
}

export async function deleteReward(adminId: number, rewardId: number) {
  try {
    await db.delete(Rewards).where(eq(Rewards.id, rewardId)).execute();
    await logAdminAction(adminId, "DELETE_REWARD", "rewards", rewardId);
    return true;
  } catch (error) {
    console.error("Error deleting reward:", error);
    return false;
  }
}
