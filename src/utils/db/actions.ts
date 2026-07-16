"use server";

import { db } from './dbConfig';
import { Users, Reports, Rewards, CollectedWastes, Notifications, Transactions } from './schema';
import { eq, sql, and, desc, ne } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

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
    if (!user && email === 'admin@smart janakpur waste management.com') {
      const passwordHash = await bcrypt.hash('Admin@123', 10);
      [user] = await db.insert(Users).values({
        email: 'admin@smart janakpur waste management.com',
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

export async function createReport(
  userId: number,
  location: string,
  wasteType: string,
  amount: string,
  imageUrl?: string,
  verificationResult?: any
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
      })
      .returning()
      .execute();

    // Award 10 points for reporting waste
    const pointsEarned = 10;
    await updateRewardPoints(userId, pointsEarned);

    // Create a transaction for the earned points
    await createTransaction(userId, 'earned_report', pointsEarned, 'Points earned for reporting waste');

    // Create notifications for the user
    await createNotification(userId, "Report Submitted", "report");
    await createNotification(userId, "You earned 10 points.", "reward");

    // Notify admin: New Waste Report
    const admins = await db.select().from(Users).where(eq(Users.role, 'admin')).execute();
    for (const admin of admins) {
      await createNotification(
        admin.id,
        "New Waste Report",
        "info"
      );
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
    // 1. Update legacy Rewards table
    const [updatedReward] = await db
      .update(Rewards)
      .set({ 
        points: sql`${Rewards.points} + ${pointsToAdd}`,
        updatedAt: new Date()
      })
      .where(eq(Rewards.userId, userId))
      .returning()
      .execute();

    // 2. Update new Users table rewardPoints column
    await db
      .update(Users)
      .set({
        rewardPoints: sql`${Users.rewardPoints} + ${pointsToAdd}`,
        updatedAt: new Date()
      })
      .where(eq(Users.id, userId))
      .execute();

    return updatedReward;
  } catch (error) {
    console.error("Error updating reward points:", error);
    return null;
  }
}

export async function createCollectedWaste(reportId: number, collectorId: number, notes?: string) {
  try {
    const [collectedWaste] = await db
      .insert(CollectedWastes)
      .values({
        reportId,
        collectorId,
        collectionDate: new Date(),
      })
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
      and(
        eq(Notifications.userId, userId),
        eq(Notifications.isRead, false)
      )
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

export async function getWasteCollectionTasks(limit: number = 20) {
  try {
    const tasks = await db
      .select({
        id: Reports.id,
        userId: Reports.userId,
        location: Reports.location,
        wasteType: Reports.wasteType,
        amount: Reports.amount,
        status: Reports.status,
        date: Reports.createdAt,
        collectorId: Reports.collectorId,
        imageUrl: Reports.imageUrl,
      })
      .from(Reports)
      .limit(limit)
      .execute();

    return tasks.map(task => ({
      ...task,
      date: task.date instanceof Date 
        ? task.date.toISOString().split('T')[0] 
        : (task.date ? new Date(task.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
    }));
  } catch (error) {
    console.error("Error fetching waste collection tasks:", error);
    return [];
  }
}

export async function saveReward(userId: number, amount: number) {
  try {
    // Ensure user has a primary reward row
    await getOrCreateReward(userId);
    // Update points in primary reward row
    await updateRewardPoints(userId, amount);
    
    // Create a transaction for this reward
    await createTransaction(userId, 'earned_collect', amount, 'Points earned for collecting waste');

    // Create notification for the collector
    await createNotification(userId, "You earned 20 points.", "reward");
  } catch (error) {
    console.error("Error saving reward:", error);
    throw error;
  }
}

export async function saveCollectedWaste(reportId: number, collectorId: number, verificationResult: any) {
  try {
    const [collectedWaste] = await db
      .insert(CollectedWastes)
      .values({
        reportId,
        collectorId,
        collectionDate: new Date(),
        status: 'verified',
      })
      .returning()
      .execute();
    return collectedWaste;
  } catch (error) {
    console.error("Error saving collected waste:", error);
    throw error;
  }
}

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
        // Citizen notifications
        await createNotification(updatedReport.userId, "Collector is coming.", "info");
        await createNotification(updatedReport.userId, "Collector Assigned", "info");

        // Collector notification + reward (+5 points)
        if (collectorId) {
          await createNotification(collectorId, "New Task Assigned", "info");
          await updateRewardPoints(collectorId, 5);
          await createTransaction(collectorId, 'earned_accept', 5, 'Points earned for accepting task');
          await createNotification(collectorId, "You earned 5 points.", "reward");
        }
      } else if (newStatus === 'verified') {
        // Citizen gets +20 points (Report Verified)
        await updateRewardPoints(updatedReport.userId, 20);
        await createTransaction(updatedReport.userId, 'earned_verify', 20, 'Points earned for verified waste report');
        await createNotification(updatedReport.userId, "Report Verified", "reward");
        await createNotification(updatedReport.userId, "You earned 20 points.", "reward");
        await createNotification(updatedReport.userId, "Cleanup verified.", "info");

        // Collector gets +20 points (Task Completed) +30 points (AI Verification Success) = total +50
        if (collectorId) {
          await updateRewardPoints(collectorId, 50);
          await createTransaction(collectorId, 'earned_complete', 20, 'Points earned for completing task');
          await createTransaction(collectorId, 'earned_ai_success', 30, 'Points earned for successful AI verification');
          await createNotification(collectorId, "Cleanup Verified", "info");
          await createNotification(collectorId, "You earned 20 points.", "reward");
          await createNotification(collectorId, "You earned 30 points.", "reward");
        }

        // Notify Admin: Collector Completed Task
        const admins = await db.select().from(Users).where(eq(Users.role, 'admin')).execute();
        for (const admin of admins) {
          await createNotification(
            admin.id,
            `Collector Completed Task #${reportId}`,
            'info'
          );
        }
      }
    }
    return updatedReport;
  } catch (error) {
    console.error("Error updating task status:", error);
    throw error;
  }
}

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
      .where(ne(Users.role, 'admin'))
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
      .limit(10)
      .execute();



    const formattedTransactions = transactions.map(t => ({
      ...t,
      date: t.date instanceof Date 
        ? t.date.toISOString().split('T')[0] 
        : (t.date ? new Date(t.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
    }));


    return formattedTransactions;
  } catch (error) {
    console.error("Error fetching reward transactions:", error);
    return [];
  }
}

export async function getAvailableRewards(userId: number) {
  try {

    
    // Get user's total points
    const userTransactions = await getRewardTransactions(userId);
    const userPoints = userTransactions.reduce((total, transaction) => {
      return transaction.type.startsWith('earned') ? total + transaction.amount : total - transaction.amount;
    }, 0);



    // Get available rewards from the database
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



    // Combine user points and database rewards
    const allRewards = [
      {
        id: 0, // Use a special ID for user's points
        name: "Your Points",
        cost: userPoints,
        description: "Redeem your earned points",
        collectionInfo: "Points earned from reporting and collecting waste"
      },
      ...dbRewards
    ];


    return allRewards;
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
      // Redeem all points
      const [updatedReward] = await db.update(Rewards)
        .set({ 
          points: 0,
          updatedAt: new Date(),
        })
        .where(eq(Rewards.userId, userId))
        .returning()
        .execute();

      // Create a transaction for this redemption
      await createTransaction(userId, 'redeemed', userReward.points, `Redeemed all points: ${userReward.points}`);

      return updatedReward;
    } else {
      // Existing logic for redeeming specific rewards
      const availableReward = await db.select().from(Rewards).where(eq(Rewards.id, rewardId)).execute();

      if (!userReward || !availableReward[0] || userReward.points < availableReward[0].points) {
        throw new Error("Insufficient points or invalid reward");
      }

      const [updatedReward] = await db.update(Rewards)
        .set({ 
          points: sql`${Rewards.points} - ${availableReward[0].points}`,
          updatedAt: new Date(),
        })
        .where(eq(Rewards.userId, userId))
        .returning()
        .execute();

      // Create a transaction for this redemption
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
  const balance = transactions.reduce((acc, transaction) => {
    return transaction.type.startsWith('earned') ? acc + transaction.amount : acc - transaction.amount
  }, 0);
  return Math.max(balance, 0); // Ensure balance is never negative
}

export async function saveResetToken(email: string, token: string, expiresAt: Date) {
  try {
    const [updatedUser] = await db
      .update(Users)
      .set({
        resetPasswordToken: token,
        resetPasswordExpires: expiresAt,
      })
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
    const [user] = await db
      .select()
      .from(Users)
      .where(eq(Users.resetPasswordToken, token))
      .execute();
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
      .set({
        password: newHashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      })
      .where(eq(Users.id, userId))
      .returning()
      .execute();
    return updatedUser;
  } catch (error) {
    console.error("Error updating password:", error);
    return null;
  }
}

export async function getUserAchievements(userId: number) {
  try {
    const [reportsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(Reports)
      .where(eq(Reports.userId, userId))
      .execute();
      
    const [collectionsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(CollectedWastes)
      .where(eq(CollectedWastes.collectorId, userId))
      .execute();
      
    const reward = await getOrCreateReward(userId);
    const points = reward?.points || 0;
    const level = reward?.level || 1;

    const allRewards = await db
      .select({ userId: Rewards.userId })
      .from(Rewards)
      .orderBy(desc(Rewards.points))
      .execute();
      
    const rank = allRewards.findIndex(r => r.userId === userId) + 1 || 0;

    return {
      reportsCount: reportsCount?.count || 0,
      collectionsCount: collectionsCount?.count || 0,
      points,
      level,
      rank,
    };
  } catch (error) {
    console.error("Error fetching user achievements:", error);
    return null;
  }
}

export async function getAdminStats() {
  try {
    const [usersCount] = await db.select({ count: sql<number>`count(*)` }).from(Users).execute();
    const [reportsCount] = await db.select({ count: sql<number>`count(*)` }).from(Reports).execute();
    const [rewardsCount] = await db.select({ count: sql<number>`count(*)` }).from(Rewards).execute();
    
    const collectors = await db
      .select({ collectorId: CollectedWastes.collectorId })
      .from(CollectedWastes)
      .groupBy(CollectedWastes.collectorId)
      .execute();
    const collectorsCount = collectors.length;

    // Filter today's reports
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [todaysReports] = await db
      .select({ count: sql<number>`count(*)` })
      .from(Reports)
      .where(sql`${Reports.createdAt} >= ${today.getTime() / 1000}`)
      .execute();

    // Filter monthly reports
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
      collectorsCount: collectorsCount || 0,
      rewardsCount: rewardsCount?.count || 0,
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
        wasteType: Reports.wasteType,
        amount: Reports.amount,
        imageUrl: Reports.imageUrl,
        verificationResult: Reports.verificationResult,
        status: Reports.status,
        createdAt: Reports.createdAt,
        collectorId: Reports.collectorId,
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
        : (r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0])
    }));
  } catch (error) {
    console.error("Error fetching detailed reports:", error);
    return [];
  }
}

