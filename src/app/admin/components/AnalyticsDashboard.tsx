'use client'
import { useState, useEffect } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadialBarChart, RadialBar
} from 'recharts'
import { getFullAnalytics } from '@/utils/db/analyticsActions'
import {
  Loader, TrendingUp, TrendingDown, FileText, CheckCircle, Clock, Users, Trash2,
  MapPin, Leaf, BarChart3, RefreshCw, Filter, AlertTriangle, Navigation
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
        <p className="font-bold text-gray-700 mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }} className="font-semibold">
            {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </p>
        ))}
      </div>
    )
  }
  return null
}

function KPICard({ title, value, subtitle, icon: Icon, color, trend }: any) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
        <div className={`p-2 rounded-xl ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <div className="text-3xl font-extrabold text-gray-900 mb-1">{value}</div>
      {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      {trend !== undefined && (
        <div className={`flex items-center gap-1 mt-2 text-xs font-semibold ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {Math.abs(trend)}% vs last month
        </div>
      )}
    </div>
  )
}

function SectionTitle({ icon: Icon, title, subtitle }: any) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
        <Icon className="w-5 h-5 text-green-600" />
        {title}
      </h2>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [trendView, setTrendView] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly')
  const [lastRefreshed, setLastRefreshed] = useState(new Date())

  const fetchData = async () => {
    setLoading(true)
    try {
      const analytics = await getFullAnalytics({ days: 30 })
      setData(analytics)
      setLastRefreshed(new Date())
    } catch (error) {
      console.error("Analytics fetch error:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <Loader className="animate-spin h-10 w-10 text-green-600" />
        <p className="text-sm text-gray-500 font-medium">Loading live analytics from database...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <p className="text-sm text-gray-500">Failed to load analytics. Please try again.</p>
        <Button onClick={fetchData} size="sm">Retry</Button>
      </div>
    )
  }

  const { overview, dailyReports, weeklyReports, monthlyReports, yearlyReports, wasteByCategory, organicVsPlastic, recycling, duplicates, wardAnalytics, topWards, activeCitizens, collectorPerf, citizenGrowth, locationStats } = data

  // Trend data selection
  const trendData = {
    daily: (dailyReports || []).map((d: any) => ({ name: d.day?.slice(5), total: Number(d.total), verified: Number(d.verified), pending: Number(d.pending) })),
    weekly: (weeklyReports || []).map((d: any) => ({ name: d.week, total: Number(d.total), verified: Number(d.verified), pending: Number(d.pending) })),
    monthly: (monthlyReports || []).map((d: any) => ({ name: d.month, total: Number(d.total), verified: Number(d.verified), pending: Number(d.pending) })),
    yearly: (yearlyReports || []).map((d: any) => ({ name: d.year, total: Number(d.total), verified: Number(d.verified), pending: Number(d.pending) })),
  }

  const statusPieData = [
    { name: 'Pending', value: overview?.pendingReports || 0, color: '#f59e0b' },
    { name: 'In Progress', value: overview?.inProgressReports || 0, color: '#3b82f6' },
    { name: 'Verified', value: overview?.verifiedReports || 0, color: '#10b981' },
  ].filter(d => d.value > 0)

  const organicData = (organicVsPlastic || []).map((d: any, i: number) => ({
    name: d.category, value: Number(d.count), color: COLORS[i % COLORS.length]
  }))

  const categoryData = (wasteByCategory || []).slice(0, 10).map((d: any) => ({
    name: d.category?.length > 12 ? d.category.slice(0, 12) + '…' : d.category,
    fullName: d.category,
    total: Number(d.total),
    verified: Number(d.verified),
  }))

  const wardData = (wardAnalytics || []).slice(0, 10).map((d: any) => ({
    ward: `Ward ${d.ward}`,
    total: Number(d.total),
    verified: Number(d.verified),
    pending: Number(d.pending),
    rate: Number(d.completion_rate) || 0,
  }))

  const citizenGrowthData = (citizenGrowth || []).map((d: any) => ({
    name: d.month,
    citizens: Number(d.new_citizens),
  }))

  const collectorData = (collectorPerf || []).slice(0, 8).map((d: any) => ({
    name: d.name?.length > 10 ? d.name.slice(0, 10) + '…' : d.name,
    fullName: d.name,
    completed: Number(d.tasks_completed),
    accepted: Number(d.tasks_accepted),
    rate: Number(d.completion_rate) || 0,
  }))

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-green-600" />
            Analytics Dashboard
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Live data from SQLite database • Last updated: {lastRefreshed.toLocaleTimeString()}</p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm" className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <KPICard title="Total Reports" value={(overview?.totalReports || 0).toLocaleString()} subtitle={`${overview?.todaysReports || 0} today`} icon={FileText} color="bg-blue-500" trend={overview?.growthPct} />
        <KPICard title="Verified Reports" value={(overview?.verifiedReports || 0).toLocaleString()} subtitle={`${overview?.aiSuccessRate || 0}% success rate`} icon={CheckCircle} color="bg-green-500" />
        <KPICard title="Pending Reports" value={(overview?.pendingReports || 0).toLocaleString()} subtitle="Awaiting collection" icon={Clock} color="bg-amber-500" />
        <KPICard title="Total Citizens" value={(overview?.totalCitizens || 0).toLocaleString()} subtitle={`${overview?.totalCollectors || 0} collectors`} icon={Users} color="bg-purple-500" />
        <KPICard title="Avg Cleanup Time" value={`${overview?.avgCleanupHours || 0}h`} subtitle="From report to verified" icon={Clock} color="bg-indigo-500" />
        <KPICard title="Total Weight" value={`${(overview?.totalWeightKg || 0).toLocaleString()} kg`} subtitle="Verified collections" icon={Trash2} color="bg-teal-500" />
        <KPICard title="CO₂ Reduced" value={`${(overview?.co2ReductionKg || 0).toLocaleString()} kg`} subtitle="Est. environmental impact" icon={Leaf} color="bg-emerald-600" />
        <KPICard title="Recycling Rate" value={`${recycling?.percentage || 0}%`} subtitle={`${recycling?.recyclable || 0} of ${recycling?.total || 0} verified`} icon={RefreshCw} color="bg-cyan-500" />
      </div>

      {/* ── TREND ANALYSIS ── */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <SectionTitle icon={TrendingUp} title="Report Trends" subtitle="Submitted, verified, and pending over time" />
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(v => (
              <button
                key={v}
                onClick={() => setTrendView(v)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${trendView === v ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {trendData[trendView].length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No data available for this period.</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trendData[trendView]}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorVerified" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area type="monotone" dataKey="total" name="Total" stroke="#10b981" fill="url(#colorTotal)" strokeWidth={2} />
              <Area type="monotone" dataKey="verified" name="Verified" stroke="#3b82f6" fill="url(#colorVerified)" strokeWidth={2} />
              <Area type="monotone" dataKey="pending" name="Pending" stroke="#f59e0b" fill="none" strokeDasharray="4 4" strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── WASTE CATEGORY + STATUS ── */}
      <div className="grid lg:grid-cols-5 gap-5">
        {/* Waste by Category */}
        <div className="lg:col-span-3 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <SectionTitle icon={Trash2} title="Waste by Category" subtitle="Top reported waste types" />
          {categoryData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No category data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" name="Total" fill="#10b981" radius={[0, 4, 4, 0]} />
                <Bar dataKey="verified" name="Verified" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Status Distribution Pie */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <SectionTitle icon={BarChart3} title="Report Status" subtitle="Current distribution" />
          {statusPieData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No reports yet.</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                    {statusPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [v, '']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {statusPieData.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                      <span className="text-gray-600">{d.name}</span>
                    </div>
                    <span className="font-bold text-gray-800">{d.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── WASTE COMPOSITION + RECYCLING ── */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Organic vs Plastic */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <SectionTitle icon={Leaf} title="Waste Composition" subtitle="Breakdown by material type" />
          {organicData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data available.</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={organicData} cx="50%" cy="50%" outerRadius={80} paddingAngle={3} dataKey="value">
                    {organicData.map((entry: any, i: number) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {organicData.map((d: any, i: number) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-gray-600 truncate">{d.name}</span>
                    <span className="font-bold text-gray-800 ml-auto">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Recycling + Duplicate Stats */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <SectionTitle icon={RefreshCw} title="Environmental Metrics" subtitle="Recycling rate & data quality" />
          <div className="space-y-5 mt-2">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-gray-600">Recycling Rate</span>
                <span className="text-sm font-bold text-green-600">{recycling?.percentage || 0}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div className="h-3 rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-700" style={{ width: `${recycling?.percentage || 0}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-1">{recycling?.recyclable || 0} recyclable of {recycling?.total || 0} verified reports</p>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-gray-600">AI Verification Success</span>
                <span className="text-sm font-bold text-blue-600">{overview?.aiSuccessRate || 0}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div className="h-3 rounded-full bg-gradient-to-r from-blue-400 to-indigo-500" style={{ width: `${overview?.aiSuccessRate || 0}%` }} />
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-800">Duplicate Report Analysis</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-amber-700">{duplicates?.duplicates || 0} potential duplicates detected</span>
                <span className="text-sm font-bold text-amber-600">{duplicates?.percentage || 0}%</span>
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-emerald-800">🌍 Environmental Impact</p>
              <div className="mt-1 space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-700">Waste managed</span>
                  <span className="font-bold text-emerald-800">{overview?.totalWeightKg || 0} kg</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-700">CO₂ reduction est.</span>
                  <span className="font-bold text-emerald-800">{overview?.co2ReductionKg || 0} kg</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── WARD-WISE ANALYTICS ── */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <SectionTitle icon={MapPin} title="Ward-wise Waste Collection Analytics" subtitle="Reports, completions, and completion rate by ward number" />
        {wardData.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-gray-400 gap-2">
            <MapPin className="w-8 h-8 opacity-30" />
            <p className="text-sm">No ward data available yet.</p>
            <p className="text-xs">Ward information is captured when citizens submit reports with GPS enabled.</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={wardData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="ward" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="total" name="Total Reports" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="verified" name="Verified" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="pending" name="Pending" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Ward table */}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Ward', 'Total', 'Verified', 'Pending', 'Completion Rate'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {wardData.map((w: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-bold text-gray-900">{w.ward}</td>
                      <td className="px-3 py-2.5 text-gray-700">{w.total}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1 text-green-700 font-semibold">
                          <CheckCircle className="w-3 h-3" /> {w.verified}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-amber-600 font-semibold">{w.pending}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${w.rate}%` }} />
                          </div>
                          <span className="font-bold text-gray-700">{w.rate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── CITIZEN GROWTH ── */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <SectionTitle icon={Users} title="Citizen Participation Growth" subtitle="New citizen registrations over time" />
        {citizenGrowthData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No growth data yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={citizenGrowthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="citizens" name="New Citizens" stroke="#8b5cf6" strokeWidth={2.5} dot={{ fill: '#8b5cf6', r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── COLLECTOR PERFORMANCE ── */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <SectionTitle icon={Trash2} title="Collector Performance" subtitle="Tasks completed by each collector" />
        {collectorData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No collector activity yet.</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={collectorData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="completed" name="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="accepted" name="Accepted" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Collector Table */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Collector', 'Accepted', 'Completed', 'Success Rate', 'Avg Time'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {collectorData.map((c: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-bold text-gray-900">{c.fullName || c.name}</td>
                      <td className="px-3 py-2.5 text-gray-600">{c.accepted}</td>
                      <td className="px-3 py-2.5 text-green-700 font-semibold">{c.completed}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-12 bg-gray-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${c.rate}%` }} />
                          </div>
                          <span className="font-bold">{c.rate}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-500">{c.avg_hours ? `${c.avg_hours}h` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── MOST ACTIVE CITIZENS ── */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <SectionTitle icon={Users} title="Most Active Citizens" subtitle="Citizens with the highest report counts" />
        {activeCitizens?.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-gray-400 text-sm">No citizen data yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['#', 'Name', 'Ward', 'Reports', 'Verified'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(activeCitizens || []).map((c: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-bold text-gray-400">#{i + 1}</td>
                    <td className="px-3 py-2.5 font-bold text-gray-900">{c.name}</td>
                    <td className="px-3 py-2.5 text-gray-500">{c.ward || '—'}</td>
                    <td className="px-3 py-2.5 font-semibold text-blue-700">{c.reports}</td>
                    <td className="px-3 py-2.5 font-semibold text-green-700">{c.verified}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── LOCATION VERIFICATION STATS ── */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <SectionTitle icon={Navigation} title="GPS Location Verification Stats" subtitle="Collector proximity check results" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Tasks with GPS Check', value: locationStats?.total_with_gps || 0, color: 'text-blue-600' },
            { label: 'Location Verified', value: locationStats?.location_verified || 0, color: 'text-green-600' },
            { label: 'Location Failed', value: locationStats?.location_failed || 0, color: 'text-red-500' },
            { label: 'Avg Distance', value: `${Math.round(locationStats?.avg_distance_meters || 0)}m`, color: 'text-purple-600' },
          ].map(({ label, value, color }, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
              <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
