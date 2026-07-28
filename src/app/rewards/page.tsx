'use client'
import { useState, useEffect } from 'react'
import { Coins, ArrowUpRight, ArrowDownRight, Gift, AlertCircle, Loader, Shield, Star, Calendar, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getUserByEmail, getRewardTransactions, getAvailableRewards, redeemReward, createTransaction, checkDailyLogin, claimReferral } from '@/utils/db/actions'
import { toast } from 'react-hot-toast'
import { useSession } from "next-auth/react"
import { useRouter } from 'next/navigation'

type Transaction = {
  id: number
  type: string
  amount: number
  description: string
  date: string
}

type Reward = {
  id: number
  name: string
  cost: number
  description: string | null
  collectionInfo: string
}

const transactionTypeConfig: Record<string, { label: string; color: string; icon: any }> = {
  earned_report_verified: { label: 'Report Verified', color: 'text-green-600', icon: ArrowUpRight },
  earned_report: { label: 'Report Submitted', color: 'text-green-600', icon: ArrowUpRight },
  daily_login: { label: 'Daily Login Bonus', color: 'text-blue-600', icon: Star },
  referral_reward: { label: 'Referral Bonus', color: 'text-purple-600', icon: Users },
  referral_claimed: { label: 'Referral Used', color: 'text-gray-400', icon: ArrowUpRight },
  redeemed: { label: 'Points Redeemed', color: 'text-red-500', icon: ArrowDownRight },
}