export async function checkDailyLogin(userId: number) {
  try {
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
      await createTransaction(userId, 'daily_login', 5, 'Daily login reward points');
      await createNotification(userId, 'You earned 5 points.', 'reward');
      return { claimed: true, points: 5 };
    }
    return { claimed: false, points: 0 };
  } catch (error) {
    console.error("Error checkDailyLogin:", error);
    return { claimed: false, points: 0 };
  }
}

export async function claimReferral(userId: number, referralEmail: string) {
  try {
    const referee = await getUserByEmail(referralEmail);
    if (!referee || referee.id === userId) {
      return { success: false, message: "Invalid referral email." };
    }

    const existing = await db
      .select()
      .from(Transactions)
      .where(and(
        eq(Transactions.userId, userId),
        eq(Transactions.type, 'referral_claimed')
      ))
      .execute();

    if (existing.length > 0) {
      return { success: false, message: "You have already claimed a referral code." };
    }

    // Award 100 points to referee
    await updateRewardPoints(referee.id, 100);
    await createTransaction(referee.id, 'referral_reward', 100, 'Points earned from referral');
    await createNotification(referee.id, 'You earned 100 points.', 'reward');

    // Mark referral as claimed
    await createTransaction(userId, 'referral_claimed', 0, `Used referral from ${referralEmail}`);

    return { success: true, message: "Referral applied successfully! 100 points awarded to your friend." };
  } catch (error) {
    console.error("Error claimReferral:", error);
    return { success: false, message: "Error applying referral." };
  }
}

export async function updateUserProfile(
  userId: number,
  name: string,
  phone: string,
  address: string,
  wardNumber: string
) {
  try {
    const [updatedUser] = await db
      .update(Users)
      .set({
        name,
        fullName: name,
        phone,
        address,
        wardNumber,
        updatedAt: new Date()
      })
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
  updates: {
    name?: string;
    role?: string;
    status?: string;
    rewardPoints?: number;
    phone?: string;
    address?: string;
    wardNumber?: string;
    governmentId?: string;
  }
) {
  try {
    const [updatedUser] = await db
      .update(Users)
      .set({
        ...updates,
        fullName: updates.name,
        updatedAt: new Date()
      })
      .where(eq(Users.id, userId))
      .returning()
      .execute();

    if (updates.rewardPoints !== undefined) {
      await getOrCreateReward(userId);
      await db
        .update(Rewards)
        .set({
          points: updates.rewardPoints,
          updatedAt: new Date()
        })
        .where(eq(Rewards.userId, userId))
        .execute();
    }

    return updatedUser;
  } catch (error) {
    console.error("Error admin updating user:", error);
    return null;
  }
}
