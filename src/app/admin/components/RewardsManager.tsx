'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Trash2, Award, Users, Coins, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { createGlobalReward, deleteReward, getAllCitizensPointsAndRewards } from '@/utils/db/adminActions'

export function RewardsManager({ rewards, currentAdminId, onUpdate }: { rewards: any[], currentAdminId: number, onUpdate: () => void }) {
  const [loading, setLoading] = useState(false)
  const [citizensData, setCitizensData] = useState<any[]>([])
  const [fetchingCitizens, setFetchingCitizens] = useState(true)
  
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [points, setPoints] = useState(100)
  const [collectionInfo, setCollectionInfo] = useState('')

  const fetchCitizens = async () => {
    setFetchingCitizens(true)
    try {
      const data = await getAllCitizensPointsAndRewards()
      setCitizensData(data || [])
    } catch (e) {
      console.error("Error fetching citizens reward data:", e)
    } finally {
      setFetchingCitizens(false)
    }
  }

  useEffect(() => {
    fetchCitizens()
  }, [])

  const handleAddReward = async () => {
    if (!name || !description || !collectionInfo) {
      return toast.error("All fields are required")
    }
    
    setLoading(true)
    try {
      const res = await createGlobalReward(currentAdminId, { name, description, points, collectionInfo })
      if (res) {
        toast.success("Reward added successfully")
        setName('')
        setDescription('')
        setCollectionInfo('')
        setPoints(100)
        onUpdate()
      } else {
        toast.error("Failed to add reward")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this reward?")) return;
    
    setLoading(true)
    try {
      const res = await deleteReward(currentAdminId, id);
      if (res) {
        toast.success("Reward deleted")
        onUpdate()
      } else {
        toast.error("Failed to delete reward")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Citizen Points & Reward Summary Section */}
      <Card className="border-green-100 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-xl border-b border-green-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-600 text-white rounded-xl">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-gray-900">Citizen Earned Points & Rewards</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">Overview of all citizens' accumulated reward points and redemption history (Citizens Only)</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchCitizens} disabled={fetchingCitizens} className="text-xs">
              Refresh Points
            </Button>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50/80 border-b">
              <tr>
                <th className="px-6 py-4">Citizen Name</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Current Points</th>
                <th className="px-6 py-4">Total Earned</th>
                <th className="px-6 py-4">Total Redeemed</th>
                <th className="px-6 py-4">Recent Activity</th>
              </tr>
            </thead>
            <tbody>
              {citizensData.map(c => (
                <tr key={c.id} className="bg-white border-b hover:bg-gray-50/50">
                  <td className="px-6 py-4 font-semibold text-gray-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-green-600" />
                    {c.name}
                  </td>
                  <td className="px-6 py-4 text-gray-600 text-xs font-mono">{c.email}</td>
                  <td className="px-6 py-4 font-mono font-bold text-green-600">
                    <span className="bg-green-50 text-green-700 px-2.5 py-1 rounded-full border border-green-200">
                      {c.rewardPoints || 0} pts
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs font-bold text-blue-600">
                    +{c.totalEarned || 0}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs font-bold text-rose-500">
                    -{c.totalRedeemed || 0}
                  </td>
                  <td className="px-6 py-4">
                    {c.recentTransactions && c.recentTransactions.length > 0 ? (
                      <div className="space-y-1">
                        {c.recentTransactions.slice(0, 2).map((t: any) => (
                          <div key={t.id} className="text-[11px] flex items-center gap-1.5 text-gray-600">
                            {t.type.startsWith('earned') || t.type === 'daily_login' ? (
                              <ArrowUpRight className="w-3 h-3 text-green-500" />
                            ) : (
                              <ArrowDownRight className="w-3 h-3 text-red-500" />
                            )}
                            <span className="truncate max-w-[180px]">{t.description} ({t.amount} pts)</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">No recent transactions</span>
                    )}
                  </td>
                </tr>
              ))}
              {citizensData.length === 0 && !fetchingCitizens && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400 text-xs">
                    No citizens found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Global Reward Catalog Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold">Create Global Reward Item</CardTitle>
          <p className="text-xs text-gray-500">Add reward items that Citizens can redeem with their earned points.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Reward Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Free Bus Pass / Coffee" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Points Cost</label>
              <Input type="number" value={points} onChange={e => setPoints(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Collection Info</label>
              <Input value={collectionInfo} onChange={e => setCollectionInfo(e.target.value)} placeholder="e.g. Show ID at Janakpur Metro Office" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. 1 Month Pass for Public Transport" />
            </div>
          </div>
          <Button onClick={handleAddReward} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
            <Plus className="w-4 h-4 mr-2" /> Create Reward Item
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold">Active Global Reward Catalogue</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-4">Reward</th>
                <th className="px-6 py-4">Cost (Points)</th>
                <th className="px-6 py-4">Details</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rewards.map(reward => (
                <tr key={reward.id} className="bg-white border-b">
                  <td className="px-6 py-4 font-semibold text-gray-900">{reward.name}</td>
                  <td className="px-6 py-4 font-mono font-bold text-yellow-600">{reward.points}</td>
                  <td className="px-6 py-4">
                    <div className="text-xs text-gray-500">{reward.description}</div>
                    <div className="text-xs text-gray-400 mt-1">Collection: {reward.collectionInfo}</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(reward.id)} disabled={loading}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
              {rewards.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-500">
                    No global rewards created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