export default function RewardsPage() {
  const [user, setUser] = useState<{ id: number; email: string; name: string; role?: string } | null>(null)
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [rewards, setRewards] = useState<Reward[]>([])
  const [loading, setLoading] = useState(true)
  const [referralEmail, setReferralEmail] = useState("")
  const router = useRouter()
  const { data: session, status } = useSession()

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        if (status === "authenticated" && session?.user?.email) {
          const fetchedUser = await getUserByEmail(session.user.email)
          if (fetchedUser) {
            // Collectors are NOT allowed on this page
            if ((fetchedUser as any).role === 'collector') {
              toast.error('Rewards are available for Citizens only.')
              router.push('/collect')
              return
            }
            if ((fetchedUser as any).role === 'admin') {
              toast.error('Admin rewards management is located in the Admin Dashboard.')
              router.push('/admin')
              return
            }
            setUser(fetchedUser as any)
            await loadUserData(fetchedUser.id)
          } else {
            toast.error('User not found. Please log in again.')
          }
        } else if (status === "unauthenticated") {
          router.push('/login')
        }
      } catch (error) {
        console.error('Error fetching rewards data:', error)
        toast.error('Failed to load rewards data.')
      } finally {
        setLoading(false)
      }
    }

    if (status !== "loading") {
      fetchData()
    }
  }, [status, session])

  const loadUserData = async (userId: number) => {
    const fetchedTransactions = await getRewardTransactions(userId)
    setTransactions(fetchedTransactions as Transaction[])
    const fetchedRewards = await getAvailableRewards(userId)
    setRewards(fetchedRewards.filter(r => r.cost > 0))
    const calculatedBalance = fetchedTransactions.reduce((acc, t) => {
      return t.type.startsWith('earned') ? acc + t.amount : acc - t.amount
    }, 0)
    setBalance(Math.max(calculatedBalance, 0))
  }

  const refreshData = async () => {
    if (user) await loadUserData(user.id)
  }

  const handleRedeemReward = async (rewardId: number) => {
    if (!user) { toast.error('Please log in to redeem rewards.'); return }
    const reward = rewards.find(r => r.id === rewardId)
    if (reward && balance >= reward.cost && reward.cost > 0) {
      try {
        await redeemReward(user.id, rewardId)
        await createTransaction(user.id, 'redeemed', reward.cost, `Redeemed ${reward.name}`)
        await refreshData()
        toast.success(`Successfully redeemed: ${reward.name}`)
      } catch (error) {
        toast.error('Failed to redeem reward. Please try again.')
      }
    } else {
      toast.error('Insufficient balance or invalid reward.')
    }
  }

  const handleRedeemAllPoints = async () => {
    if (!user) { toast.error('Please log in.'); return }
    if (balance > 0) {
      try {
        await redeemReward(user.id, 0)
        await createTransaction(user.id, 'redeemed', balance, 'Redeemed all points')
        await refreshData()
        toast.success('Successfully redeemed all your points!')
      } catch (error) {
        toast.error('Failed to redeem points. Please try again.')
      }
    } else {
      toast.error('No points available to redeem.')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader className="animate-spin h-8 w-8 text-green-600" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-xl">
            <Coins className="w-7 h-7 text-green-600" />
          </div>
          Citizen Rewards
        </h1>
        <p className="text-gray-500 mt-2 text-sm">
          Earn points by submitting waste reports that get verified. Redeem points for community rewards.
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
        <Shield className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-green-800">How to earn points</p>
          <ul className="text-xs text-green-700 mt-1 space-y-0.5 list-disc list-inside">
            <li><strong>+20 pts</strong> — When your submitted waste report is verified by a collector</li>
            <li><strong>+5 pts</strong> — Daily login bonus (claim once per day)</li>
            <li><strong>+100 pts</strong> — Referral bonus for your friend who joins</li>
          </ul>
        </div>
      </div>

      {/* Top 3 Cards */}
      <div className="grid md:grid-cols-3 gap-5 mb-8">
        {/* Balance */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Balance</h2>
            <div className="p-1.5 bg-green-100 rounded-lg">
              <Coins className="w-4 h-4 text-green-600" />
            </div>
          </div>
          <div className="text-4xl font-extrabold text-green-600 mb-1">{balance}</div>
          <p className="text-xs text-gray-400 font-medium">Available Points</p>
          {balance > 0 && (
            <Button
              onClick={handleRedeemAllPoints}
              className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white text-sm rounded-xl py-2"
            >
              <Gift className="w-4 h-4 mr-2" />
              Redeem All Points
            </Button>
          )}
        </div>

        {/* Daily Streak */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Daily Streak</h2>
            <div className="p-1.5 bg-blue-100 rounded-lg">
              <Calendar className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">Log in daily to earn <strong>+5 bonus points</strong> automatically.</p>
          <Button
            onClick={async () => {
              if (!user) return
              const res = await checkDailyLogin(user.id)
              if (res.claimed) {
                toast.success("Daily login bonus claimed! +5 points")
                await refreshData()
              } else {
                toast.error("Already claimed today. Come back tomorrow!")
              }
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-2 text-sm"
          >
            <Star className="w-4 h-4 mr-2" />
            Claim Daily +5 Points
          </Button>
        </div>

        {/* Referral */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Invite a Friend</h2>
            <div className="p-1.5 bg-purple-100 rounded-lg">
              <Users className="w-4 h-4 text-purple-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-3">Enter your friend's email to award them <strong>+100 pts</strong>.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (!user) return
              if (!referralEmail) { toast.error("Please enter email"); return }
              const res = await claimReferral(user.id, referralEmail)
              if (res.success) {
                toast.success(res.message)
                setReferralEmail("")
                await refreshData()
              } else {
                toast.error(res.message)
              }
            }}
            className="flex gap-2"
          >
            <input
              type="email"
              placeholder="friend@email.com"
              value={referralEmail}
              onChange={(e) => setReferralEmail(e.target.value)}
              className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 rounded-xl">
              Send
            </Button>
          </form>
        </div>
      </div>

      {/* Transactions + Available Rewards */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Transaction History */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
            <ArrowUpRight className="w-5 h-5 text-green-500" />
            Transaction History
          </h2>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {transactions.length > 0 ? (
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {transactions.map(transaction => {
                  const cfg = transactionTypeConfig[transaction.type] || {
                    label: transaction.type.replace(/_/g, ' '),
                    color: transaction.type.startsWith('earned') ? 'text-green-600' : 'text-red-500',
                    icon: transaction.type.startsWith('earned') ? ArrowUpRight : ArrowDownRight
                  }
                  const Icon = cfg.icon
                  const isEarned = transaction.type.startsWith('earned') || transaction.type === 'daily_login' || transaction.type === 'referral_reward'
                  return (
                    <div key={transaction.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg ${isEarned ? 'bg-green-50' : 'bg-red-50'}`}>
                          <Icon className={`w-4 h-4 ${cfg.color}`} />
                        </div>
                        <div>
                          <p className="font-medium text-gray-800 text-sm">{cfg.label}</p>
                          <p className="text-xs text-gray-400">{transaction.date}</p>
                        </div>
                      </div>
                      <span className={`font-bold text-sm ${isEarned ? 'text-green-600' : 'text-red-500'}`}>
                        {isEarned ? '+' : '-'}{transaction.amount} pts
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-400">
                <Coins className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No transactions yet.</p>
                <p className="text-xs mt-1">Submit a waste report to start earning!</p>
              </div>
            )}
          </div>
        </div>

        {/* Available Rewards */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Gift className="w-5 h-5 text-purple-500" />
            Available Rewards
          </h2>
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {rewards.filter(r => r.id !== 0 && r.cost > 0).length > 0 ? (
              rewards.filter(r => r.id !== 0 && r.cost > 0).map(reward => (
                <div key={reward.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="text-sm font-bold text-gray-900">{reward.name}</h3>
                    <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">{reward.cost} pts</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-1">{reward.description}</p>
                  <p className="text-xs text-gray-400 italic mb-3">{reward.collectionInfo}</p>
                  <Button
                    onClick={() => handleRedeemReward(reward.id)}
                    className="w-full bg-green-600 hover:bg-green-700 text-white text-xs rounded-xl py-2"
                    disabled={balance < reward.cost}
                  >
                    <Gift className="w-3 h-3 mr-1.5" />
                    {balance >= reward.cost ? 'Redeem Reward' : `Need ${reward.cost - balance} more pts`}
                  </Button>
                </div>
              ))
            ) : (
              <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl text-center">
                <AlertCircle className="h-8 w-8 text-amber-400 mx-auto mb-2" />
                <p className="text-amber-700 text-sm font-medium">No rewards available yet.</p>
                <p className="text-amber-600 text-xs mt-1">Admin will add redeemable rewards soon.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}