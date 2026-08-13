

'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  MapPin,
  Trash,
  Coins,
  Medal,
  Settings,
  Home,
  Shield,
  X
} from "lucide-react"
import { useSession } from "next-auth/react"

const sidebarItems = [
  { href: "/", icon: Home, label: "Home", roles: ["citizen", "collector", "admin"] },
  { href: "/report", icon: MapPin, label: "Report Waste", roles: ["citizen", "admin"] },
  { href: "/collect", icon: Trash, label: "Collect Waste", roles: ["collector", "admin"] },
  { href: "/rewards", icon: Coins, label: "Rewards", roles: ["citizen"] },
  { href: "/leaderboard", icon: Medal, label: "Leaderboard", roles: ["citizen", "admin"] },
  { href: "/admin", icon: Shield, label: "Admin Dashboard", roles: ["admin"] },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()

  const role = ((session?.user as any)?.role) || "citizen"

  const filteredItems = sidebarItems.filter(item =>
    item.roles.includes(role)
  )

  return (
    <>
      {/* Background Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-30"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen w-64 bg-white border-r border-gray-200 shadow-xl z-40 transform transition-transform duration-300 ease-in-out pt-16 ${open ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        {/* Header (Optional, can be removed if redundant) */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-bold text-lg text-green-700">
            Green Waste
          </h2>
        </div>

        {/* Menu */}
        <nav className="flex flex-col justify-between h-[calc(100%-70px)]">
          <div className="p-4 space-y-2">
            {filteredItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
              >
                <Button
                  variant={pathname === item.href ? "secondary" : "ghost"}
                  className={`w-full justify-start py-6 ${pathname === item.href
                      ? "bg-green-100 text-green-700"
                      : "hover:bg-gray-100"
                    }`}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.label}
                </Button>
              </Link>
            ))}
          </div>

          {/* Bottom */}
          <div className="p-4 border-t">
            <Link href="/settings" onClick={onClose}>
              <Button
                variant={pathname === "/settings" ? "secondary" : "outline"}
                className="w-full justify-start py-6"
              >
                <Settings className="mr-3 h-5 w-5" />
                Settings
              </Button>
            </Link>
          </div>
        </nav>
      </aside>
    </>
  )
}