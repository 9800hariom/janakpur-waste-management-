'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Trash2, Plus, Edit } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { getWasteCategories, createWasteCategory, updateWasteCategory, deleteWasteCategory, getSystemSettings, updateSystemSetting } from '@/utils/db/adminActions'

export function SettingsManager({ currentAdminId }: { currentAdminId: number }) {
  const [categories, setCategories] = useState<any[]>([])
  const [settings, setSettings] = useState<any>({})
  const [loading, setLoading] = useState(true)

  const [newCatName, setNewCatName] = useState('')
  const [newCatPoints, setNewCatPoints] = useState(10)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    const cats = await getWasteCategories()
    const sets = await getSystemSettings()
    setCategories(cats)
    setSettings(sets)
    setLoading(false)
  }

  const handleAddCategory = async () => {
    if (!newCatName) return toast.error("Name is required");
    const res = await createWasteCategory(currentAdminId, { name: newCatName, description: '', pointsValue: newCatPoints });
    if (res) {
      toast.success("Category added")
      setNewCatName('')
      setNewCatPoints(10)
      fetchData()
    } else {
      toast.error("Failed to add category (might be duplicate)")
    }
  }

  const handleDeleteCategory = async (id: number) => {
    if (!confirm("Delete this category?")) return;
    const res = await deleteWasteCategory(currentAdminId, id);
    if (res) {
      toast.success("Category deleted")
      fetchData()
    }
  }

  const handleSaveSetting = async (key: string, value: string) => {
    const res = await updateSystemSetting(currentAdminId, key, value);
    if (res) {
      toast.success("Setting updated")
      fetchData()
    }
  }

  if (loading) return <div>Loading settings...</div>

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <Card>
        <CardHeader>
          <CardTitle>System Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Platform Name</label>
              <div className="flex gap-2">
                <Input 
                  defaultValue={settings['platform_name'] || 'Smart Waste Management'} 
                  id="platform_name"
                />
                <Button onClick={() => handleSaveSetting('platform_name', (document.getElementById('platform_name') as HTMLInputElement).value)}>Save</Button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Maintenance Mode</label>
              <div className="flex gap-2">
                <select 
                  id="maintenance_mode"
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-green-500 focus:border-green-500 block w-full p-2.5"
                  defaultValue={settings['maintenance_mode'] || 'false'}
                >
                  <option value="false">Off (Active)</option>
                  <option value="true">On (Maintenance)</option>
                </select>
                <Button onClick={() => handleSaveSetting('maintenance_mode', (document.getElementById('maintenance_mode') as HTMLSelectElement).value)}>Save</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Waste Categories & Points</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category Name</label>
              <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="e.g. E-Waste" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Points Value</label>
              <Input type="number" value={newCatPoints} onChange={(e) => setNewCatPoints(Number(e.target.value))} />
            </div>
            <Button onClick={handleAddCategory}><Plus className="w-4 h-4 mr-2" /> Add</Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Points</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => (
                  <tr key={cat.id} className="border-b">
                    <td className="px-4 py-2 font-medium">{cat.name}</td>
                    <td className="px-4 py-2">{cat.pointsValue}</td>
                    <td className="px-4 py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteCategory(cat.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                    </td>
                  </tr>
                ))}
                {categories.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-gray-500">No categories found.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
