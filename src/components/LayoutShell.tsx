'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import Sidebar from '@/components/Sidebar'
import { Toaster } from 'react-hot-toast'

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const toggleSidebar = () => setSidebarOpen(prev => !prev)

  return (
    <>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header onMenuClick={toggleSidebar} sidebarOpen={sidebarOpen} />
        <div className="flex flex-1">
          <Sidebar open={sidebarOpen} onClose={toggleSidebar} />
          <main className="flex-1 p-4 lg:p-8 transition-all duration-300">
            {children}
          </main>
        </div>
      </div>
      <Toaster />
    </>
  )
}
