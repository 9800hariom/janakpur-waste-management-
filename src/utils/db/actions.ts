"use server";

import { db } from './dbConfig';
import { Users, Reports, Rewards, CollectedWastes, Notifications, Transactions, AiVerificationHistory } from './schema';
import { eq, sql, and, desc, ne } from 'drizzle-orm';
import bcryptjs from 'bcryptjs';
const bcrypt = (bcryptjs as any).default || bcryptjs;

// ─────────────────────────────────────────
// Haversine distance in meters
// ─────────────────────────────────────────
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// ─────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────
export async function createUser(email: string, name: string, password?: string) {
  try {
    const [user] = await db.insert(Users).values({ email, name, password }).returning().execute();
    return user;
  } catch (error) {
    console.error("Error creating user:", error);
    return null;
  }
}

export async function getUserByEmail(email: string) {
  try {
    let [user] = await db.select().from(Users).where(eq(Users.email, email)).execute();
    if (!user && (email === 'admin@greenjanakpur.com' || email === 'admin@green janakpur waste management.com')) {
      const passwordHash = await bcrypt.hash('Admin@123', 10);
      [user] = await db.insert(Users).values({
        email: 'admin@greenjanakpur.com',
        name: 'Admin Admin',
        fullName: 'Admin Admin',
        password: passwordHash,
        role: 'admin',
        address: 'HQ',
        wardNumber: '1',
        phone: '1234567890',
        status: 'active',
        rewardPoints: 0,
      }).returning().execute();
    }
    return user;
  } catch (error) {
    console.error("Error fetching user by email:", error);
    return null;
  }
}

// ─────────────────────────────────────────
// REPORTS
// ─────────────────────────────────────────
export async function createReport(
  userId: number,
  location: string,
  wasteType: string,
  amount: string,
  imageUrl?: string,
  verificationResult?: any,
  latitude?: number,
  longitude?: number,
  formattedAddress?: string,
  wardNumber?: string
) {
  try {
    const [report] = await db
      .insert(Reports)
      .values({
        userId,
        location,
        wasteType,
        amount,
        imageUrl,
        verificationResult,
        status: "pending",
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        formattedAddress: formattedAddress ?? null,
        wardNumber: wardNumber ?? null,
      })
      .returning()
      .execute();

    if (verificationResult) {
      await db.insert(AiVerificationHistory).values({
        reportId: report.id,
        checkerId: userId,
        checkType: 'citizen_report',
        fullResult: verificationResult,
        imageUrl: imageUrl || null,
        verificationStatus: verificationResult.verificationStatus || 'Verified',
        finalDecision: verificationResult.finalDecision || 'Accept Report',
      }).execute();
    }

    // Notify citizen: report received
    await createNotification(userId, "Waste report submitted successfully. Points will be awarded after verification.", "info");

    // Notify admins
    const admins = await db.select().from(Users).where(eq(Users.role, 'admin')).execute();
    for (const admin of admins) {
      await createNotification(admin.id, "New Waste Report Submitted", "info");
    }

    return report;
  } catch (error) {
    console.error("Error creating report:", error);
    return null;
  }
}

export async function getReportsByUserId(userId: number) {
  try {
    const reports = await db.select().from(Reports).where(eq(Reports.userId, userId)).execute();
    return reports;
  } catch (error) {
    console.error("Error fetching reports:", error);
    return [];
  }
}

export async function getPendingReports() {
  try {
    return await db.select().from(Reports).where(eq(Reports.status, "pending")).execute();
  } catch (error) {
    console.error("Error fetching pending reports:", error);
    return [];
  }
}

export async function updateReportStatus(reportId: number, status: string) {
  try {
    const [updatedReport] = await db
      .update(Reports)
      .set({ status })
      .where(eq(Reports.id, reportId))
      .returning()
      .execute();
    return updatedReport;
  } catch (error) {
    console.error("Error updating report status:", error);
    return null;
  }
}

export async function getRecentReports(limit: number = 10) {
  try {
    const reports = await db
      .select()
      .from(Reports)
      .orderBy(desc(Reports.createdAt))
      .limit(limit)
      .execute();
    return reports;
  } catch (error) {
    console.error("Error fetching recent reports:", error);
    return [];
  }
}

