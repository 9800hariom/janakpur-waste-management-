'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getRecentActivityLogs } from '@/utils/db/adminActions'
import { Activity } from 'lucide-react'

export function ActivityLogsManager() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    const data = await getRecentActivityLogs(50)
    setLogs(data)
    setLoading(false)
  }

  if (loading) return <div>Loading logs...</div>

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CardHeader>
        <CardTitle className="flex items-center"><Activity className="w-5 h-5 mr-2 text-blue-500" /> System Activity Logs</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-4">Time</th>
              <th className="px-6 py-4">Admin / User</th>
              <th className="px-6 py-4">Action</th>
              <th className="px-6 py-4">Target</th>
              <th className="px-6 py-4">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className="bg-white border-b hover:bg-gray-50">
                <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="px-6 py-4 font-medium text-gray-900">
                  {log.userName}
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-md text-xs font-bold font-mono">
                    {log.action}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-600 text-xs">
                  {log.targetTable} {log.targetId ? `#${log.targetId}` : ''}
                </td>
                <td className="px-6 py-4 text-gray-400 text-xs font-mono truncate max-w-[200px]" title={log.details}>
                  {log.details || '-'}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-500">
                  No recent activity.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
