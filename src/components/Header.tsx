'use client'
import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Menu, Coins, Leaf, Search, Bell, User, ChevronDown, LogIn, LogOut, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { getUnreadNotifications, markNotificationAsRead, getUserByEmail, getUserBalance } from "@/utils/db/actions"
import { globalSearch } from "@/utils/db/searchActions"
import type { SearchResult } from "@/utils/db/searchActions"
import { useSession, signOut } from "next-auth/react"

interface HeaderProps {
  onMenuClick: () => void;
  sidebarOpen: boolean;
}

export default function Header({ onMenuClick, sidebarOpen }: HeaderProps) {
  const { data: session, status } = useSession();
  const [notifications, setNotifications] = useState<any[]>([]);
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [balance, setBalance] = useState(0)
  
  // Custom Dropdown States
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search Debounce Effect
  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const role = ((session?.user as any)?.role) || "citizen";
        const email = session?.user?.email || "";
        if (email) {
          const results = await globalSearch(searchQuery, role, email);
          setSearchResults(results);
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, session]);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (session?.user?.email) {
        const user = await getUserByEmail(session.user.email);
        if (user) {
          const unreadNotifications = await getUnreadNotifications(user.id);
          setNotifications(unreadNotifications);
        }
      }
    };

    fetchNotifications();
    const notificationInterval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(notificationInterval);
  }, [session]);

  useEffect(() => {
    const fetchUserBalance = async () => {
      if (session?.user?.email) {
        const user = await getUserByEmail(session.user.email);
        if (user) {
          const userBalance = await getUserBalance(user.id);
          setBalance(userBalance);
        }
      }
    };

    fetchUserBalance();

    const handleBalanceUpdate = (event: CustomEvent) => {
      setBalance(event.detail);
    };

    window.addEventListener('balanceUpdated', handleBalanceUpdate as EventListener);
    return () => {
      window.removeEventListener('balanceUpdated', handleBalanceUpdate as EventListener);
    };
  }, [session]);

  const handleNotificationClick = async (notificationId: number) => {
    await markNotificationAsRead(notificationId);
    setNotifications(prevNotifications => 
      prevNotifications.filter(notification => notification.id !== notificationId)
    );
    setIsNotificationsOpen(false);
  };

  const loggedIn = status === "authenticated";
  const isAdmin = ((session?.user as any)?.role) === "admin";

  return (
    <header className="bg-white/70 backdrop-blur-2xl shadow-sm border-b border-gray-200/50 sticky top-0 z-50">
      <div className="flex items-center justify-between px-2 md:px-4 py-2">
        <div className="flex items-center flex-1">
          <Button variant="ghost" size="icon" className="mr-1 md:mr-2" onClick={onMenuClick}>
            {sidebarOpen ? (
              <X className="h-5 w-5 md:h-6 md:w-6" />
            ) : (
              <Menu className="h-5 w-5 md:h-6 md:w-6" />
            )}
          </Button>
          <Link href="/" className="flex items-center min-w-0">
            {/* <Leaf className="h-5 w-5 md:h-8 md:w-8 text-green-500 mr-1 md:mr-2 flex-shrink-0" /> */}
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm md:text-lg text-gray-800 animate-color truncate max-w-[150px] sm:max-w-xs md:max-w-full">Smart Janakpur Waste Management</span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-[10px] md:text-xs font-semibold bg-green-50 text-green-700 border border-green-200 animate-color w-fit">
                🌱 Smart Janakpur Waste Management AI
              </span>
            </div>
          </Link>
        </div>
        
        {!isMobile && isAdmin && (
          <div className="flex-1 max-w-md mx-4 relative" ref={searchRef}>
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchOpen(true)}
                className="w-full px-4 py-2 text-sm border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            </div>
            
            {/* Desktop Search Results Dropdown */}
            {isSearchOpen && searchQuery.trim().length > 0 && (
              <div className="absolute top-full mt-2 w-full bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden z-50">
                {isSearching ? (
                  <div className="px-4 py-3 text-sm text-gray-500 text-center">Searching...</div>
                ) : searchResults.length > 0 ? (
                  <div className="max-h-96 overflow-y-auto">
                    {searchResults.map((category) => (
                      <div key={category.category}>
                        <div className="px-4 py-1 text-xs font-semibold bg-gray-50 text-gray-500 uppercase tracking-wider">
                          {category.category}
                        </div>
                        {category.items.map((item) => (
                          <Link 
                            key={item.id} 
                            href={item.link}
                            onClick={() => {
                              setIsSearchOpen(false);
                              setSearchQuery("");
                            }}
                            className="block px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                          >
                            <span className="block font-medium text-sm text-gray-800 truncate">{item.title}</span>
                            <span className="block text-xs text-gray-500 mt-1 truncate">{item.subtitle}</span>
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-sm text-gray-500 text-center">No results found</div>
                )}
              </div>
            )}
          </div>
        )}
        
        <div className="flex items-center flex-shrink-0">
          {isMobile && isAdmin && (
            <div className="relative" ref={searchRef}>
              <Button 
                variant="ghost" 
                size="icon" 
                className="mr-1"
                onClick={() => setIsSearchOpen(!isSearchOpen)}
              >
                <Search className="h-4 w-4" />
              </Button>
              
              {/* Mobile Search Overlay */}
              {isSearchOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden z-50">
                  <div className="p-2 border-b border-gray-100 relative">
                    <input
                      type="text"
                      placeholder="Search..."
                      autoFocus
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  {searchQuery.trim().length > 0 && (
                    isSearching ? (
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">Searching...</div>
                    ) : searchResults.length > 0 ? (
                      <div className="max-h-64 overflow-y-auto">
                        {searchResults.map((category) => (
                          <div key={category.category}>
                            <div className="px-4 py-1 text-xs font-semibold bg-gray-50 text-gray-500 uppercase tracking-wider">
                              {category.category}
                            </div>
                            {category.items.map((item) => (
                              <Link 
                                key={item.id} 
                                href={item.link}
                                onClick={() => {
                                  setIsSearchOpen(false);
                                  setSearchQuery("");
                                }}
                                className="block px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                              >
                                <span className="block font-medium text-sm text-gray-800 truncate">{item.title}</span>
                                <span className="block text-xs text-gray-500 mt-1 truncate">{item.subtitle}</span>
                              </Link>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">No results found</div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notifications Dropdown */}
          <div className="relative mr-1 md:mr-2" ref={notifRef}>
            <button 
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className="relative inline-flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-gray-100 focus:outline-none"
            >
              <Bell className="h-4 w-4 md:h-5 md:w-5 text-gray-700" />
              {notifications.length > 0 && (
                <Badge className="absolute -top-1 -right-1 px-1 min-w-[1rem] md:min-w-[1.2rem] h-4 md:h-5 bg-red-500 text-white border-0 text-[10px] md:text-xs">
                  {notifications.length}
                </Badge>
              )}
            </button>
            
            {isNotificationsOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden z-50">
                {notifications.length > 0 ? (
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.map((notification) => (
                      <div 
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification.id)}
                        className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                      >
                        <span className="block font-medium text-sm text-gray-800">{notification.type}</span>
                        <span className="block text-xs text-gray-500 mt-1">{notification.message}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-sm text-gray-500 text-center">No new notifications</div>
                )}
              </div>
            )}
          </div>

          {/* <div className="mr-1 md:mr-4 flex items-center bg-gray-100 rounded-full px-2 md:px-3 py-1">
            <Coins className="h-3 w-3 md:h-5 md:w-5 mr-1 text-green-500" />
            <span className="font-semibold text-xs md:text-base text-gray-800">
              {balance.toFixed(2)}
            </span>
          </div> */}

          {!loggedIn ? (
            <Link href="/login">
              <Button className="bg-green-600 hover:bg-green-700 text-white text-xs md:text-base h-8 md:h-10 px-3 md:px-4">
                Login
                <LogIn className="ml-1 md:ml-2 h-3 w-3 md:h-5 md:w-5" />
              </Button>
            </Link>
          ) : (
            /* User Profile Dropdown */
            <div className="relative" ref={profileRef}>
              <button 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center justify-center h-8 px-1 md:h-10 md:px-2 rounded-md transition-colors hover:bg-gray-100 focus:outline-none"
              >
                <User className="h-4 w-4 md:h-5 md:w-5 mr-1 text-gray-700" />
                <ChevronDown className="h-3 w-3 md:h-4 md:w-4 text-gray-700" />
              </button>
              
              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <span className="block font-bold text-sm text-gray-800 truncate">{session?.user?.name || "User"}</span>
                    <span className="inline-block text-[9px] bg-green-150 text-green-800 px-2 py-0.5 rounded-full font-bold uppercase mt-1">
                      {((session?.user as any)?.role) || "Citizen"}
                    </span>
                  </div>
                  <Link href="/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setIsProfileOpen(false)}>
                    Profile Settings
                  </Link>
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => setIsProfileOpen(false)}>
                    Settings
                  </button>
                  <button 
                    onClick={() => {
                      setIsProfileOpen(false);
                      signOut();
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 font-medium border-t border-gray-100"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}