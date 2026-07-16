'use client'
import { useState, useEffect } from 'react'
import { getAllRewards, getUserByEmail, getUserAchievements } from '@/utils/db/actions'
import { Loader, Award, User, Trophy, Crown, Shield, Zap, Target, Star, CheckCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useSession } from "next-auth/react"

type Reward = {
  id: number
  userId: number
  points: number
  level: number
  createdAt: Date
  userName: string | null
  role?: string | null
}

export default function LeaderboardPage() {
  const [rewards, setRewards] = useState<Reward[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ id: number; email: string; name: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'achievements'>('leaderboard')
  const [userAchievements, setUserAchievements] = useState<{
    reportsCount: number;
    collectionsCount: number;
    points: number;
    level: number;
    rank: number;
  } | null>(null)

  const { data: session, status } = useSession();

  useEffect(() => {
    const fetchRewardsAndUser = async () => {
      setLoading(true)
      try {
        const fetchedRewards = await getAllRewards()
        setRewards(fetchedRewards as Reward[])

        if (status === "authenticated" && session?.user?.email) {
          const fetchedUser = await getUserByEmail(session.user.email)
          if (fetchedUser) {
            setUser(fetchedUser)
            const achievements = await getUserAchievements(fetchedUser.id)
            setUserAchievements(achievements)
          } else {
            toast.error('User not found. Please log in again.')
          }
        }
      } catch (error) {
        console.error('Error fetching rewards and user:', error)
        toast.error('Failed to load leaderboard. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    if (status !== "loading") {
      fetchRewardsAndUser()
    }
  }, [status, session])

  const getBadge = (points: number) => {
    if (points >= 500) return { name: 'Gold Collector', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: Star };
    if (points >= 200) return { name: 'Waste Warrior', color: 'bg-indigo-100 text-indigo-800 border-indigo-300', icon: Shield };
    if (points >= 50) return { name: 'Green Hero', color: 'bg-green-100 text-green-800 border-green-300', icon: Zap };
    return { name: 'Eco Starter', color: 'bg-orange-50 text-orange-800 border-orange-200', icon: Target };
  }

  const achievementsList = [
    {
      id: 'first_report',
      title: 'First Report',
      description: 'Submit your first waste report',
      icon: Target,
      unlocked: (userAchievements?.reportsCount || 0) >= 1,
      progress: userAchievements?.reportsCount || 0,
      target: 1,
      color: 'from-orange-400 to-amber-500',
    },
    {
      id: 'ten_reports',
      title: '10 Reports',
      description: 'Submit 10 waste reports',
      icon: Shield,
      unlocked: (userAchievements?.reportsCount || 0) >= 10,
      progress: userAchievements?.reportsCount || 0,
      target: 10,
      color: 'from-blue-400 to-indigo-500',
    },
    {
      id: 'hundred_reports',
      title: '100 Reports',
      description: 'Submit 100 waste reports',
      icon: Crown,
      unlocked: (userAchievements?.reportsCount || 0) >= 100,
      progress: userAchievements?.reportsCount || 0,
      target: 100,
      color: 'from-purple-400 to-pink-500',
    },
    {
      id: 'thousand_points',
      title: '1000 Points',
      description: 'Earn 1000 total points',
      icon: Trophy,
      unlocked: (userAchievements?.points || 0) >= 1000,
      progress: userAchievements?.points || 0,
      target: 1000,
      color: 'from-yellow-400 to-red-500',
    },
  ]

  const userBadge = userAchievements ? getBadge(userAchievements.points) : null;
  const UserBadgeIcon = userBadge ? userBadge.icon : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-gray-800">Leaderboard & Achievements</h1>
          <p className="text-sm text-gray-500 mt-1">Track top environmental heroes and see your personal milestones.</p>
        </div>

        {/* Tab Selector */}
        <div className="flex space-x-2 bg-gray-100 p-1.5 rounded-xl border border-gray-200 mt-4 md:mt-0 shadow-sm">
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 flex items-center ${
              activeTab === 'leaderboard' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <Trophy className="w-4 h-4 mr-2" />
            Top Performers
          </button>
          <button
            onClick={() => setActiveTab('achievements')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 flex items-center ${
              activeTab === 'achievements' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <Star className="w-4 h-4 mr-2" />
            My Achievements
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader className="animate-spin h-8 w-8 text-green-500" />
        </div>
      ) : activeTab === 'leaderboard' ? (
        /* Leaderboard Tab */
        <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-200">
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 flex justify-between items-center text-white">
            <Trophy className="h-9 w-9 animate-bounce" />
            <h2 className="text-xl font-bold">Environmental Leaderboard</h2>
            <Crown className="h-9 w-9" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Rank</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Points</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Badge</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rewards.map((reward, index) => {
                  const rank = index + 1;
                  const isCurrentUser = user && user.id === reward.userId;
                  const badge = getBadge(reward.points);
                  const BadgeIcon = badge.icon;

                  return (
                    <tr 
                      key={reward.id} 
                      className={`${isCurrentUser ? 'bg-green-50/70' : 'bg-white'} hover:bg-gray-50/70 transition-colors duration-150`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {rank <= 3 ? (
                            <Crown className={`h-6 w-6 ${
                              rank === 1 ? 'text-yellow-400 fill-yellow-400' : 
                              rank === 2 ? 'text-slate-400 fill-slate-300' : 
                              'text-amber-600 fill-amber-500'
                            }`} />
                          ) : (
                            <span className="text-sm font-semibold text-gray-600 ml-1.5">{rank}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 relative">
                            <User className="h-full w-full rounded-full bg-gray-200 text-gray-500 p-2 border border-gray-300" />
                            {isCurrentUser && (
                              <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white"></span>
                            )}
                          </div>
                          <div className="ml-4">
                            <div className={`text-sm font-bold ${isCurrentUser ? 'text-green-800' : 'text-gray-900'}`}>
                              {reward.userName || 'Anonymous Hero'}
                              {isCurrentUser && <span className="ml-2 text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full">You</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 inline-flex text-xs font-bold leading-5 rounded-full uppercase border ${
                          reward.role === 'admin' ? 'bg-red-100 text-red-800 border-red-200' :
                          reward.role === 'collector' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                          'bg-gray-100 text-gray-800 border-gray-200'
                        }`}>
                          {reward.role || 'Citizen'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Award className="h-5 w-5 text-green-600 mr-1.5" />
                          <div className="text-sm font-bold text-gray-900">{reward.points.toLocaleString()}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 inline-flex items-center text-xs font-semibold rounded-full border ${badge.color}`}>
                          <BadgeIcon className="w-3.5 h-3.5 mr-1" />
                          {badge.name}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full bg-green-100 text-green-800 border border-green-200">
                          Level {reward.level}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Achievements Tab */
        <div className="space-y-6">
          {/* User Status Card */}
          {userAchievements ? (
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 p-6 rounded-2xl shadow-md">
              <div className="flex flex-col md:flex-row items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="p-3.5 bg-green-100 rounded-2xl border border-green-200 text-green-600">
                    <User className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-green-900">{user?.name}</h3>
                    <p className="text-sm text-green-700 flex items-center mt-1">
                      {userBadge && UserBadgeIcon && (
                        <span className={`px-2.5 py-0.5 inline-flex items-center text-xs font-semibold rounded-full border mr-2 ${userBadge.color}`}>
                          <UserBadgeIcon className="w-3 h-3 mr-1" />
                          {userBadge.name} Tier
                        </span>
                      )}
                      Level {userAchievements.level}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-6 mt-6 md:mt-0 text-center">
                  <div className="bg-white px-4 py-2.5 rounded-xl border border-green-100 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Rank</p>
                    <p className="text-lg font-bold text-green-800 mt-1">#{userAchievements.rank}</p>
                  </div>
                  <div className="bg-white px-4 py-2.5 rounded-xl border border-green-100 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Points</p>
                    <p className="text-lg font-bold text-green-800 mt-1">{userAchievements.points}</p>
                  </div>
                  <div className="bg-white px-4 py-2.5 rounded-xl border border-green-100 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Collections</p>
                    <p className="text-lg font-bold text-green-800 mt-1">{userAchievements.collectionsCount}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-center text-amber-800">
              Please log in to track your personal achievements.
            </div>
          )}

          {/* Achievements Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {achievementsList.map((ach) => {
              const Icon = ach.icon
              const progressPercentage = Math.min((ach.progress / ach.target) * 100, 100)

              return (
                <div 
                  key={ach.id} 
                  className={`bg-white border rounded-2xl p-5 shadow-sm transition-all duration-200 ${
                    ach.unlocked ? 'border-green-200' : 'border-gray-200 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3.5">
                      <div className={`p-3 rounded-xl text-white bg-gradient-to-br ${
                        ach.unlocked ? ach.color : 'from-gray-300 to-gray-400'
                      }`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800 leading-snug">{ach.title}</h4>
                        <p className="text-xs text-gray-500 mt-1 leading-snug">{ach.description}</p>
                      </div>
                    </div>
                    {ach.unlocked ? (
                      <span className="bg-green-100 text-green-800 border border-green-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center">
                        <CheckCircle className="w-3 h-3 mr-1 text-green-600" />
                        Unlocked
                      </span>
                    ) : (
                      <span className="bg-gray-100 text-gray-500 border border-gray-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Locked
                      </span>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-5">
                    <div className="flex justify-between items-center text-xs text-gray-500 mb-1.5 font-semibold">
                      <span>Progress</span>
                      <span>{ach.progress} / {ach.target}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-500 bg-gradient-to-r ${
                          ach.unlocked ? 'from-green-500 to-emerald-500' : 'from-gray-400 to-gray-500'
                        }`} 
                        style={{ width: `${progressPercentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}