export async function getWasteCollectionTasks(limit: number = 50) {
  try {
    const tasks = await db
      .select({
        id: Reports.id,
        userId: Reports.userId,
        location: Reports.location,
        latitude: Reports.latitude,
        longitude: Reports.longitude,
        formattedAddress: Reports.formattedAddress,
        wardNumber: Reports.wardNumber,
        wasteType: Reports.wasteType,
        amount: Reports.amount,
        status: Reports.status,
        date: Reports.createdAt,
        collectorId: Reports.collectorId,
        imageUrl: Reports.imageUrl,
        locationVerified: Reports.locationVerified,
        distanceMeters: Reports.distanceMeters,
      })
      .from(Reports)
      .limit(limit)
      .execute();

    return tasks.map(task => ({
      ...task,
      date: task.date instanceof Date
        ? task.date.toISOString().split('T')[0]
        : (task.date ? new Date(task.date as any).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
    }));
  } catch (error) {
    console.error("Error fetching waste collection tasks:", error);
    return [];
  }
}

// ─────────────────────────────────────────
// TASK STATUS — with Collector GPS Validation
// MAX_ALLOWED_DISTANCE_METERS: 100m
// ─────────────────────────────────────────
const MAX_ALLOWED_DISTANCE_METERS = 100;

export async function updateTaskStatus(reportId: number, newStatus: string, collectorId?: number) {
  try {
    const updateData: any = { status: newStatus };
    if (collectorId !== undefined) {
      updateData.collectorId = collectorId;
    }
    const [updatedReport] = await db
      .update(Reports)
      .set(updateData)
      .where(eq(Reports.id, reportId))
      .returning()
      .execute();

    if (updatedReport) {
      if (newStatus === 'in_progress') {
        // Notify citizen: collector assigned
        await createNotification(updatedReport.userId, "A collector has accepted your waste report and is on the way.", "info");
        if (collectorId) {
          await createNotification(collectorId, "New task assigned. Navigate to the reported location.", "info");
        }
      } else if (newStatus === 'verified') {
        // ──── CITIZEN gets +20 reward points after verification ────
        await updateRewardPoints(updatedReport.userId, 20);
        await createTransaction(updatedReport.userId, 'earned_report_verified', 20, 'Points earned for verified waste report');
        await createNotification(updatedReport.userId, "Your waste report has been verified! You earned 20 points.", "reward");
        await createNotification(updatedReport.userId, "Cleanup verified successfully.", "info");

        // ──── NO collector reward points — collectors manage tasks only ────

        // Notify admins
        const admins = await db.select().from(Users).where(eq(Users.role, 'admin')).execute();
        for (const admin of admins) {
          await createNotification(admin.id, `Collector completed Task #${reportId}`, 'info');
        }
      }
    }
    return updatedReport;
  } catch (error) {
    console.error("Error updating task status:", error);
    throw error;
  }
}

/**
 * Update task status with collector GPS validation.
 * Returns { success, error, distanceMeters, updatedReport }
 */
export async function updateTaskStatusWithLocation(
  reportId: number,
  newStatus: string,
  collectorId: number,
  collectorLat: number,
  collectorLng: number
): Promise<{ success: boolean; error?: string; distanceMeters?: number; updatedReport?: any }> {
  try {
    // Get report GPS
    const [report] = await db.select().from(Reports).where(eq(Reports.id, reportId)).execute();
    if (!report) return { success: false, error: 'report_not_found' };

    // If report has GPS, enforce proximity check
    if (report.latitude !== null && report.longitude !== null) {
      const distance = haversineDistance(
        report.latitude!, report.longitude!,
        collectorLat, collectorLng
      );

    if (newStatus === 'verified' || newStatus === 'completed') {
      if (distance > MAX_ALLOWED_DISTANCE_METERS) {
        return { success: false, error: 'too_far', distanceMeters: distance };
      }
    }

      // Save collector GPS and distance
      await db.update(Reports).set({
        collectorLat,
        collectorLng,
        collectorVerifiedAt: new Date(),
        locationVerified: distance <= MAX_ALLOWED_DISTANCE_METERS,
        distanceMeters: distance,
      }).where(eq(Reports.id, reportId)).execute();
    } else {
      // No GPS on report — save collector coords but skip distance check
      await db.update(Reports).set({
        collectorLat,
        collectorLng,
        collectorVerifiedAt: new Date(),
        locationVerified: false,
        distanceMeters: null,
      }).where(eq(Reports.id, reportId)).execute();
    }

    const updatedReport = await updateTaskStatus(reportId, newStatus, collectorId);
    return { success: true, updatedReport };
  } catch (error) {
    console.error("Error in updateTaskStatusWithLocation:", error);
    throw error;
  }
}

/**
 * Check if an uploaded image is a duplicate of any existing report image or verification history image in DB.
 */
export async function checkDuplicateImageInDb(imageBase64: string, currentReportId?: number): Promise<{
  isDuplicate: boolean;
  duplicateOfId?: number;
  reason?: string;
}> {
  try {
    if (!imageBase64 || imageBase64.length < 100) {
      return { isDuplicate: false };
    }

    // Extract core payload if data URI
    const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const sampleHash = cleanBase64.slice(0, 500); // quick prefix matching

    // Check existing reports
    const reports = await db.select({
      id: Reports.id,
      imageUrl: Reports.imageUrl,
    }).from(Reports).execute();

    for (const report of reports) {
      if (currentReportId && report.id === currentReportId) continue;
      if (!report.imageUrl) continue;

      const reportClean = report.imageUrl.includes(',') ? report.imageUrl.split(',')[1] : report.imageUrl;

      // Exact match or high prefix similarity
      if (cleanBase64 === reportClean || (cleanBase64.length > 500 && reportClean.startsWith(sampleHash))) {
        return {
          isDuplicate: true,
          duplicateOfId: report.id,
          reason: `Exact or highly identical image match found with Report #${report.id}.`,
        };
      }
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error("Error checking duplicate image in DB:", error);
    return { isDuplicate: false };
  }
}

// ─────────────────────────────────────────
// COLLECTED WASTES
// ─────────────────────────────────────────
export async function createCollectedWaste(reportId: number, collectorId: number) {
  try {
    const [collectedWaste] = await db
      .insert(CollectedWastes)
      .values({ reportId, collectorId, collectionDate: new Date() })
      .returning()
      .execute();
    return collectedWaste;
  } catch (error) {
    console.error("Error creating collected waste:", error);
    return null;
  }
}

export async function getCollectedWastesByCollector(collectorId: number) {
  try {
    return await db.select().from(CollectedWastes).where(eq(CollectedWastes.collectorId, collectorId)).execute();
  } catch (error) {
    console.error("Error fetching collected wastes:", error);
    return [];
  }
}

export async function saveCollectedWaste(reportId: number, collectorId: number, verificationResult: any, cleanupImageUrl?: string) {
  try {
    const [collectedWaste] = await db
      .insert(CollectedWastes)
      .values({ reportId, collectorId, collectionDate: new Date(), status: 'verified' })
      .returning()
      .execute();

    if (verificationResult) {
      await db.update(Reports)
        .set({ verificationResult })
        .where(eq(Reports.id, reportId))
        .execute();

      const isDifferentLoc = verificationResult.isDifferentLocation || verificationResult.matchedLocation === 'Not Matched';

      const verStatus = verificationResult.isDuplicateImage 
        ? 'Duplicate Image' 
        : (!verificationResult.isClean && verificationResult.wasteStillVisible)
        ? 'Unclean Waste Present'
        : isDifferentLoc
        ? 'Suspicious / Unmatched Image'
        : (verificationResult.verificationStatus || (verificationResult.verified ? 'Verified' : 'Rejected'));

      const finalDec = verificationResult.isDuplicateImage 
        ? 'Reject Report - Duplicate Image'
        : (!verificationResult.isClean && verificationResult.wasteStillVisible)
        ? 'Reject Report - Waste Still Present'
        : isDifferentLoc
        ? 'Needs Manual Inspector Visit'
        : (verificationResult.finalDecision || (verificationResult.verified ? 'Accept Report' : 'Reject Report'));

      await db.insert(AiVerificationHistory).values({
        reportId,
        checkerId: collectorId,
        checkType: 'collector_verify',
        fullResult: verificationResult,
        imageUrl: cleanupImageUrl || null,
        verificationStatus: verStatus,
        finalDecision: finalDec,
      }).execute();
    }

    return collectedWaste;
  } catch (error) {
    console.error("Error saving collected waste:", error);
    throw error;
  }
}

// ─────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────
export async function createNotification(userId: number, message: string, type: string) {
  try {
    const [notification] = await db
      .insert(Notifications)
      .values({ userId, message, type })
      .returning()
      .execute();
    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    return null;
  }
}

export async function getUnreadNotifications(userId: number) {
  try {
    return await db.select().from(Notifications).where(
      and(eq(Notifications.userId, userId), eq(Notifications.isRead, false))
    ).execute();
  } catch (error) {
    console.error("Error fetching unread notifications:", error);
    return [];
  }
}

export async function markNotificationAsRead(notificationId: number) {
  try {
    await db.update(Notifications).set({ isRead: true }).where(eq(Notifications.id, notificationId)).execute();
  } catch (error) {
    console.error("Error marking notification as read:", error);
  }
}

// ─────────────────────────────────────────
// REWARDS — Citizens Only
// ─────────────────────────────────────────
export async function getOrCreateReward(userId: number) {
  try {
    let [reward] = await db.select().from(Rewards).where(eq(Rewards.userId, userId)).execute();
    if (!reward) {
      [reward] = await db.insert(Rewards).values({
        userId,
        name: 'Default Reward',
        collectionInfo: 'Default Collection Info',
        points: 0,
        level: 1,
        isAvailable: true,
      }).returning().execute();
    }
    return reward;
  } catch (error) {
    console.error("Error getting or creating reward:", error);
    return null;
  }
}

export async function updateRewardPoints(userId: number, pointsToAdd: number) {
  try {
    // Only update citizens' reward points
    const [userRecord] = await db.select().from(Users).where(eq(Users.id, userId)).execute();
    if (!userRecord || userRecord.role === 'collector') return null;

    const [updatedReward] = await db
      .update(Rewards)
      .set({ points: sql`${Rewards.points} + ${pointsToAdd}`, updatedAt: new Date() })
      .where(eq(Rewards.userId, userId))
      .returning()
      .execute();

    await db
      .update(Users)
      .set({ rewardPoints: sql`${Users.rewardPoints} + ${pointsToAdd}`, updatedAt: new Date() })
      .where(eq(Users.id, userId))
      .execute();

    return updatedReward;
  } catch (error) {
    console.error("Error updating reward points:", error);
    return null;
  }
}

// Leaderboard — Citizens only, ranked by rewardPoints
export async function getAllRewards() {
  try {
    const rewards = await db
      .select({
        id: Rewards.id,
        userId: Rewards.userId,
        points: Rewards.points,
        level: Rewards.level,
        createdAt: Rewards.createdAt,
        userName: Users.name,
        role: Users.role,
      })
      .from(Rewards)
      .leftJoin(Users, eq(Rewards.userId, Users.id))
      .where(eq(Users.role, 'citizen'))
      .orderBy(desc(Rewards.points))
      .execute();

    return rewards;
  } catch (error) {
    console.error("Error fetching all rewards:", error);
    return [];
  }
}

export async function getRewardTransactions(userId: number) {
  try {
    const transactions = await db
      .select({
        id: Transactions.id,
        type: Transactions.type,
        amount: Transactions.amount,
        description: Transactions.description,
        date: Transactions.date,
      })
      .from(Transactions)
      .where(eq(Transactions.userId, userId))
      .orderBy(desc(Transactions.date))
      .limit(20)
      .execute();

    return transactions.map(t => ({
      ...t,
      date: t.date instanceof Date
        ? t.date.toISOString().split('T')[0]
        : (t.date ? new Date(t.date as any).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
    }));
  } catch (error) {
    console.error("Error fetching reward transactions:", error);
    return [];
  }
}

export async function getAvailableRewards(userId: number) {
  try {
    const userTransactions = await getRewardTransactions(userId);
    const userPoints = userTransactions.reduce((total, t) => {
      return t.type.startsWith('earned') ? total + t.amount : total - t.amount;
    }, 0);

    const dbRewards = await db
      .select({
        id: Rewards.id,
        name: Rewards.name,
        cost: Rewards.points,
        description: Rewards.description,
        collectionInfo: Rewards.collectionInfo,
      })
      .from(Rewards)
      .where(eq(Rewards.isAvailable, true))
      .execute();

    return [
      { id: 0, name: "Your Points", cost: userPoints, description: "Redeem your earned points", collectionInfo: "Points earned from verified waste reports" },
      ...dbRewards,
    ];
  } catch (error) {
    console.error("Error fetching available rewards:", error);
    return [];
  }
}

export async function createTransaction(userId: number, type: string, amount: number, description: string) {
  try {
    const [transaction] = await db
      .insert(Transactions)
      .values({ userId, type, amount, description })
      .returning()
      .execute();
    return transaction;
  } catch (error) {
    console.error("Error creating transaction:", error);
    throw error;
  }
}

export async function redeemReward(userId: number, rewardId: number) {
  try {
    const userReward = await getOrCreateReward(userId) as any;

    if (rewardId === 0) {
      await db.update(Rewards).set({ points: 0, updatedAt: new Date() }).where(eq(Rewards.userId, userId)).returning().execute();
      await createTransaction(userId, 'redeemed', userReward.points, `Redeemed all points: ${userReward.points}`);
      return { success: true };
    } else {
      const availableReward = await db.select().from(Rewards).where(eq(Rewards.id, rewardId)).execute();
      if (!userReward || !availableReward[0] || userReward.points < availableReward[0].points) {
        throw new Error("Insufficient points or invalid reward");
      }
      const [updatedReward] = await db.update(Rewards)
        .set({ points: sql`${Rewards.points} - ${availableReward[0].points}`, updatedAt: new Date() })
        .where(eq(Rewards.userId, userId))
        .returning()
        .execute();
      await createTransaction(userId, 'redeemed', availableReward[0].points, `Redeemed: ${availableReward[0].name}`);
      return updatedReward;
    }
  } catch (error) {
    console.error("Error redeeming reward:", error);
    throw error;
  }
}

export async function getUserBalance(userId: number): Promise<number> {
  const transactions = await getRewardTransactions(userId);
  const balance = transactions.reduce((acc, t) => {
    return t.type.startsWith('earned') ? acc + t.amount : acc - t.amount;
  }, 0);
  return Math.max(balance, 0);
}

// ─────────────────────────────────────────
// DAILY LOGIN — Citizens only
// ─────────────────────────────────────────
export async function checkDailyLogin(userId: number) {
  try {
    // Verify user is a citizen
    const [userRecord] = await db.select().from(Users).where(eq(Users.id, userId)).execute();
    if (!userRecord || userRecord.role !== 'citizen') {
      return { claimed: false, points: 0 };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await db
      .select()
      .from(Transactions)
      .where(and(
        eq(Transactions.userId, userId),
        eq(Transactions.type, 'daily_login'),
        sql`${Transactions.date} >= ${today.getTime() / 1000}`
      ))
      .execute();

    if (existing.length === 0) {
      await updateRewardPoints(userId, 5);
      await createTransaction(userId, 'daily_login', 5, 'Daily login reward');
      await createNotification(userId, 'Daily login bonus! You earned 5 points.', 'reward');
      return { claimed: true, points: 5 };
    }
    return { claimed: false, points: 0 };
  } catch (error) {
    console.error("Error checkDailyLogin:", error);
    return { claimed: false, points: 0 };
  }
}

// ─────────────────────────────────────────
// REFERRAL — Citizens only
// ─────────────────────────────────────────
export async function claimReferral(userId: number, referralEmail: string) {
  try {
    const referee = await getUserByEmail(referralEmail);
    if (!referee || referee.id === userId) {
      return { success: false, message: "Invalid referral email." };
    }

    const existing = await db
      .select()
      .from(Transactions)
      .where(and(eq(Transactions.userId, userId), eq(Transactions.type, 'referral_claimed')))
      .execute();

    if (existing.length > 0) {
      return { success: false, message: "You have already claimed a referral." };
    }

    await updateRewardPoints(referee.id, 100);
    await createTransaction(referee.id, 'referral_reward', 100, 'Points earned from referral');
    await createNotification(referee.id, 'You earned 100 points from a referral!', 'reward');
    await createTransaction(userId, 'referral_claimed', 0, `Used referral from ${referralEmail}`);

    return { success: true, message: "Referral applied! 100 points awarded to your friend." };
  } catch (error) {
    console.error("Error claimReferral:", error);
    return { success: false, message: "Error applying referral." };
  }
}

// ─────────────────────────────────────────
// USER ACHIEVEMENTS — Citizens
// ─────────────────────────────────────────
export async function getUserAchievements(userId: number) {
  try {
    const [reportsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(Reports)
      .where(eq(Reports.userId, userId))
      .execute();

    const reward = await getOrCreateReward(userId);
    const points = reward?.points || 0;
    const level = reward?.level || 1;

    const allCitizenRewards = await db
      .select({ userId: Rewards.userId })
      .from(Rewards)
      .leftJoin(Users, eq(Rewards.userId, Users.id))
      .where(eq(Users.role, 'citizen'))
      .orderBy(desc(Rewards.points))
      .execute();

    const rank = allCitizenRewards.findIndex(r => r.userId === userId) + 1 || 0;

    return {
      reportsCount: reportsCount?.count || 0,
      collectionsCount: 0,
      points,
      level,
      rank,
    };
  } catch (error) {
    console.error("Error fetching user achievements:", error);
    return null;
  }
}

// ─────────────────────────────────────────
// ADMIN STATS
// ─────────────────────────────────────────
export async function getAdminStats() {
  try {
    const [usersCount] = await db.select({ count: sql<number>`count(*)` }).from(Users).execute();
    const [reportsCount] = await db.select({ count: sql<number>`count(*)` }).from(Reports).execute();
    const [pendingCount] = await db.select({ count: sql<number>`count(*)` }).from(Reports).where(eq(Reports.status, 'pending')).execute();
    const [verifiedCount] = await db.select({ count: sql<number>`count(*)` }).from(Reports).where(eq(Reports.status, 'verified')).execute();
    const [citizenCount] = await db.select({ count: sql<number>`count(*)` }).from(Users).where(eq(Users.role, 'citizen')).execute();
    const [collectorCount] = await db.select({ count: sql<number>`count(*)` }).from(Users).where(eq(Users.role, 'collector')).execute();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [todaysReports] = await db
      .select({ count: sql<number>`count(*)` })
      .from(Reports)
      .where(sql`${Reports.createdAt} >= ${today.getTime() / 1000}`)
      .execute();

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const [monthlyReports] = await db
      .select({ count: sql<number>`count(*)` })
      .from(Reports)
      .where(sql`${Reports.createdAt} >= ${thirtyDaysAgo.getTime() / 1000}`)
      .execute();

    return {
      usersCount: usersCount?.count || 0,
      reportsCount: reportsCount?.count || 0,
      pendingCount: pendingCount?.count || 0,
      verifiedCount: verifiedCount?.count || 0,
      citizenCount: citizenCount?.count || 0,
      collectorCount: collectorCount?.count || 0,
      collectorsCount: collectorCount?.count || 0,
      rewardsCount: 0,
      todaysReports: todaysReports?.count || 0,
      monthlyReports: monthlyReports?.count || 0,
    };
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    return null;
  }
}

export async function getAllUsers() {
  try {
    return await db.select().from(Users).execute();
  } catch (error) {
    console.error("Error fetching all users:", error);
    return [];
  }
}

export async function getAllReportsDetailed() {
  try {
    const reports = await db
      .select({
        id: Reports.id,
        userId: Reports.userId,
        location: Reports.location,
        latitude: Reports.latitude,
        longitude: Reports.longitude,
        formattedAddress: Reports.formattedAddress,
        wardNumber: Reports.wardNumber,
        wasteType: Reports.wasteType,
        amount: Reports.amount,
        imageUrl: Reports.imageUrl,
        verificationResult: Reports.verificationResult,
        status: Reports.status,
        createdAt: Reports.createdAt,
        collectorId: Reports.collectorId,
        collectorLat: Reports.collectorLat,
        collectorLng: Reports.collectorLng,
        collectorVerifiedAt: Reports.collectorVerifiedAt,
        locationVerified: Reports.locationVerified,
        distanceMeters: Reports.distanceMeters,
      })
      .from(Reports)
      .execute();

    const users = await db.select({ id: Users.id, name: Users.name }).from(Users).execute();
    const userMap = new Map(users.map(u => [u.id, u.name]));

    return reports.map(r => ({
      ...r,
      citizenName: userMap.get(r.userId) || 'Anonymous',
      collectorName: r.collectorId ? (userMap.get(r.collectorId) || 'Collector') : null,
      createdAt: r.createdAt instanceof Date
        ? r.createdAt.toISOString().split('T')[0]
        : (r.createdAt ? new Date(r.createdAt as any).toISOString().split('T')[0] : new Date().toISOString().split('T')[0])
    }));
  } catch (error) {
    console.error("Error fetching detailed reports:", error);
    return [];
  }
}

// ─────────────────────────────────────────
// PASSWORD RESET
// ─────────────────────────────────────────
export async function saveResetToken(email: string, token: string, expiresAt: Date) {
  try {
    const [updatedUser] = await db
      .update(Users)
      .set({ resetPasswordToken: token, resetPasswordExpires: expiresAt })
      .where(eq(Users.email, email))
      .returning()
      .execute();
    return updatedUser;
  } catch (error) {
    console.error("Error saving reset token:", error);
    return null;
  }
}

export async function getUserByResetToken(token: string) {
  try {
    const [user] = await db.select().from(Users).where(eq(Users.resetPasswordToken, token)).execute();
    return user;
  } catch (error) {
    console.error("Error fetching user by reset token:", error);
    return null;
  }
}

export async function updatePassword(userId: number, newHashedPassword: string) {
  try {
    const [updatedUser] = await db
      .update(Users)
      .set({ password: newHashedPassword, resetPasswordToken: null, resetPasswordExpires: null })
      .where(eq(Users.id, userId))
      .returning()
      .execute();
    return updatedUser;
  } catch (error) {
    console.error("Error updating password:", error);
    return null;
  }
}

// ─────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────
export async function updateUserProfile(userId: number, name: string, phone: string, address: string, wardNumber: string) {
  try {
    const [updatedUser] = await db
      .update(Users)
      .set({ name, fullName: name, phone, address, wardNumber, updatedAt: new Date() })
      .where(eq(Users.id, userId))
      .returning()
      .execute();
    return updatedUser;
  } catch (error) {
    console.error("Error updating user profile:", error);
    return null;
  }
}

export async function adminUpdateUser(
  userId: number,
  updates: { name?: string; role?: string; status?: string; rewardPoints?: number; phone?: string; address?: string; wardNumber?: string; governmentId?: string; }
) {
  try {
    const [updatedUser] = await db
      .update(Users)
      .set({ ...updates, fullName: updates.name, updatedAt: new Date() })
      .where(eq(Users.id, userId))
      .returning()
      .execute();

    if (updates.rewardPoints !== undefined) {
      await getOrCreateReward(userId);
      await db.update(Rewards).set({ points: updates.rewardPoints, updatedAt: new Date() }).where(eq(Rewards.userId, userId)).execute();
    }

    return updatedUser;
  } catch (error) {
    console.error("Error admin updating user:", error);
    return null;
  }
}

export async function getVerificationHistoryByReportId(reportId: number) {
  try {
    return await db.select({
      id: AiVerificationHistory.id,
      reportId: AiVerificationHistory.reportId,
      checkerId: AiVerificationHistory.checkerId,
      checkerName: Users.name,
      checkType: AiVerificationHistory.checkType,
      fullResult: AiVerificationHistory.fullResult,
      imageUrl: AiVerificationHistory.imageUrl,
      verificationStatus: AiVerificationHistory.verificationStatus,
      finalDecision: AiVerificationHistory.finalDecision,
      createdAt: AiVerificationHistory.createdAt,
    })
    .from(AiVerificationHistory)
    .leftJoin(Users, eq(AiVerificationHistory.checkerId, Users.id))
    .where(eq(AiVerificationHistory.reportId, reportId))
    .orderBy(desc(AiVerificationHistory.createdAt))
    .execute();
  } catch (error) {
    console.error("Error fetching verification history:", error);
    return [];
  }
}

