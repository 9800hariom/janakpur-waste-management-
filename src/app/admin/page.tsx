'use client'
import { useState, useEffect } from 'react'
import { getAdminStats, getAllUsers, getAllReportsDetailed, getAllRewards, getUserByEmail } from '@/utils/db/actions'
import { Loader, Users, FileText, Trash2, Coins, Search, Settings, Shield, Activity, BarChart3, Database } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useSession } from "next-auth/react"
import { useRouter } from 'next/navigation'

// Components
import { DashboardOverview } from './components/DashboardOverview'
import { UsersManager } from './components/UsersManager'
import { ReportsManager } from './components/ReportsManager'
import { RewardsManager } from './components/RewardsManager'
import { SettingsManager } from './components/SettingsManager'
import { ActivityLogsManager } from './components/ActivityLogsManager'
import { AnalyticsDashboard } from './components/AnalyticsDashboard'
import { DatabaseInspector } from './components/DatabaseInspector'

type AdminTab = 'dashboard' | 'analytics' | 'users' | 'reports' | 'rewards' | 'settings' | 'logs' | 'database'

export default function AdminDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [isAdmin, setIsAdmin] = useState(false)
  const [currentAdminId, setCurrentAdminId] = useState<number>(0)
  const [stats, setStats] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [rewards, setRewards] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard')

  const userEmail = session?.user?.email

  useEffect(() => {
    if (status === 'authenticated' && userEmail) {
      checkAdmin(userEmail)
    } else if (status === 'unauthenticated') {
      toast.error('Access Denied. Please log in first.')
      router.push('/login')
    }
  }, [status, userEmail])

  const checkAdmin = async (email: string) => {
    try {
      const user = await getUserByEmail(email)
      if (user && user.role === 'admin') {
        setIsAdmin(true)
        setCurrentAdminId(user.id)
        fetchAdminData(!isAdmin) // Only show initial loading screen if not already verified
      } else {
        toast.error('Access Denied. Admins only.')
        router.push('/')
      }
    } catch (e) {
      toast.error('Auth error.')
      router.push('/')
    }
  }

  const fetchAdminData = async (showInitialLoader = false) => {
    if (showInitialLoader) {
      setLoading(true)
    }
    try {
      const [statsData, usersList, reportsList, rewardsList] = await Promise.all([
        getAdminStats(),
        getAllUsers(),
        getAllReportsDetailed(),
        getAllRewards(),
      ])
      setStats(statsData)
      setUsers(usersList)
      setReports(reportsList)
      setRewards(rewardsList)
    } catch (error) {
      console.error('Error loading admin data:', error)
      toast.error('Failed to load admin data.')
    } finally {
      setLoading(false)
    }
  }

  if (loading || !isAdmin) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="text-center">
          <Loader className="animate-spin h-10 w-10 text-green-600 mx-auto mb-4" />
          <p className="text-sm font-semibold text-gray-500">Loading Admin Panel...</p>
        </div>
      </div>
    )
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <Activity className="w-4 h-4 mr-2" /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4 mr-2" /> },
    { id: 'users', label: 'Users', icon: <Users className="w-4 h-4 mr-2" /> },
    { id: 'reports', label: 'Reports & Tasks', icon: <FileText className="w-4 h-4 mr-2" /> },
    { id: 'rewards', label: 'Rewards (Citizens)', icon: <Coins className="w-4 h-4 mr-2" /> },
    { id: 'logs', label: 'Activity Logs', icon: <Search className="w-4 h-4 mr-2" /> },
    { id: 'database', label: 'SQLite Inspector', icon: <Database className="w-4 h-4 mr-2 text-emerald-600" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4 mr-2" /> },
  ]

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex flex-col lg:flex-row gap-8">
      {/* Sidebar Navigation */}
      <div className="w-full lg:w-56 flex-shrink-0">
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm sticky top-8">
          <h1 className="text-base font-bold text-gray-900 flex items-center mb-5 px-1">
            <Shield className="w-5 h-5 mr-2 text-green-600" />
            Admin CRM
          </h1>
          <nav className="space-y-0.5">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as AdminTab)}
                className={`w-full flex items-center px-3 py-2.5 text-xs font-semibold rounded-lg transition-colors ${
                  activeTab === item.id
                    ? 'bg-green-50 text-green-700 border border-green-100'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {activeTab === 'dashboard' && <DashboardOverview stats={stats} />}
        {activeTab === 'analytics' && <AnalyticsDashboard />}
        {activeTab === 'users' && <UsersManager users={users} currentAdminId={currentAdminId} onUpdate={fetchAdminData} />}
        {activeTab === 'reports' && <ReportsManager reports={reports} currentAdminId={currentAdminId} onUpdate={fetchAdminData} />}
        {activeTab === 'rewards' && <RewardsManager rewards={rewards} currentAdminId={currentAdminId} onUpdate={fetchAdminData} />}
        {activeTab === 'logs' && <ActivityLogsManager />}
        {activeTab === 'database' && <DatabaseInspector />}
        {activeTab === 'settings' && <SettingsManager currentAdminId={currentAdminId} />}
      </div>
    </div>
  )
}
