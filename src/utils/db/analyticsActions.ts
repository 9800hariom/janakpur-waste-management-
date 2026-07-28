"use server";

import { db } from './dbConfig';
import { Users, Reports, CollectedWastes, Transactions } from './schema';
import { eq, sql, and, desc } from 'drizzle-orm';

// ─────────────────────────────────────────
// ANALYTICS HELPER
// ─────────────────────────────────────────
function unixDaysAgo(days: number): number {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

// ─────────────────────────────────────────
// OVERVIEW STATS
// ─────────────────────────────────────────
export async function getAnalyticsOverview() {
  try {
    const [totalReports] = db.select({ count: sql<number>`count(*)` }).from(Reports).all();
    const [pendingReports] = db.select({ count: sql<number>`count(*)` }).from(Reports).where(eq(Reports.status, 'pending')).all();
    const [inProgressReports] = db.select({ count: sql<number>`count(*)` }).from(Reports).where(eq(Reports.status, 'in_progress')).all();
    const [verifiedReports] = db.select({ count: sql<number>`count(*)` }).from(Reports).where(eq(Reports.status, 'verified')).all();
    const [totalCitizens] = db.select({ count: sql<number>`count(*)` }).from(Users).where(eq(Users.role, 'citizen')).all();
    const [totalCollectors] = db.select({ count: sql<number>`count(*)` }).from(Users).where(eq(Users.role, 'collector')).all();

    const total = totalReports?.count || 0;
    const verified = verifiedReports?.count || 0;
    const aiSuccessRate = total > 0 ? Math.round((verified / total) * 100) : 0;

    // Average cleanup time in hours
    const avgCleanupRows = db.all<{ avg_hours: number }>(sql`
      SELECT AVG((collector_verified_at - created_at) / 3600.0) as avg_hours
      FROM reports
      WHERE collector_verified_at IS NOT NULL AND created_at IS NOT NULL
    `);
    const avgCleanupHours = Math.round(avgCleanupRows[0]?.avg_hours || 0);

    // Total estimated weight from verified reports
    const weightRows = db.select({ amount: Reports.amount }).from(Reports).where(eq(Reports.status, 'verified')).all();
    let totalWeightKg = 0;
    for (const row of weightRows) {
      const match = row.amount?.match(/[\d.]+/);
      if (match) totalWeightKg += parseFloat(match[0]);
    }
    const co2ReductionKg = Math.round(totalWeightKg * 0.5);

    // This month vs last month
    const now = new Date();
    const thisMonthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
    const lastMonthStart = Math.floor(new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime() / 1000);
    const lastMonthEnd = Math.floor(new Date(now.getFullYear(), now.getMonth(), 0).getTime() / 1000);

    const [thisMonthRow] = db.select({ count: sql<number>`count(*)` }).from(Reports)
      .where(sql`${Reports.createdAt} >= ${thisMonthStart}`).all();
    const [lastMonthRow] = db.select({ count: sql<number>`count(*)` }).from(Reports)
      .where(and(sql`${Reports.createdAt} >= ${lastMonthStart}`, sql`${Reports.createdAt} <= ${lastMonthEnd}`)).all();

    const thisMonth = thisMonthRow?.count || 0;
    const lastMonth = lastMonthRow?.count || 0;
    const growthPct = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : (thisMonth > 0 ? 100 : 0);

    return {
      totalReports: total,
      pendingReports: pendingReports?.count || 0,
      inProgressReports: inProgressReports?.count || 0,
      verifiedReports: verified,
      totalCitizens: totalCitizens?.count || 0,
      totalCollectors: totalCollectors?.count || 0,
      aiSuccessRate,
      avgCleanupHours,
      totalWeightKg: Math.round(totalWeightKg),
      co2ReductionKg,
      thisMonthReports: thisMonth,
      lastMonthReports: lastMonth,
      growthPct,
    };
  } catch (error) {
    console.error("Error getAnalyticsOverview:", error);
    return null;
  }
}

// ─────────────────────────────────────────
// DAILY REPORTS
// ─────────────────────────────────────────
export async function getDailyReports(days: number = 30) {
  try {
    const rows = db.all<{ day: string; total: number; verified: number; pending: number }>(sql`
      SELECT 
        date(created_at, 'unixepoch') as day,
        count(*) as total,
        sum(case when status = 'verified' then 1 else 0 end) as verified,
        sum(case when status = 'pending' then 1 else 0 end) as pending
      FROM reports
      WHERE created_at >= ${unixDaysAgo(days)}
      GROUP BY day
      ORDER BY day ASC
    `);
    return rows;
  } catch (error) {
    console.error("Error getDailyReports:", error);
    return [];
  }
}

// ─────────────────────────────────────────
// WEEKLY REPORTS
// ─────────────────────────────────────────
export async function getWeeklyReports(weeks: number = 12) {
  try {
    const rows = db.all<{ week: string; total: number; verified: number; pending: number }>(sql`
      SELECT 
        strftime('%Y-W%W', created_at, 'unixepoch') as week,
        count(*) as total,
        sum(case when status = 'verified' then 1 else 0 end) as verified,
        sum(case when status = 'pending' then 1 else 0 end) as pending
      FROM reports
      WHERE created_at >= ${unixDaysAgo(weeks * 7)}
      GROUP BY week
      ORDER BY week ASC
    `);
    return rows;
  } catch (error) {
    console.error("Error getWeeklyReports:", error);
    return [];
  }
}

// ─────────────────────────────────────────
// MONTHLY REPORTS
// ─────────────────────────────────────────
export async function getMonthlyReports(months: number = 12) {
  try {
    const rows = db.all<{ month: string; total: number; verified: number; pending: number }>(sql`
      SELECT 
        strftime('%Y-%m', created_at, 'unixepoch') as month,
        count(*) as total,
        sum(case when status = 'verified' then 1 else 0 end) as verified,
        sum(case when status = 'pending' then 1 else 0 end) as pending
      FROM reports
      WHERE created_at >= ${unixDaysAgo(months * 30)}
      GROUP BY month
      ORDER BY month ASC
    `);
    return rows;
  } catch (error) {
    console.error("Error getMonthlyReports:", error);
    return [];
  }
}

// ─────────────────────────────────────────
// YEARLY REPORTS
// ─────────────────────────────────────────
export async function getYearlyReports() {
  try {
    const rows = db.all<{ year: string; total: number; verified: number; pending: number }>(sql`
      SELECT 
        strftime('%Y', created_at, 'unixepoch') as year,
        count(*) as total,
        sum(case when status = 'verified' then 1 else 0 end) as verified,
        sum(case when status = 'pending' then 1 else 0 end) as pending
      FROM reports
      GROUP BY year
      ORDER BY year ASC
    `);
    return rows;
  } catch (error) {
    console.error("Error getYearlyReports:", error);
    return [];
  }
}

// ─────────────────────────────────────────
// WASTE BY CATEGORY
// ─────────────────────────────────────────
export async function getWasteByCategory() {
  try {
    const rows = db.all<{ category: string; total: number; verified: number; pending: number }>(sql`
      SELECT 
        waste_type as category,
        count(*) as total,
        sum(case when status = 'verified' then 1 else 0 end) as verified,
        sum(case when status = 'pending' then 1 else 0 end) as pending
      FROM reports
      GROUP BY waste_type
      ORDER BY total DESC
      LIMIT 20
    `);
    return rows;
  } catch (error) {
    console.error("Error getWasteByCategory:", error);
    return [];
  }
}

// ─────────────────────────────────────────
// ORGANIC VS PLASTIC
// ─────────────────────────────────────────
export async function getOrganicVsPlasticDistribution() {
  try {
    const rows = db.all<{ category: string; count: number }>(sql`
      SELECT 
        CASE 
          WHEN lower(waste_type) LIKE '%organic%' OR lower(waste_type) LIKE '%food%' OR lower(waste_type) LIKE '%biodegrad%' THEN 'Organic'
          WHEN lower(waste_type) LIKE '%plastic%' OR lower(waste_type) LIKE '%polythene%' THEN 'Plastic'
          WHEN lower(waste_type) LIKE '%paper%' OR lower(waste_type) LIKE '%cardboard%' THEN 'Paper'
          WHEN lower(waste_type) LIKE '%metal%' OR lower(waste_type) LIKE '%iron%' OR lower(waste_type) LIKE '%aluminum%' THEN 'Metal'
          WHEN lower(waste_type) LIKE '%glass%' THEN 'Glass'
          WHEN lower(waste_type) LIKE '%e-waste%' OR lower(waste_type) LIKE '%electronic%' THEN 'E-Waste'
          WHEN lower(waste_type) LIKE '%hazard%' OR lower(waste_type) LIKE '%medical%' THEN 'Hazardous'
          ELSE 'Other'
        END as category,
        count(*) as count
      FROM reports
      GROUP BY category
      ORDER BY count DESC
    `);
    return rows;
  } catch (error) {
    console.error("Error getOrganicVsPlasticDistribution:", error);
    return [];
  }
}

// ─────────────────────────────────────────
// RECYCLING PERCENTAGE
// ─────────────────────────────────────────
export async function getRecyclingPercentage() {
  try {
    const rows = db.all<{ total: number; recyclable: number }>(sql`
      SELECT 
        count(*) as total,
        sum(case when lower(waste_type) LIKE '%plastic%' OR lower(waste_type) LIKE '%paper%' OR lower(waste_type) LIKE '%metal%' OR lower(waste_type) LIKE '%glass%' THEN 1 ELSE 0 end) as recyclable
      FROM reports
      WHERE status = 'verified'
    `);
    const total = rows[0]?.total || 0;
    const recyclable = rows[0]?.recyclable || 0;
    const percentage = total > 0 ? Math.round((recyclable / total) * 100) : 0;
    return { total, recyclable, percentage };
  } catch (error) {
    console.error("Error getRecyclingPercentage:", error);
    return { total: 0, recyclable: 0, percentage: 0 };
  }
}

// ─────────────────────────────────────────
// DUPLICATE PERCENTAGE
// ─────────────────────────────────────────
export async function getDuplicatePercentage() {
  try {
    const totalRows = db.all<{ total: number }>(sql`SELECT count(*) as total FROM reports`);
    const dupRows = db.all<{ dups: number }>(sql`
      SELECT count(*) as dups FROM (
        SELECT location, waste_type, count(*) as cnt
        FROM reports
        GROUP BY location, waste_type
        HAVING cnt > 1
      )
    `);
    const total = totalRows[0]?.total || 0;
    const dups = dupRows[0]?.dups || 0;
    const percentage = total > 0 ? Math.round((dups / total) * 100) : 0;
    return { total, duplicates: dups, percentage };
  } catch (error) {
    console.error("Error getDuplicatePercentage:", error);
    return { total: 0, duplicates: 0, percentage: 0 };
  }
}

// ─────────────────────────────────────────
// WARD-WISE ANALYTICS
// ─────────────────────────────────────────
export async function getWardWiseAnalytics() {
  try {
    const rows = db.all<{
      ward: string; total: number; verified: number;
      pending: number; in_progress: number; completion_rate: number;
    }>(sql`
      SELECT 
        COALESCE(ward_number, 'Unknown') as ward,
        count(*) as total,
        sum(case when status = 'verified' then 1 else 0 end) as verified,
        sum(case when status = 'pending' then 1 else 0 end) as pending,
        sum(case when status = 'in_progress' then 1 else 0 end) as in_progress,
        ROUND(100.0 * sum(case when status = 'verified' then 1 else 0 end) / count(*), 1) as completion_rate
      FROM reports
      GROUP BY ward
      ORDER BY total DESC
      LIMIT 20
    `);
    return rows;
  } catch (error) {
    console.error("Error getWardWiseAnalytics:", error);
    return [];
  }
}

// ─────────────────────────────────────────
// TOP REPORTING WARDS
// ─────────────────────────────────────────
export async function getTopReportingWards(limit: number = 10) {
  try {
    const rows = db.all<{ ward: string; reports: number }>(sql`
      SELECT 
        COALESCE(ward_number, 'Unknown') as ward,
        count(*) as reports
      FROM reports
      GROUP BY ward
      ORDER BY reports DESC
      LIMIT ${limit}
    `);
    return rows;
  } catch (error) {
    console.error("Error getTopReportingWards:", error);
    return [];
  }
}

// ─────────────────────────────────────────
// MOST ACTIVE CITIZENS
// ─────────────────────────────────────────
export async function getMostActiveCitizens(limit: number = 10) {
  try {
    const rows = db.all<{ name: string; ward: string; reports: number; verified: number }>(sql`
      SELECT 
        u.name,
        u.ward_number as ward,
        count(r.id) as reports,
        sum(case when r.status = 'verified' then 1 else 0 end) as verified
      FROM reports r
      JOIN users u ON r.user_id = u.id
      WHERE u.role = 'citizen'
      GROUP BY u.id, u.name, u.ward_number
      ORDER BY reports DESC
      LIMIT ${limit}
    `);
    return rows;
  } catch (error) {
    console.error("Error getMostActiveCitizens:", error);
    return [];
  }
}

// ─────────────────────────────────────────
// COLLECTOR PERFORMANCE
// ─────────────────────────────────────────
export async function getCollectorPerformance(limit: number = 10) {
  try {
    const rows = db.all<{
      name: string; tasks_accepted: number; tasks_completed: number;
      completion_rate: number; avg_hours: number;
    }>(sql`
      SELECT 
        u.name,
        count(r.id) as tasks_accepted,
        sum(case when r.status = 'verified' then 1 else 0 end) as tasks_completed,
        ROUND(100.0 * sum(case when r.status = 'verified' then 1 else 0 end) / max(count(r.id), 1), 1) as completion_rate,
        ROUND(AVG(CASE WHEN r.collector_verified_at IS NOT NULL THEN (r.collector_verified_at - r.created_at) / 3600.0 ELSE NULL END), 1) as avg_hours
      FROM reports r
      JOIN users u ON r.collector_id = u.id
      WHERE u.role = 'collector'
      GROUP BY u.id, u.name
      ORDER BY tasks_completed DESC
      LIMIT ${limit}
    `);
    return rows;
  } catch (error) {
    console.error("Error getCollectorPerformance:", error);
    return [];
  }
}

// ─────────────────────────────────────────
// CITIZEN GROWTH
// ─────────────────────────────────────────
export async function getCitizenGrowth(months: number = 12) {
  try {
    const rows = db.all<{ month: string; new_citizens: number }>(sql`
      SELECT 
        strftime('%Y-%m', created_at, 'unixepoch') as month,
        count(*) as new_citizens
      FROM users
      WHERE role = 'citizen'
      AND created_at >= ${unixDaysAgo(months * 30)}
      GROUP BY month
      ORDER BY month ASC
    `);
    return rows;
  } catch (error) {
    console.error("Error getCitizenGrowth:", error);
    return [];
  }
}

// ─────────────────────────────────────────
// LOCATION VERIFICATION STATS
// ─────────────────────────────────────────
export async function getLocationVerificationStats() {
  try {
    const rows = db.all<{
      total_with_gps: number; location_verified: number;
      location_failed: number; avg_distance_meters: number;
    }>(sql`
      SELECT 
        count(*) as total_with_gps,
        sum(case when location_verified = 1 then 1 else 0 end) as location_verified,
        sum(case when location_verified = 0 AND collector_lat IS NOT NULL then 1 else 0 end) as location_failed,
        ROUND(AVG(distance_meters), 0) as avg_distance_meters
      FROM reports
      WHERE collector_lat IS NOT NULL
    `);
    return rows[0] || { total_with_gps: 0, location_verified: 0, location_failed: 0, avg_distance_meters: 0 };
  } catch (error) {
    console.error("Error getLocationVerificationStats:", error);
    return { total_with_gps: 0, location_verified: 0, location_failed: 0, avg_distance_meters: 0 };
  }
}

// ─────────────────────────────────────────
// FULL ANALYTICS (all in one)
// ─────────────────────────────────────────
export async function getFullAnalytics(filters?: { days?: number }) {
  try {
    const [
      overview,
      dailyReports,
      weeklyReports,
      monthlyReports,
      yearlyReports,
      wasteByCategory,
      organicVsPlastic,
      recycling,
      duplicates,
      wardAnalytics,
      topWards,
      activeCitizens,
      collectorPerf,
      citizenGrowth,
      locationStats,
    ] = await Promise.all([
      getAnalyticsOverview(),
      getDailyReports(filters?.days || 30),
      getWeeklyReports(12),
      getMonthlyReports(12),
      getYearlyReports(),
      getWasteByCategory(),
      getOrganicVsPlasticDistribution(),
      getRecyclingPercentage(),
      getDuplicatePercentage(),
      getWardWiseAnalytics(),
      getTopReportingWards(10),
      getMostActiveCitizens(10),
      getCollectorPerformance(10),
      getCitizenGrowth(12),
      getLocationVerificationStats(),
    ]);

    return {
      overview, dailyReports, weeklyReports, monthlyReports, yearlyReports,
      wasteByCategory, organicVsPlastic, recycling, duplicates,
      wardAnalytics, topWards, activeCitizens, collectorPerf, citizenGrowth, locationStats,
    };
  } catch (error) {
    console.error("Error getFullAnalytics:", error);
    return null;
  }
}
