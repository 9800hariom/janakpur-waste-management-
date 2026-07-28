'use client'
import { useState, useEffect } from 'react'
import { getAllRewards, getUserByEmail, getUserAchievements } from '@/utils/db/actions'
import { Loader, Award, User, Trophy, Crown, Shield, Zap, Target, Star, CheckCircle, Medal } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useSession } from "next-auth/react"
import { useRouter } from 'next/navigation'

type CitizenRanking = {
  id: number
  userId: number
  points: number
  level: number
  createdAt: Date
  userName: string | null
  role?: string | null
}

export default function LeaderboardPage() {
  const [rankings, setRankings] = useState<CitizenRanking[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ id: number; email: string; name: string; role?: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'achievements'>('leaderboard')
  const [userAchievements, setUserAchievements] = useState<{
    reportsCount: number;
    collectionsCount: number;
    points: number;
    level: number;
    rank: number;
  } | null>(null)

  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        // Fetch citizen-only leaderboard
        const fetchedRankings = await getAllRewards()
        setRankings(fetchedRankings as CitizenRanking[])

        if (status === "authenticated" && session?.user?.email) {
          const fetchedUser = await getUserByEmail(session.user.email)
          if (fetchedUser) {
            setUser(fetchedUser as any)
            // Collectors redirected to collect page
            if ((fetchedUser as any).role === 'collector') {
              router.push('/collect')
              return
            }
            const achievements = await getUserAchievements(fetchedUser.id)
            setUserAchievements(achievements)
          }
        }
      } catch (error) {
        console.error('Error fetching leaderboard:', error)
        toast.error('Failed to load leaderboard.')
      } finally {
        setLoading(false)
      }
    }

    if (status !== "loading") {
      fetchData()
    }
  }, [status, session])

  const getBadge = (points: number) => {
    if (points >= 500) return { name: 'Gold Guardian', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: Star };
    if (points >= 200) return { name: 'Waste Warrior', color: 'bg-indigo-100 text-indigo-800 border-indigo-300', icon: Shield };
    if (points >= 50) return { name: 'Green Hero', color: 'bg-green-100 text-green-800 border-green-300', icon: Zap };
    return { name: 'Eco Starter', color: 'bg-orange-50 text-orange-800 border-orange-200', icon: Target };
  }

  const achievementsList = [
    {
      id: 'first_report', title: 'First Report',
      description: 'Submit your first verified waste report',
      icon: Target,
      unlocked: (userAchievements?.reportsCount || 0) >= 1,
      progress: userAchievements?.reportsCount || 0,
      target: 1,
      color: 'from-orange-400 to-amber-500',
    },
    {
      id: 'ten_reports', title: '10 Reports',
      description: 'Submit 10 waste reports',
      icon: Shield,
      unlocked: (userAchievements?.reportsCount || 0) >= 10,
      progress: userAchievements?.reportsCount || 0,
      target: 10,
      color: 'from-blue-400 to-indigo-500',
    },
    {
      id: 'hundred_reports', title: '100 Reports',
      description: 'Submit 100 waste reports',
      icon: Crown,
      unlocked: (userAchievements?.reportsCount || 0) >= 100,
      progress: userAchievements?.reportsCount || 0,
      target: 100,
      color: 'from-purple-400 to-pink-500',
    },
    {
      id: 'thousand_points', title: '1000 Points',
      description: 'Earn 1000 total reward points',
      icon: Trophy,
      unlocked: (userAchievements?.points || 0) >= 1000,
      progress: userAchievements?.points || 0,
      target: 1000,
      color: 'from-yellow-400 to-red-500',
    },
    {
      id: 'fifty_points', title: 'First 50 Points',
      description: 'Earn your first 50 points',
      icon: Award,
      unlocked: (userAchievements?.points || 0) >= 50,
      progress: userAchievements?.points || 0,
      target: 50,
      color: 'from-green-400 to-teal-500',
    },
    {
      id: 'top10', title: 'Top 10',
      description: 'Reach the top 10 on the leaderboard',
      icon: Medal,
      unlocked: (userAchievements?.rank || 999) <= 10 && (userAchievements?.rank || 0) > 0,
      progress: userAchievements?.rank ? Math.max(0, 11 - userAchievements.rank) : 0,
      target: 10,
      color: 'from-pink-400 to-rose-500',
    },
  ]

  const userBadge = userAchievements ? getBadge(userAchievements.points) : null
  const UserBadgeIcon = userBadge ? userBadge.icon : null

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-xl">
              <Trophy className="w-7 h-7 text-yellow-600" />
            </div>
            Citizen Leaderboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">Top environmental heroes ranked by verified report points.</p>
        </div>

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
        <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
          <div className="bg-gradient-to-r from-green-600 to-emerald-700 p-6 flex justify-between items-center text-white">
            <div>
              <h2 className="text-xl font-bold">🏆 Citizen Rankings</h2>
              <p className="text-green-100 text-sm mt-0.5">Points earned from verified waste reports</p>
            </div>
            <Crown className="h-10 w-10 opacity-80" />
          </div>
          {rankings.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No citizens on the leaderboard yet.</p>
              <p className="text-xs mt-1">Submit and get waste reports verified to appear here!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Rank</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Citizen</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Points</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Badge</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rankings.map((ranking, index) => {
                    const rank = index + 1
                    const isCurrentUser = user && user.id === ranking.userId
                    const badge = getBadge(ranking.points)
                    const BadgeIcon = badge.icon

                    return (
                      <tr
                        key={ranking.id}
                        className={`${isCurrentUser ? 'bg-green-50/60' : 'bg-white'} hover:bg-gray-50/50 transition-colors duration-150`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          {rank <= 3 ? (
                            <Crown className={`h-6 w-6 ${
                              rank === 1 ? 'text-yellow-400 fill-yellow-400' :
                              rank === 2 ? 'text-slate-400 fill-slate-300' :
                              'text-amber-600 fill-amber-500'
                            }`} />
                          ) : (
                            <span className="text-sm font-bold text-gray-500 ml-1">{rank}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-9 w-9 bg-gradient-to-br from-green-100 to-emerald-200 rounded-full flex items-center justify-center border border-green-200">
                              <span className="text-sm font-bold text-green-700">
                                {(ranking.userName || 'U')[0].toUpperCase()}
                              </span>
                            </div>
                            <div className="ml-3">
                              <div className={`text-sm font-bold ${isCurrentUser ? 'text-green-700' : 'text-gray-900'}`}>
                                {ranking.userName || 'Anonymous'}
                                {isCurrentUser && <span className="ml-2 text-[10px] bg-green-200 text-green-800 px-1.5 py-0.5 rounded-full">You</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Award className="h-4 w-4 text-green-500 mr-1.5" />
                            <span className="text-sm font-bold text-gray-900">{ranking.points.toLocaleString()}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2.5 py-1 inline-flex items-center text-xs font-semibold rounded-full border ${badge.color}`}>
                            <BadgeIcon className="w-3 h-3 mr-1" />
                            {badge.name}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-3 py-1 text-xs font-bold rounded-full bg-green-50 text-green-700 border border-green-200">
                            Lv. {ranking.level}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Achievements Tab */
        <div className="space-y-6">
          {userAchievements ? (
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 p-6 rounded-2xl shadow-sm">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-green-100 rounded-2xl border border-green-200 text-green-600">
                    <User className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-green-900">{user?.name}</h3>
                    {userBadge && UserBadgeIcon && (
                      <span className={`mt-1 px-2.5 py-0.5 inline-flex items-center text-xs font-semibold rounded-full border ${userBadge.color}`}>
                        <UserBadgeIcon className="w-3 h-3 mr-1" />
                        {userBadge.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-white px-4 py-3 rounded-xl border border-green-100 shadow-sm">
                    <p className="text-xs font-semibold text-gray-400 uppercase">Rank</p>
                    <p className="text-xl font-bold text-green-700 mt-1">#{userAchievements.rank || '—'}</p>
                  </div>
                  <div className="bg-white px-4 py-3 rounded-xl border border-green-100 shadow-sm">
                    <p className="text-xs font-semibold text-gray-400 uppercase">Points</p>
                    <p className="text-xl font-bold text-green-700 mt-1">{userAchievements.points}</p>
                  </div>
                  <div className="bg-white px-4 py-3 rounded-xl border border-green-100 shadow-sm">
                    <p className="text-xs font-semibold text-gray-400 uppercase">Reports</p>
                    <p className="text-xl font-bold text-green-700 mt-1">{userAchievements.reportsCount}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-center text-amber-800 text-sm">
              Log in to track your personal achievements.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {achievementsList.map((ach) => {
              const Icon = ach.icon
              const progressPercentage = Math.min((ach.progress / ach.target) * 100, 100)
              return (
                <div
                  key={ach.id}
                  className={`bg-white border rounded-2xl p-5 shadow-sm transition-all duration-200 ${
                    ach.unlocked ? 'border-green-200' : 'border-gray-100 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`p-3 rounded-xl text-white bg-gradient-to-br ${ach.unlocked ? ach.color : 'from-gray-300 to-gray-400'}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-800">{ach.title}</h4>
                        <p className="text-xs text-gray-400 mt-0.5">{ach.description}</p>
                      </div>
                    </div>
                    {ach.unlocked ? (
                      <span className="bg-green-100 text-green-700 border border-green-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center">
                        <CheckCircle className="w-3 h-3 mr-1" /> Unlocked
                      </span>
                    ) : (
                      <span className="bg-gray-100 text-gray-400 border border-gray-200 text-[10px] font-bold px-2 py-0.5 rounded-full">Locked</span>
                    )}
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-400 mb-1.5 font-medium">
                      <span>Progress</span>
                      <span>{Math.min(ach.progress, ach.target)} / {ach.target}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-700 bg-gradient-to-r ${ach.unlocked ? ach.color : 'from-gray-300 to-gray-400'}`}
                        style={{ width: `${progressPercentage}%` }}
                      />
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