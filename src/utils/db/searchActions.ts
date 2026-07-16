'use server'

import { db } from "./dbConfig";
import { Users, Reports, Rewards, Notifications, CollectedWastes, Transactions, ActivityLogs } from "./schema";
import { eq, like, or, and } from "drizzle-orm";

export interface SearchResult {
  category: string;
  items: Array<{
    id: number;
    title: string;
    subtitle: string;
    link: string;
  }>;
}

export async function globalSearch(query: string, role: string, userEmail: string): Promise<SearchResult[]> {
  if (!query || query.trim().length === 0) return [];

  const searchQuery = `%${query.trim()}%`;
  const results: SearchResult[] = [];

  // Fetch the current user to get their ID
  const [currentUser] = await db.select().from(Users).where(eq(Users.email, userEmail)).limit(1);
  if (!currentUser) return [];

  const currentUserId = currentUser.id;

  if (role === "admin") {
    // 1. Search Users (Admin)
    const users = await db.select().from(Users).where(
      or(
        like(Users.name, searchQuery),
        like(Users.email, searchQuery),
        like(Users.role, searchQuery)
      )
    ).limit(5);

    if (users.length > 0) {
      results.push({
        category: "Users",
        items: users.map(u => ({
          id: u.id,
          title: u.name,
          subtitle: `${u.email} (${u.role})`,
          link: `/admin?tab=users&search=${u.id}`
        }))
      });
    }

    // 2. Search Reports (Admin)
    const reports = await db.select().from(Reports).where(
      or(
        like(Reports.location, searchQuery),
        like(Reports.wasteType, searchQuery),
        like(Reports.status, searchQuery)
      )
    ).limit(5);

    if (reports.length > 0) {
      results.push({
        category: "Reports",
        items: reports.map(r => ({
          id: r.id,
          title: `${r.wasteType} at ${r.location}`,
          subtitle: `Status: ${r.status}`,
          link: `/admin?tab=reports&search=${r.id}`
        }))
      });
    }

    // 3. Search Activity Logs (Admin)
    const logs = await db.select().from(ActivityLogs).where(
      or(
        like(ActivityLogs.action, searchQuery),
        like(ActivityLogs.targetTable, searchQuery)
      )
    ).limit(5);

    if (logs.length > 0) {
      results.push({
        category: "Activity Logs",
        items: logs.map(l => ({
          id: l.id,
          title: l.action,
          subtitle: `Table: ${l.targetTable || 'System'}`,
          link: `/admin?tab=logs&search=${l.id}`
        }))
      });
    }

    // 4. Search Transactions (Admin)
    const transactions = await db.select().from(Transactions).where(
      or(
        like(Transactions.description, searchQuery),
        like(Transactions.type, searchQuery)
      )
    ).limit(5);

    if (transactions.length > 0) {
      results.push({
        category: "Transactions",
        items: transactions.map(t => ({
          id: t.id,
          title: `${t.type.toUpperCase()}: ${t.amount} pts`,
          subtitle: t.description,
          link: `/admin?tab=transactions&search=${t.id}`
        }))
      });
    }

  } else if (role === "collector") {
    // 1. Search Pending Tasks (Collector)
    const pendingTasks = await db.select().from(Reports).where(
      and(
        eq(Reports.status, "pending"),
        or(
          like(Reports.location, searchQuery),
          like(Reports.wasteType, searchQuery)
        )
      )
    ).limit(5);

    if (pendingTasks.length > 0) {
      results.push({
        category: "Pending Tasks",
        items: pendingTasks.map(t => ({
          id: t.id,
          title: `${t.wasteType} at ${t.location}`,
          subtitle: `Amount: ${t.amount}`,
          link: `/collect?search=${t.id}`
        }))
      });
    }

    // 2. Search My Completed Tasks (Collector)
    const completedTasks = await db.select({
      id: CollectedWastes.id,
      reportLocation: Reports.location,
      wasteType: Reports.wasteType,
      status: CollectedWastes.status
    })
    .from(CollectedWastes)
    .innerJoin(Reports, eq(CollectedWastes.reportId, Reports.id))
    .where(
      and(
        eq(CollectedWastes.collectorId, currentUserId),
        or(
          like(Reports.location, searchQuery),
          like(Reports.wasteType, searchQuery)
        )
      )
    ).limit(5);

    if (completedTasks.length > 0) {
      results.push({
        category: "Completed Tasks",
        items: completedTasks.map(t => ({
          id: t.id,
          title: `${t.wasteType} at ${t.reportLocation}`,
          subtitle: `Status: ${t.status}`,
          link: `/collect?tab=completed&search=${t.id}`
        }))
      });
    }

  } else {
    // Citizen Logic (Default)
    // 1. Search My Reports (Citizen)
    const myReports = await db.select().from(Reports).where(
      and(
        eq(Reports.userId, currentUserId),
        or(
          like(Reports.location, searchQuery),
          like(Reports.wasteType, searchQuery),
          like(Reports.status, searchQuery)
        )
      )
    ).limit(5);

    if (myReports.length > 0) {
      results.push({
        category: "My Reports",
        items: myReports.map(r => ({
          id: r.id,
          title: `${r.wasteType} at ${r.location}`,
          subtitle: `Status: ${r.status}`,
          link: `/report?search=${r.id}`
        }))
      });
    }

    // 2. Search My Rewards (Citizen)
    const myRewards = await db.select().from(Rewards).where(
      and(
        eq(Rewards.userId, currentUserId),
        or(
          like(Rewards.name, searchQuery),
          like(Rewards.description, searchQuery)
        )
      )
    ).limit(5);

    if (myRewards.length > 0) {
      results.push({
        category: "Rewards History",
        items: myRewards.map(r => ({
          id: r.id,
          title: r.name,
          subtitle: r.description || `${r.points} pts`,
          link: `/rewards?search=${r.id}`
        }))
      });
    }

    // 3. Search Notifications (Citizen)
    const myNotifications = await db.select().from(Notifications).where(
      and(
        eq(Notifications.userId, currentUserId),
        or(
          like(Notifications.type, searchQuery),
          like(Notifications.message, searchQuery)
        )
      )
    ).limit(5);

    if (myNotifications.length > 0) {
      results.push({
        category: "Notifications",
        items: myNotifications.map(n => ({
          id: n.id,
          title: n.type,
          subtitle: n.message,
          link: `#`
        }))
      });
    }
  }

  return results;
}
