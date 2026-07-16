'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, MapPin, CheckCircle, XCircle, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { updateReportStatus } from '@/utils/db/actions'
import { deleteReport } from '@/utils/db/adminActions'

export function ReportsManager({ reports, currentAdminId, onUpdate }: { reports: any[], currentAdminId: number, onUpdate: () => void }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [loadingId, setLoadingId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')

  const filtered = reports.filter(r => {
    const matchesSearch = r.location?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          r.wasteType?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          r.citizenName?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const handleStatusChange = async (id: number, newStatus: string) => {
    setLoadingId(id)
    try {
      const res = await updateReportStatus(id, newStatus);
      if (res) {
        toast.success(`Report marked as ${newStatus}`)
        onUpdate()
      } else {
        toast.error("Failed to update report")
      }
    } finally {
      setLoadingId(null)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to permanently delete this report?")) return;
    
    setLoadingId(id)
    try {
      const res = await deleteReport(currentAdminId, id);
      if (res) {
        toast.success("Report deleted successfully")
        onUpdate()
      } else {
        toast.error("Failed to delete report")
      }
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-bold text-gray-800">Reports Management</h2>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <select 
            className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-green-500 focus:border-green-500 block p-2"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="verified">Verified</option>
          </select>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input 
              placeholder="Search locations, users..." 
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-4">Report Info</th>
                <th className="px-6 py-4">Citizen / Collector</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(report => (
                <tr key={report.id} className="bg-white border-b hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-gray-900">{report.wasteType}</div>
                    <div className="text-gray-500 text-xs flex items-center">
                      <MapPin className="w-3 h-3 mr-1 inline" /> {report.location}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-gray-900 font-medium">By: {report.citizenName}</div>
                    <div className="text-gray-500 text-xs">Assigned: {report.collectorName || 'None'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold capitalize
                      ${report.status === 'verified' ? 'bg-green-100 text-green-800' : 
                        report.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                        report.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' : 
                        'bg-red-100 text-red-800'}`}>
                      {report.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-xs">
                    {report.createdAt}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <select 
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg p-1.5 inline-block mr-2"
                      value={report.status}
                      onChange={(e) => handleStatusChange(report.id, e.target.value)}
                      disabled={loadingId === report.id}
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="verified">Verified</option>
                    </select>
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      onClick={() => handleDelete(report.id)}
                      disabled={loadingId === report.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">
                    No reports found.
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
