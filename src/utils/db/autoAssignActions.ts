"use server";

import { db } from './dbConfig';
import { Users, Reports } from './schema';
import { eq, inArray, and } from 'drizzle-orm';

/**
 * Automatically assigns collectors to pending reports based on their current workload
 * and simple location proximity (matching wards if available).
 */
export async function autoAssignCollectors(adminId: number) {
  try {
    // 1. Fetch all pending reports
    const pendingReports = await db
      .select()
      .from(Reports)
      .where(eq(Reports.status, "pending"))
      .execute();

    if (pendingReports.length === 0) {
      return { success: true, message: "No pending reports to assign.", assignedCount: 0 };
    }

    // 2. Fetch all collectors
    const collectors = await db
      .select({
        id: Users.id,
        wardNumber: Users.wardNumber
      })
      .from(Users)
      .where(eq(Users.role, "collector"))
      .execute();

    if (collectors.length === 0) {
      return { success: false, message: "No collectors available in the system.", assignedCount: 0 };
    }

    // 3. Get current workload for collectors (in_progress reports)
    const inProgressReports = await db
      .select({
        collectorId: Reports.collectorId
      })
      .from(Reports)
      .where(eq(Reports.status, "in_progress"))
      .execute();

    const workloadMap = new Map<number, number>();
    collectors.forEach(c => workloadMap.set(c.id, 0));
    inProgressReports.forEach(r => {
      if (r.collectorId && workloadMap.has(r.collectorId)) {
        workloadMap.set(r.collectorId, workloadMap.get(r.collectorId)! + 1);
      }
    });

    let assignedCount = 0;

    // 4. Assign logic
    // For each pending report, find the best collector.
    // Score based on: Workload (lower is better) and Ward Match (huge bonus)
    for (const report of pendingReports) {
      let bestCollectorId: number | null = null;
      let bestScore = -9999;

      for (const collector of collectors) {
        let score = 0;
        
        // Penalize heavily for existing workload to ensure round-robin distribution
        const workload = workloadMap.get(collector.id) || 0;
        score -= workload * 10;

        // Reward for same ward
        if (report.wardNumber && collector.wardNumber && report.wardNumber === collector.wardNumber) {
          score += 50;
        }

        if (score > bestScore) {
          bestScore = score;
          bestCollectorId = collector.id;
        }
      }

      if (bestCollectorId) {
        // Update the report
        await db
          .update(Reports)
          .set({ 
            collectorId: bestCollectorId,
            status: "in_progress" 
          })
          .where(eq(Reports.id, report.id))
          .execute();
        
        // Increase workload for that collector
        workloadMap.set(bestCollectorId, (workloadMap.get(bestCollectorId) || 0) + 1);
        assignedCount++;
      }
    }

    // Log the admin action
    const { ActivityLogs } = await import('./schema');
    await db.insert(ActivityLogs).values({
      userId: adminId,
      action: "AUTO_ASSIGN_TASKS",
      targetTable: "reports",
      details: JSON.stringify({ assignedCount }),
    }).execute();

    return { 
      success: true, 
      message: `Successfully assigned ${assignedCount} tasks to collectors via AI workload balancing.`, 
      assignedCount 
    };
  } catch (error) {
    console.error("Auto-assign error:", error);
    return { success: false, message: "An error occurred during auto-assignment.", assignedCount: 0 };
  }
}
