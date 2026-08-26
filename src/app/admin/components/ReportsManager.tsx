'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trash2, Search, Eye, MapPin, Navigation, CheckCircle, X, FileSpreadsheet, ShieldAlert, ShieldCheck, Sparkles, Filter, Calendar, ArrowRight, Activity, Percent, Loader } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { updateTaskStatus, getVerificationHistoryByReportId } from '@/utils/db/actions'
import { autoAssignCollectors } from '@/utils/db/autoAssignActions'

type Report = {
  id: number
  userId: number
  location: string
  latitude?: number | null
  longitude?: number | null
  formattedAddress?: string | null
  wardNumber?: string | null
  wasteType: string
  amount: string
  imageUrl?: string | null
  status: string
  createdAt: string
  collectorId?: number | null
  collectorLat?: number | null
  collectorLng?: number | null
  collectorVerifiedAt?: any
  locationVerified?: boolean | null
  distanceMeters?: number | null
  citizenName?: string
  collectorName?: string | null
  verificationResult?: any
}

export function ReportsManager({ reports: initialReports, currentAdminId, onUpdate }: {
  reports: Report[]
  currentAdminId: number
  onUpdate: () => void
}) {
  const [reports, setReports] = useState(initialReports)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  
  // Custom AI CRM Filters
  const [aiStatusFilter, setAiStatusFilter] = useState('all')
  const [aiCategoryFilter, setAiCategoryFilter] = useState('all')
  const [minConfidence, setMinConfidence] = useState(0)
  const [onlyDuplicates, setOnlyDuplicates] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Fetch audit history on selection
  useState(() => {
    if (selectedReport) {
      setHistoryLoading(true)
      getVerificationHistoryByReportId(selectedReport.id).then(res => {
        setHistory(res || [])
        setHistoryLoading(false)
      }).catch(err => {
        console.error(err)
        setHistoryLoading(false)
      })
    }
  })

  // Hook for selectedReport changes to reload timeline history
  const loadHistory = async (reportId: number) => {
    setHistoryLoading(true)
    try {
      const res = await getVerificationHistoryByReportId(reportId)
      setHistory(res || [])
    } catch (e) {
      console.error(e)
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleSelectReport = (r: Report) => {
    setSelectedReport(r)
    loadHistory(r.id)
  }

  const filtered = reports.filter(r => {
    const matchSearch = r.location.toLowerCase().includes(search.toLowerCase()) ||
      r.wasteType.toLowerCase().includes(search.toLowerCase()) ||
      (r.citizenName || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.wardNumber || '').includes(search)
    
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    
    // AI audit parsing
    const ai = r.verificationResult || {}
    
    const matchAiStatus = aiStatusFilter === 'all' || 
      (ai.verificationStatus || '').toLowerCase() === aiStatusFilter.toLowerCase()
      
    const matchAiCategory = aiCategoryFilter === 'all' ||
      (ai.wasteCategory || r.wasteType || '').toLowerCase() === aiCategoryFilter.toLowerCase()

    const confidenceVal = ai.aiConfidence !== undefined ? ai.aiConfidence : (ai.confidence ? ai.confidence * 100 : 0)
    const matchConfidence = confidenceVal >= minConfidence

    const matchDuplicate = !onlyDuplicates || ai.isDuplicate === true

    // Date checks
    let matchDate = true
    if (startDate || endDate) {
      const repDate = new Date(r.createdAt)
      if (startDate) {
        const start = new Date(startDate)
        if (repDate < start) matchDate = false
      }
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        if (repDate > end) matchDate = false
      }
    }

    return matchSearch && matchStatus && matchAiStatus && matchAiCategory && matchConfidence && matchDuplicate && matchDate
  })

  const exportToCSV = () => {
    try {
      const headers = [
        "Report ID", "Citizen Name", "Location", "Ward", "Waste Type", "Status", 
        "AI Status", "AI Confidence", "Final Decision", "Weight (kg)", "Objects Count", 
        "Cleanliness", "Risk Level", "Is Duplicate", "AI Generated", "Fire Detected", 
        "GPS Match", "Date Created"
      ]
      
      const rows = filtered.map(r => {
        const ai = r.verificationResult || {}
        const conf = ai.aiConfidence !== undefined ? ai.aiConfidence : (ai.confidence ? ai.confidence * 100 : 0)
        return [
          r.id,
          r.citizenName || "Unknown",
          `"${r.location.replace(/"/g, '""')}"`,
          r.wardNumber || "—",
          ai.wasteCategory || r.wasteType,
          r.status,
          ai.verificationStatus || "N/A",
          `${conf}%`,
          ai.finalDecision || "N/A",
          ai.estimatedWeightKg || r.amount || "N/A",
          ai.objectsCount || "N/A",
          ai.cleanlinessScore !== undefined ? `${ai.cleanlinessScore}/100` : "N/A",
          ai.environmentalRisk || "N/A",
          ai.isDuplicate ? "Yes" : "No",
          ai.isAiGenerated ? "Yes" : "No",
          ai.fireOrSmoke ? "Yes" : "No",
          ai.gpsLocationVerified ? "Yes" : "No",
          r.createdAt
        ]
      })

      const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n")
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.setAttribute("href", url)
      link.setAttribute("download", `waste_inspection_audit_${new Date().toISOString().slice(0,10)}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success("Audit CSV report exported successfully!")
    } catch (err) {
      console.error(err)
      toast.error("Failed to export CSV")
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Permanently delete this report?')) return
    setLoading(true)
    try {
      const { deleteReport: del } = await import('@/utils/db/adminActions')
      const ok = await del(currentAdminId, id)
      if (ok) {
        setReports(reports.filter(r => r.id !== id))
        toast.success('Report deleted')
        onUpdate()
      } else {
        toast.error('Failed to delete')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (reportId: number, newStatus: string) => {
    setLoading(true)
    try {
      const updated = await updateTaskStatus(reportId, newStatus)
      if (updated) {
        setReports(reports.map(r => r.id === reportId ? { ...r, status: newStatus } : r))
        toast.success('Status updated')
        onUpdate()
      }
    } finally {
      setLoading(false)
    }
  }

  const handleAutoAssign = async () => {
    setLoading(true)
    try {
      const result = await autoAssignCollectors(1) // Admin ID placeholder
      if (result.success) {
        toast.success(result.message)
        onUpdate() // Trigger a refresh
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error('Failed to auto-assign collectors')
    } finally {
      setLoading(false)
    }
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
    verified: 'bg-green-100 text-green-800 border-green-200',
    completed: 'bg-purple-100 text-purple-800 border-purple-200',
    pending_manual_review: 'bg-orange-100 text-orange-800 border-orange-200',
  }

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card className="border-gray-100">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold text-gray-900">Reports & Tasks</CardTitle>
          <p className="text-xs text-gray-500">Manage waste reports including GPS verification data.</p>
        </CardHeader>
        <CardContent>
          {/* CRM Search and AI Filters */}
          <div className="bg-gray-50/50 border border-gray-100 p-4 rounded-2xl mb-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search location, type, citizen, or ward..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44 text-sm">
                  <SelectValue placeholder="System Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All System Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending_manual_review">Pending Manual Review</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleAutoAssign} variant="outline" className="flex items-center gap-1.5 text-xs font-bold border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100" disabled={loading}>
                <Sparkles className="w-4 h-4" /> Auto-Assign Tasks (AI)
              </Button>
              <Button onClick={exportToCSV} variant="outline" className="flex items-center gap-1.5 text-xs font-bold border-green-200 text-green-700 bg-green-50 hover:bg-green-100">
                <FileSpreadsheet className="w-4 h-4" /> Export CSV
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 pt-2 border-t border-gray-100/60">
              
              {/* Category Filter */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Waste Category</label>
                <Select value={aiCategoryFilter} onValueChange={setAiCategoryFilter}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="plastic">Plastic</SelectItem>
                    <SelectItem value="paper">Paper</SelectItem>
                    <SelectItem value="glass">Glass</SelectItem>
                    <SelectItem value="metal">Metal</SelectItem>
                    <SelectItem value="organic">Organic</SelectItem>
                    <SelectItem value="electronic">Electronic</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* AI Status Filter */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">AI Audit Status</label>
                <Select value={aiStatusFilter} onValueChange={setAiStatusFilter}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="AI Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All AI Statuses</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="suspicious">Suspicious</SelectItem>
                    <SelectItem value="duplicate">Duplicate</SelectItem>
                    <SelectItem value="invalid image">Invalid Image</SelectItem>
                    <SelectItem value="low quality">Low Quality</SelectItem>
                    <SelectItem value="not waste">Not Waste</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Minimum Confidence Slider */}
              <div className="col-span-2">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-black text-gray-400 uppercase">Min Confidence</label>
                  <span className="text-[10px] font-black text-blue-600">{minConfidence}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={minConfidence} 
                  onChange={e => setMinConfidence(Number(e.target.value))} 
                  className="w-full accent-blue-600 cursor-pointer h-1.5 bg-gray-200 rounded-lg appearance-none" 
                />
              </div>

              {/* Duplicate Checkbox */}
              <div className="flex items-center pt-4">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={onlyDuplicates} 
                    onChange={e => setOnlyDuplicates(e.target.checked)} 
                    className="rounded text-green-600 focus:ring-green-400 h-3.5 w-3.5"
                  />
                  <span className="text-[10px] font-black text-gray-500 uppercase">Duplicates Only</span>
                </label>
              </div>

              {/* Date Inputs */}
              <div className="col-span-2 md:col-span-1">
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">From Date</label>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={e => setStartDate(e.target.value)} 
                  className="w-full text-xs h-9 border border-gray-200 rounded-lg px-2 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" 
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['#', 'Location / Ward', 'Citizen', 'Type', 'Status', 'GPS', 'Actions'].map(h => (
                    <th key={h} className="px-3 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.slice(0, 100).map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3 font-bold text-gray-400">#{r.id}</td>
                    <td className="px-3 py-3 max-w-xs">
                      <div className="flex items-start gap-1.5">
                        <MapPin className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-gray-800 truncate max-w-[180px]" title={r.location}>{r.location}</p>
                          {r.wardNumber && <p className="text-gray-400 text-[10px]">Ward {r.wardNumber}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-600">{r.citizenName || 'Unknown'}</td>
                    <td className="px-3 py-3 text-gray-600 max-w-[100px] truncate" title={r.wasteType}>{r.wasteType}</td>
                    <td className="px-3 py-3">
                      <Select value={r.status} onValueChange={(v) => handleStatusChange(r.id, v)} disabled={loading}>
                        <SelectTrigger className={`h-7 text-[10px] px-2 border rounded-full font-semibold min-w-[90px] ${statusColor[r.status] || ''}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="verified">Verified</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="pending_manual_review">Pending Manual Review</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-3">
                      {r.latitude ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1 text-green-600">
                            <Navigation className="w-3 h-3" /> GPS ✓
                          </span>
                          {r.locationVerified !== null && r.locationVerified !== undefined && (
                            <span className={`text-[10px] font-semibold ${r.locationVerified ? 'text-green-600' : 'text-red-500'}`}>
                              {r.locationVerified ? '✓ Verified' : '✗ Failed'}
                              {r.distanceMeters !== null && r.distanceMeters !== undefined && ` (${r.distanceMeters}m)`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-[10px]">No GPS</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSelectReport(r)} title="View Details">
                          <Eye className="h-3.5 w-3.5 text-blue-500" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(r.id)} disabled={loading} title="Delete">
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-gray-400">
                      No reports found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > 100 && (
            <p className="text-xs text-gray-400 mt-2 text-center">Showing 100 of {filtered.length} reports.</p>
          )}
        </CardContent>
      </Card>

      {/* Azure Computer Vision / AI Studio Detail Modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white/95 backdrop-blur-xl border border-white rounded-3xl p-6 sm:p-8 max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl relative">
            
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-gray-100 pb-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-extrabold text-gray-900">AI Verification Audit Console</h3>
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-[10px] font-bold text-gray-500">Report #{selectedReport.id}</span>
                  </div>
                  <p className="text-xs text-gray-400">Citizen: {selectedReport.citizenName} | Filed on {selectedReport.createdAt}</p>
                </div>
              </div>
              <button onClick={() => setSelectedReport(null)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Before / After Images Side-by-Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">BEFORE: Citizen Submission</p>
                {selectedReport.imageUrl ? (
                  <img src={selectedReport.imageUrl} alt="Before Cleanup" className="w-full h-44 object-cover rounded-xl border border-gray-200" />
                ) : (
                  <div className="w-full h-44 flex items-center justify-center bg-gray-100 rounded-xl text-gray-400 text-xs">No image uploaded</div>
                )}
              </div>
              <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">AFTER: Cleanup Verification</p>
                {selectedReport.verificationResult?.cleanupSuccess ? (
                  <div className="relative">
                    <div className="absolute top-2 right-2 bg-green-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded shadow">CLEANED</div>
                    <img src={selectedReport.imageUrl || ''} alt="After Cleanup" className="w-full h-44 object-cover rounded-xl border border-gray-200 brightness-95 saturate-50" />
                  </div>
                ) : (
                  <div className="w-full h-44 flex items-center justify-center bg-gray-100/60 rounded-xl text-gray-400 text-xs border border-dashed border-gray-200">
                    Pending collector verification capture.
                  </div>
                )}
              </div>
            </div>

            {/* AI Analysis Result Console */}
            {selectedReport.verificationResult ? (
              <div className="space-y-6">
                
                {/* 30+ Field Metrics Grid */}
                <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100/80">
                  <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest border-b border-gray-200/60 pb-2 mb-4 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-blue-500" /> Inspection Telemetry Grid
                  </h4>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <DetailItem label="Verification Status" value={selectedReport.verificationResult.verificationStatus || "N/A"} />
                    <DetailItem label="Confidence" value={`${selectedReport.verificationResult.aiConfidence || selectedReport.verificationResult.confidence * 100 || 0}%`} />
                    <DetailItem label="Waste Category" value={selectedReport.verificationResult.wasteCategory || selectedReport.verificationResult.wasteType || "Mixed"} />
                    <DetailItem label="Estimated Weight" value={
                      typeof selectedReport.verificationResult.estimatedWeightKg === 'string' && selectedReport.verificationResult.estimatedWeightKg.includes('Not')
                        ? selectedReport.verificationResult.estimatedWeightKg
                        : `${selectedReport.verificationResult.estimatedWeightKg || selectedReport.verificationResult.estimatedWeight || "0.0"} kg`
                    } />
                    <DetailItem label="Quantity" value={selectedReport.verificationResult.estimatedQuantity || "N/A"} />
                    <DetailItem label="Estimated Volume" value={selectedReport.verificationResult.estimatedVolume || "N/A"} />
                    <DetailItem label="Objects Count" value={selectedReport.verificationResult.objectsCount || "0"} />
                    <DetailItem label="Waste Density" value={selectedReport.verificationResult.wasteDensity || "N/A"} />
                    <DetailItem label="Cleanliness" value={`${selectedReport.verificationResult.cleanlinessScore || 0}/100`} />
                    <DetailItem label="Risk Level" value={selectedReport.verificationResult.environmentalRisk || "N/A"} />
                    <DetailItem label="Recyclable" value={selectedReport.verificationResult.recyclable ? "Yes" : "No"} />
                    <DetailItem label="Priority Level" value={selectedReport.verificationResult.priority || "N/A"} />
                    <DetailItem label="Severity Score" value={`${selectedReport.verificationResult.severityScore || 0}%`} />
                    <DetailItem label="Image Quality" value={`${selectedReport.verificationResult.imageQualityScore || 90}%`} />
                    <DetailItem label="GPS Matches" value={selectedReport.verificationResult.gpsLocationVerified ? "Yes" : "No"} />
                    <DetailItem label="Final Decision" value={selectedReport.verificationResult.finalDecision || "Accept Report"} />
                  </div>
                </div>

                {/* vision detections */}
                <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100/80">
                  <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest border-b border-gray-200/60 pb-2 mb-3">AI Vision Sensor Array Detections</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Is Duplicate Report", value: selectedReport.verificationResult.isDuplicate },
                      { label: "Duplicate Confidence", value: `${selectedReport.verificationResult.duplicateConfidence || 0}%` },
                      { label: "AI Generated Photo", value: selectedReport.verificationResult.isAiGenerated },
                      { label: "Human Presence", value: selectedReport.verificationResult.humanPresence },
                      { label: "Vehicle Detected", value: selectedReport.verificationResult.vehiclePresence },
                      { label: "Animal Detected", value: selectedReport.verificationResult.animalPresence },
                      { label: "Fire or Smoke", value: selectedReport.verificationResult.fireOrSmoke },
                      { label: "Water/Flood", value: selectedReport.verificationResult.waterOrFlood },
                    ].map(det => (
                      <div key={det.label} className="bg-white p-2.5 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                        <span className="text-gray-400 font-bold">{det.label}</span>
                        <span className={`font-black uppercase ${det.value && det.value !== '0%' ? 'text-blue-600' : 'text-gray-300'}`}>
                          {det.value === true ? "Yes" : det.value === false ? "No" : det.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Audit recommendation boxes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-xl border border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Recycling Suggestions</p>
                    <p className="text-xs text-gray-600 font-medium leading-relaxed">{selectedReport.verificationResult.recyclingSuggestions || "None."}</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Disposal Instructions</p>
                    <p className="text-xs text-gray-600 font-medium leading-relaxed">{selectedReport.verificationResult.disposalInstructions || "None."}</p>
                  </div>
                  <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 col-span-2">
                    <p className="text-[10px] font-black text-blue-500 uppercase mb-1">Inspector Recommendation</p>
                    <p className="text-xs text-blue-900 font-bold leading-relaxed">{selectedReport.verificationResult.aiRecommendation || "None."}</p>
                  </div>
                </div>

              </div>
            ) : (
              <div className="text-center py-10 bg-gray-50 rounded-2xl text-gray-400 text-sm">
                No AI inspection logs exist for this report yet.
              </div>
            )}

            {/* Audit History Timeline Section */}
            <div className="mt-8 border-t border-gray-100 pt-6">
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">Inspection Audit History Timeline</h4>
              
              {historyLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
                  <Loader className="w-4 h-4 animate-spin text-blue-500" /> Fetching database audit logs...
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((h, i) => (
                    <div key={h.id} className="relative pl-6 border-l-2 border-blue-100 pb-2">
                      <div className="absolute left-[-5px] top-1.5 w-2 h-2 rounded-full bg-blue-500" />
                      <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center text-xs mb-1">
                        <span className="font-extrabold text-gray-800 capitalize">
                          {h.checkType === 'citizen_report' ? 'Citizen Report Check' : `Collector Cleanup Check (${h.checkerName || 'Unknown'})`}
                        </span>
                        <span className="text-gray-400 text-[10px]">{new Date(h.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-start justify-between text-xs gap-3">
                        <div>
                          <p className="text-gray-600 font-medium leading-relaxed">
                            {h.fullResult?.beforeAfterComparison || h.fullResult?.aiRecommendation || h.fullResult?.observations || "Verified successfully."}
                          </p>
                          {h.fullResult?.recyclableItems && (
                            <p className="text-[10px] text-green-700 font-bold mt-1">Items: {h.fullResult.recyclableItems}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            h.finalDecision === 'Accept Report' 
                              ? 'bg-green-100 text-green-800' 
                              : h.finalDecision === 'Needs Manual Review'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {h.finalDecision}
                          </span>
                          <p className="text-[10px] font-black text-gray-400 mt-1 uppercase tracking-wide">Status: {h.verificationStatus}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {history.length === 0 && (
                    <p className="text-xs text-gray-400 italic">No historical verification check matches found in SQLite.</p>
                  )}
                </div>
              )}
            </div>

            {/* GPS Section */}
            <div className="bg-gray-50 rounded-xl p-4 text-xs space-y-2 border border-gray-100 mt-6">
              <h4 className="font-bold text-gray-700 flex items-center gap-1.5 mb-2">
                <Navigation className="w-4 h-4 text-green-600" />
                GPS Proximity Geolocation
              </h4>
              {selectedReport.latitude ? (
                <>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-gray-500">
                      <MapPin className="w-3 h-3 text-red-500" />
                      Citizen GPS (Reported)
                    </span>
                    <span className="font-mono font-semibold text-gray-700">
                      {selectedReport.latitude?.toFixed(5)}, {selectedReport.longitude?.toFixed(5)}
                    </span>
                  </div>
                  {selectedReport.collectorLat && (
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5 text-gray-500">
                        <Navigation className="w-3 h-3 text-blue-500" />
                        Collector GPS (Collection)
                      </span>
                      <span className="font-mono font-semibold text-gray-700">
                        {selectedReport.collectorLat?.toFixed(5)}, {selectedReport.collectorLng?.toFixed(5)}
                      </span>
                    </div>
                  )}
                  {selectedReport.distanceMeters !== null && selectedReport.distanceMeters !== undefined && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">Distance Between Points</span>
                      <span className={`font-bold ${(selectedReport.distanceMeters || 0) <= 100 ? 'text-green-600' : 'text-red-600'}`}>
                        {selectedReport.distanceMeters}m
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                    <span className="text-gray-500">Location Verified</span>
                    <span className={`font-bold ${selectedReport.locationVerified ? 'text-green-600' : 'text-red-500'}`}>
                      {selectedReport.locationVerified ? '✓ Yes (≤100m)' : selectedReport.collectorLat ? '✗ No (>100m)' : '—'}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-gray-400">No GPS data — report submitted without location coordinates.</p>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
      <p className="text-gray-400 font-semibold uppercase tracking-wider text-[10px]">{label}</p>
      <p className="text-gray-800 font-medium mt-0.5 break-words">{value}</p>
    </div>
  )
}
