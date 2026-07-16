'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { createGlobalReward, deleteReward } from '@/utils/db/adminActions'

export function RewardsManager({ rewards, currentAdminId, onUpdate }: { rewards: any[], currentAdminId: number, onUpdate: () => void }) {
  const [loading, setLoading] = useState(false)
  
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [points, setPoints] = useState(100)
  const [collectionInfo, setCollectionInfo] = useState('')

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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card>
        <CardHeader>
          <CardTitle>Create Global Reward</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Free Coffee" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Points Cost</label>
              <Input type="number" value={points} onChange={e => setPoints(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Collection Info</label>
              <Input value={collectionInfo} onChange={e => setCollectionInfo(e.target.value)} placeholder="e.g. Show ID at Cafe" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. 1 Free Coffee" />
            </div>
          </div>
          <Button onClick={handleAddReward} disabled={loading}><Plus className="w-4 h-4 mr-2" /> Create Reward</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Global Rewards</CardTitle>
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
                    No rewards found.
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
