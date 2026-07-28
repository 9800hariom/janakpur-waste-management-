'use client'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, FileText, Trash2, Coins, Activity, TrendingUp, TrendingDown, CheckCircle, Clock, BarChart3 } from 'lucide-react'

export function DashboardOverview({ stats }: { stats: any }) {
  if (!stats) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-400 text-sm">Loading dashboard stats...</p>
    </div>
  )

  const growthPct = stats.growthPct ?? null
  const isPositive = growthPct !== null && growthPct >= 0

  const verificationRate = stats.reportsCount > 0
    ? Math.round((stats.verifiedCount / stats.reportsCount) * 100)
    : 0

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Live overview of the Smart Janakpur Waste Management system.</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        <Card className="hover:shadow-md transition-all border-gray-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Users</CardTitle>
            <div className="p-1.5 bg-blue-100 rounded-lg">
              <Users className="w-4 h-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-gray-900">{(stats.usersCount || 0).toLocaleString()}</div>
            <p className="text-xs text-gray-500 mt-1 flex gap-3">
              <span><span className="font-semibold text-blue-600">{stats.citizenCount || 0}</span> citizens</span>
              <span><span className="font-semibold text-green-600">{stats.collectorCount || 0}</span> collectors</span>
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all border-gray-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Reports</CardTitle>
            <div className="p-1.5 bg-purple-100 rounded-lg">
              <FileText className="w-4 h-4 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-gray-900">{(stats.reportsCount || 0).toLocaleString()}</div>
            {growthPct !== null ? (
              <p className={`text-xs flex items-center mt-1 font-semibold ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
                {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                {isPositive ? '+' : ''}{growthPct}% vs last month
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">{stats.todaysReports || 0} reports today</p>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all border-gray-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Verified Reports</CardTitle>
            <div className="p-1.5 bg-green-100 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-gray-900">{(stats.verifiedCount || 0).toLocaleString()}</div>
            <p className="text-xs text-gray-500 mt-1">
              <span className="font-semibold text-green-600">{verificationRate}%</span> completion rate
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-all border-gray-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pending Reports</CardTitle>
            <div className="p-1.5 bg-amber-100 rounded-lg">
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-gray-900">{(stats.pendingCount || 0).toLocaleString()}</div>
            <p className="text-xs text-gray-400 mt-1">awaiting collection</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-gray-100">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Activity className="w-4 h-4 text-green-600" />
              Quick Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'This Month', value: stats.monthlyReports || 0, color: 'text-purple-600', bg: 'bg-purple-50' },
                { label: 'Today', value: stats.todaysReports || 0, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Collectors', value: stats.collectorsCount || 0, color: 'text-green-600', bg: 'bg-green-50' },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className={`${bg} rounded-xl p-3 text-center`}>
                  <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-100">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-green-600" />
              Verification Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center mb-3">
              <p className="text-4xl font-black text-green-600">{verificationRate}%</p>
              <p className="text-xs text-gray-400 mt-1">of reports verified</p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-700"
                style={{ width: `${verificationRate}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>{stats.verifiedCount || 0} verified</span>
              <span>{stats.reportsCount || 0} total</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tip Banner */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
        <BarChart3 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-green-800">Want deeper insights?</p>
          <p className="text-xs text-green-700 mt-0.5">
            Go to the <strong>Analytics</strong> tab for live charts, ward-wise breakdowns, AI verification rates, collector performance, and environmental impact data.
          </p>
        </div>
      </div>
    </div>
  )
}
