'use client'
import { useState, useEffect } from 'react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, CheckCircle, XCircle, PauseCircle, Clock, Mail, Phone, MapPin, Building, Calendar } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { getAllCollectors, updateCollectorStatus } from '@/utils/db/adminActions'

type Collector = {
  id: number
  name: string
  email: string
  fullName: string | null
  address: string | null
  wardNumber: string | null
  phone: string | null
  governmentId: string | null
  status: string | null
  createdAt: Date | null
}

const statusConfig: Record<string, { label: string; bg: string; text: string; border: string }> = {
  pending:   { label: 'Pending',   bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-300' },
  active:    { label: 'Active',    bg: 'bg-green-50',  text: 'text-green-800',  border: 'border-green-300'  },
  rejected:  { label: 'Rejected', bg: 'bg-red-50',    text: 'text-red-800',    border: 'border-red-300'    },
  suspended: { label: 'Suspended',bg: 'bg-gray-100',  text: 'text-gray-700',   border: 'border-gray-300'   },
}

export function CollectorApprovalManager({ currentAdminId }: { currentAdminId: number }) {
  const [collectors, setCollectors] = useState<Collector[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingId, setLoadingId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('pending')

  const fetchCollectors = async () => {
    setLoading(true)
    try {
      const data = await getAllCollectors()
      setCollectors(data as Collector[])
    } catch (e) {
      toast.error('Failed to load collectors.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCollectors() }, [])

  const handleStatusChange = async (collectorId: number, newStatus: 'active' | 'rejected' | 'suspended') => {
    const label = newStatus === 'active' ? 'APPROVE' : newStatus === 'rejected' ? 'REJECT' : 'SUSPEND'
    if (!confirm(`Are you sure you want to ${label} this collector?`)) return
    setLoadingId(collectorId)
    try {
      const ok = await updateCollectorStatus(currentAdminId, collectorId, newStatus)
      if (ok) {
        toast.success(`Collector ${newStatus === 'active' ? 'approved' : newStatus === 'rejected' ? 'rejected' : 'suspended'} successfully.`)
        setCollectors(prev => prev.map(c => c.id === collectorId ? { ...c, status: newStatus } : c))
      } else {
        toast.error('Action failed.')
      }
    } finally {
      setLoadingId(null)
    }
  }

  const filtered = collectors.filter(c => {
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus
    const term = searchTerm.toLowerCase()
    const matchesSearch =
      (c.name || '').toLowerCase().includes(term) ||
      (c.email || '').toLowerCase().includes(term) ||
      (c.phone || '').includes(term) ||
      (c.wardNumber || '').includes(term) ||
      (c.governmentId || '').toLowerCase().includes(term)
    return matchesStatus && matchesSearch
  })

  const pendingCount = collectors.filter(c => c.status === 'pending').length

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            Collector Approval
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-full border border-yellow-300">
                {pendingCount} Pending
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Review and manage collector account applications.</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search collectors..."
              className="pl-9 w-48 text-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="border border-gray-200 rounded-lg text-xs px-2 py-2 bg-white text-gray-700"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
            <option value="all">All</option>
          </select>
          <Button variant="outline" size="sm" onClick={fetchCollectors} className="text-xs">Refresh</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-gray-400">
          <Clock className="w-10 h-10 mx-auto mb-3 text-gray-200" />
          <p className="font-medium">
            {filterStatus === 'pending' ? 'No pending collectors to review.' : 'No collectors found.'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map(collector => {
            const sc = statusConfig[collector.status || 'pending'] || statusConfig['pending']
            return (
              <Card key={collector.id} className="p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1 space-y-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm flex-shrink-0">
                        {(collector.fullName || collector.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">{collector.fullName || collector.name}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${sc.bg} ${sc.text} ${sc.border}`}>
                          {sc.label}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-6 text-xs text-gray-600">
                      <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /><span className="truncate">{collector.email}</span></div>
                      <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /><span>{collector.phone || '—'}</span></div>
                      <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /><span>{collector.address || '—'}</span></div>
                      <div className="flex items-center gap-1.5"><Building className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /><span>Ward {collector.wardNumber || '—'}</span></div>
                      <div className="flex items-center gap-1.5"><span className="text-gray-400 text-[10px] font-bold">GOV ID:</span><span className="font-mono">{collector.governmentId || '—'}</span></div>
                      <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /><span>Registered: {collector.createdAt ? new Date(collector.createdAt).toLocaleDateString() : '—'}</span></div>
                    </div>
                  </div>
                  <div className="flex flex-row sm:flex-col gap-2 sm:w-32">
                    {collector.status !== 'active' && (
                      <Button size="sm" className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white text-xs" onClick={() => handleStatusChange(collector.id, 'active')} disabled={loadingId === collector.id}>
                        <CheckCircle className="w-3.5 h-3.5 mr-1" />Approve
                      </Button>
                    )}
                    {collector.status !== 'rejected' && (
                      <Button size="sm" variant="destructive" className="flex-1 sm:flex-none text-xs" onClick={() => handleStatusChange(collector.id, 'rejected')} disabled={loadingId === collector.id}>
                        <XCircle className="w-3.5 h-3.5 mr-1" />Reject
                      </Button>
                    )}
                    {collector.status === 'active' && (
                      <Button size="sm" variant="outline" className="flex-1 sm:flex-none text-xs border-orange-300 text-orange-700 hover:bg-orange-50" onClick={() => handleStatusChange(collector.id, 'suspended')} disabled={loadingId === collector.id}>
                        <PauseCircle className="w-3.5 h-3.5 mr-1" />Suspend
                      </Button>
                    )}
                    {loadingId === collector.id && <div className="text-[10px] text-gray-400 text-center">Processing...</div>}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
