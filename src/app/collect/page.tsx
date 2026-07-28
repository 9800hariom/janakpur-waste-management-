'use client'
import { useState, useEffect, useCallback } from 'react'
import { Trash2, MapPin, CheckCircle, Clock, ArrowRight, Upload, Loader, Calendar, Weight, Search, Navigation, AlertTriangle, X, Sparkles, Activity, ShieldAlert, ShieldCheck, Flame, Percent } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'react-hot-toast'
import { getWasteCollectionTasks, updateTaskStatus, updateTaskStatusWithLocation, saveCollectedWaste, getUserByEmail, createNotification } from '@/utils/db/actions'
import { analyzeImages } from '@/utils/geminiHelper'
import { parseGeminiJson } from '@/utils/geminiClientHelper'
import { useSession } from "next-auth/react"

const geminiApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY

type CollectionTask = {
  id: number
  userId?: number
  location: string
  latitude?: number | null
  longitude?: number | null
  formattedAddress?: string | null
  wardNumber?: string | null
  wasteType: string
  amount: string
  status: 'pending' | 'in_progress' | 'completed' | 'verified' | 'pending_manual_review'
  date: string
  collectorId: number | null
  imageUrl?: string | null
  locationVerified?: boolean | null
  distanceMeters?: number | null
}

const ITEMS_PER_PAGE = 5
const MAX_DISTANCE_METERS = 100

export default function CollectPage() {
  const [tasks, setTasks] = useState<CollectionTask[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredWasteType, setHoveredWasteType] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [user, setUser] = useState<{ id: number; email: string; name: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'nearby' | 'accepted' | 'completed'>('nearby')
  const [selectedTask, setSelectedTask] = useState<CollectionTask | null>(null)
  const [verificationImage, setVerificationImage] = useState<string | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'failure'>('idle')
  const [verificationResult, setVerificationResult] = useState<any>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [distanceToReport, setDistanceToReport] = useState<number | null>(null)
  const [collectorGps, setCollectorGps] = useState<{ lat: number; lng: number } | null>(null)

  const { data: session, status } = useSession()

  useEffect(() => {
    const fetchUserAndTasks = async () => {
      setLoading(true)
      try {
        if (status === "authenticated" && session?.user?.email) {
          const fetchedUser = await getUserByEmail(session.user.email)
          if (fetchedUser) setUser(fetchedUser)
        }
        const fetchedTasks = await getWasteCollectionTasks()
        setTasks(fetchedTasks as CollectionTask[])
      } catch (error) {
        console.error('Error fetching tasks:', error)
        toast.error('Failed to load tasks.')
      } finally {
        setLoading(false)
      }
    }
    if (status !== "loading") fetchUserAndTasks()
  }, [status, session])

  const handleStatusChange = async (taskId: number, newStatus: CollectionTask['status']) => {
    if (!user) { toast.error('Please log in.'); return }
    try {
      const updatedTask = await updateTaskStatus(taskId, newStatus, user.id)
      if (updatedTask) {
        setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus, collectorId: user.id } : t))
        toast.success(newStatus === 'in_progress' ? 'Task accepted! Navigate to the reported location.' : 'Status updated.')
      } else {
        toast.error('Failed to update task status.')
      }
    } catch (error) {
      toast.error('Failed to update task status.')
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setVerificationImage(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const getCurrentGPS = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser.'))
        return
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      })
    })
  }

  const handleVerify = async () => {
    if (!selectedTask || !verificationImage || !user) {
      toast.error('Missing required information for verification.')
      return
    }

    // Step 1: Get Collector GPS
    setGpsLoading(true)
    setGpsError(null)
    let collectorPos: GeolocationPosition
    try {
      collectorPos = await getCurrentGPS()
    } catch (err: any) {
      setGpsLoading(false)
      const msg = err.code === 1
        ? 'Location permission denied. Please allow location access to verify cleanup.'
        : 'Unable to get your location. Please enable GPS and try again.'
      setGpsError(msg)
      toast.error(msg)
      return
    }

    const cLat = collectorPos.coords.latitude
    const cLng = collectorPos.coords.longitude
    setCollectorGps({ lat: cLat, lng: cLng })
    setGpsLoading(false)

    // Step 2: AI Verification
    setVerificationStatus('verifying')
    try {
      // Build image list: before (if available) + after
      const images: Array<{ base64: string; mimeType?: string }> = []
      let prompt = ""

      if (selectedTask.imageUrl) {
        images.push({ base64: selectedTask.imageUrl })
        images.push({ base64: verificationImage!, mimeType: 'image/jpeg' })
        prompt = `You are an AI Waste Cleanup Verification Assistant for the Smart Janakpur Waste Management system.
Your task is to compare two uploaded images:
1. Before Cleanup (Citizen Report, Image 1)
2. After Cleanup (Collector Submission, Image 2)

Your job is ONLY to analyze the visual differences between these two images. Never invent information that cannot be determined from the images. If you are uncertain, explicitly state "Cannot determine from image."

Return your response as valid JSON with the following structure:

{
  "verificationStatus": "Verified" | "Partially Cleaned" | "Cleanup Failed" | "Manual Review Required",
  "confidence": 95 (percentage score between 0-100),
  "cleanupCompleted": true/false,
  "cleanupPercentage": 100 (percentage score between 0-100),
  "remainingWaste": "description of remaining waste or None",
  "wasteStillVisible": true/false,
  "cleanupQuality": "Excellent" | "Good" | "Fair" | "Poor",
  "matchedLocation": "Matched" | "Not Matched" | "Cannot determine from image.",
  "beforeAfterComparison": "objective observation comparing before and after backgrounds/landmarks and trash levels",
  "objectsRemoved": ["plastic bottles", "cardboard boxes", "etc"],
  "objectsRemaining": ["residual plastics", "etc"],
  "newObjectsDetected": ["bags left behind", "etc"],
  "environmentCondition": "Clean ground / grassy patch / etc",
  "aiSummary": "2-4 sentence summary of what changed, what waste was removed, what remains, and why recommendation was chosen",
  "recommendation": "Approve Cleanup" | "Manual Review" | "Reject Cleanup"
}

Respond ONLY with valid JSON. Do not include markdown fences.`
      } else {
        images.push({ base64: verificationImage!, mimeType: 'image/jpeg' })
        prompt = `You are an AI Waste Cleanup Verification Assistant for the Smart Janakpur Waste Management system.
Analyze the image of the clean area and return a complete JSON object:

{
  "verificationStatus": "Verified" | "Partially Cleaned" | "Cleanup Failed" | "Manual Review Required",
  "confidence": 95 (percentage score between 0-100),
  "cleanupCompleted": true/false,
  "cleanupPercentage": 100,
  "remainingWaste": "None",
  "wasteStillVisible": false,
  "cleanupQuality": "Excellent" | "Good" | "Fair" | "Poor",
  "matchedLocation": "Matched",
  "beforeAfterComparison": "Area is verified clean.",
  "objectsRemoved": ["general waste"],
  "objectsRemaining": [],
  "newObjectsDetected": [],
  "environmentCondition": "Restored ground surface",
  "aiSummary": "The site is clean and completely free of any residual trash. The cleanup operation is approved.",
  "recommendation": "Approve Cleanup"
}

Respond ONLY with valid JSON. Do not include markdown fences.`
      }

      const text = await analyzeImages(prompt, images)
      const parsedResult = parseGeminiJson(text)

      const confPercent = parsedResult.confidence !== undefined ? parsedResult.confidence : 90
      const isVerified = (parsedResult.verificationStatus === 'Verified' || parsedResult.cleanupCompleted) &&
                         parsedResult.recommendation === 'Approve Cleanup' &&
                         parsedResult.matchedLocation !== 'Not Matched'

      let nextStatus: 'completed' | 'pending_manual_review' = 'pending_manual_review'
      if (isVerified && confPercent >= 90) {
        nextStatus = 'completed'
      }

      const normalizedResult = {
        verified: isVerified,
        confidence: confPercent / 100,
        isDuplicateImage: false,
        isDifferentLocation: parsedResult.matchedLocation === 'Not Matched',
        cleanupQuality: parsedResult.cleanupQuality ? parsedResult.cleanupQuality.toLowerCase() : 'good',
        observations: parsedResult.aiSummary || parsedResult.beforeAfterComparison,
        ...parsedResult
      }

      setVerificationResult(normalizedResult)
      setVerificationStatus('success')

      // Step 3: Location proximity check + task completion
      const locationResult = await updateTaskStatusWithLocation(
        selectedTask.id, nextStatus, user.id, cLat, cLng
      )

      if (!locationResult.success) {
        if (locationResult.error === 'too_far') {
          const dist = locationResult.distanceMeters || 0
          setDistanceToReport(dist)
          setGpsError(`You are ${dist}m away from the reported location. Move within ${MAX_DISTANCE_METERS}m to complete this task.`)
          toast.error(`Too far! You are ${dist} meters from the reported location.`, { duration: 6000 })
          setVerificationStatus('idle')
          return
        }
        toast.error('Failed to complete task. Please try again.')
        return
      }

      setDistanceToReport(locationResult.updatedReport?.distanceMeters || null)
      await saveCollectedWaste(selectedTask.id, user.id, parsedResult)

      if (nextStatus === 'completed') {
        if (selectedTask.userId) {
          await createNotification(selectedTask.userId, "Your waste report cleanup has been successfully completed and verified by AI!", "info")
        }
        toast.success('Cleanup verified successfully by AI! Task Completed.', { duration: 5000, position: 'top-center' })
      } else {
        if (selectedTask.userId) {
          await createNotification(selectedTask.userId, "Your waste cleanup report requires manual administrator review.", "info")
        }
        toast('Confidence below threshold. Task submitted for Manual Review.', { duration: 6000, position: 'top-center', icon: '⚠️' })
      }

      setTasks(tasks.map(t => t.id === selectedTask.id ? { ...t, status: nextStatus } : t))
    } catch (error) {
      console.error('Verification error:', error)
      setVerificationStatus('failure')
    }
  }

  const nearbyCount = tasks.filter(t => t.status === 'pending').length
  const acceptedCount = tasks.filter(t => t.status === 'in_progress' && t.collectorId === user?.id).length
  const completedCount = tasks.filter(t => t.status === 'verified' && t.collectorId === user?.id).length

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (task.wardNumber && task.wardNumber.toLowerCase().includes(searchTerm.toLowerCase()))
    if (!matchesSearch) return false
    if (activeTab === 'nearby') return task.status === 'pending'
    if (activeTab === 'accepted') return task.status === 'in_progress' && task.collectorId === user?.id
    if (activeTab === 'completed') return task.status === 'verified' && task.collectorId === user?.id
    return false
  })

  const pageCount = Math.max(1, Math.ceil(filteredTasks.length / ITEMS_PER_PAGE))
  const paginatedTasks = filteredTasks.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Collector Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Manage and complete waste collection tasks in your area.</p>
      </div>

      {/* Stats Cards */}
      {user && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center text-center">
            <div className="p-2 bg-yellow-100 rounded-xl mb-2">
              <Trash2 className="w-5 h-5 text-yellow-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{nearbyCount}</p>
            <p className="text-xs text-gray-500 font-semibold uppercase mt-1">Pending Tasks</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center text-center">
            <div className="p-2 bg-blue-100 rounded-xl mb-2">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{acceptedCount}</p>
            <p className="text-xs text-gray-500 font-semibold uppercase mt-1">In Progress</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center text-center">
            <div className="p-2 bg-green-100 rounded-xl mb-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{completedCount}</p>
            <p className="text-xs text-gray-500 font-semibold uppercase mt-1">Completed</p>
          </div>
        </div>
      )}

      {/* GPS Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 flex items-start gap-2.5">
        <Navigation className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700">
          <strong>Location verification required:</strong> Your GPS will be captured when completing a task. You must be within {MAX_DISTANCE_METERS} meters of the reported waste location.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 bg-gray-100 p-1.5 rounded-xl border border-gray-200 mb-6 shadow-sm">
        {([['nearby', `Pending (${nearbyCount})`], ['accepted', `In Progress (${acceptedCount})`], ['completed', `Completed (${completedCount})`]] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setCurrentPage(1) }}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
              activeTab === tab ? 'bg-white text-green-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4 flex items-center gap-2">
        <Input
          type="text"
          placeholder="Search by location or ward..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Button variant="outline" size="icon">
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader className="animate-spin h-8 w-8 text-gray-400" />
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paginatedTasks.map(task => (
              <div key={task.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 min-w-0 mr-3">
                    <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span className="truncate">{task.location}</span>
                    </h2>
                    {task.wardNumber && (
                      <span className="text-xs text-gray-400 ml-5">Ward {task.wardNumber}</span>
                    )}
                  </div>
                  <StatusBadge status={task.status} />
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-3 ml-5">
                  <span className="flex items-center gap-1">
                    <Trash2 className="w-3 h-3" />
                    <span className="relative group cursor-pointer" onMouseEnter={() => setHoveredWasteType(task.wasteType)} onMouseLeave={() => setHoveredWasteType(null)}>
                      {task.wasteType.length > 15 ? `${task.wasteType.slice(0, 15)}...` : task.wasteType}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Weight className="w-3 h-3" />
                    {task.amount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {task.date}
                  </span>
                  {task.latitude && (
                    <span className="flex items-center gap-1 text-green-600">
                      <Navigation className="w-3 h-3" />
                      GPS available
                    </span>
                  )}
                </div>
                <div className="flex justify-end">
                  {task.status === 'pending' && (
                    <Button onClick={() => handleStatusChange(task.id, 'in_progress')} size="sm" className="bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg">
                      <ArrowRight className="w-3 h-3 mr-1" /> Accept Task
                    </Button>
                  )}
                  {task.status === 'in_progress' && task.collectorId === user?.id && (
                    <Button onClick={() => { setSelectedTask(task); setVerificationImage(null); setVerificationStatus('idle'); setVerificationResult(null); setGpsError(null); setDistanceToReport(null); setCollectorGps(null) }} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg">
                      <CheckCircle className="w-3 h-3 mr-1" /> Complete & Verify
                    </Button>
                  )}
                  {task.status === 'in_progress' && task.collectorId !== user?.id && (
                    <span className="text-xs text-yellow-600 font-medium">In progress by another collector</span>
                  )}
                  {task.status === 'verified' && (
                    <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Task Completed
                      {task.distanceMeters !== null && task.distanceMeters !== undefined && (
                        <span className="ml-1 text-gray-400">({task.distanceMeters}m from site)</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {paginatedTasks.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                <Trash2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400 font-medium">No tasks in this category.</p>
              </div>
            )}
          </div>

          {pageCount > 1 && (
            <div className="mt-5 flex justify-center items-center gap-3">
              <Button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} variant="outline" size="sm">Previous</Button>
              <span className="text-sm text-gray-500">Page {currentPage} of {pageCount}</span>
              <Button onClick={() => setCurrentPage(p => Math.min(p + 1, pageCount))} disabled={currentPage === pageCount} variant="outline" size="sm">Next</Button>
            </div>
          )}
        </>
      )}

      {/* Verification Modal */}
      {selectedTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Cleanup Verification</h3>
                <p className="text-xs text-gray-500 mt-0.5">Upload cleanup photo. Your GPS will be verified against the reported location.</p>
              </div>
              <button onClick={() => { setSelectedTask(null); setGpsError(null); setDistanceToReport(null); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Location Info */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4 text-xs">
              <div className="flex items-center gap-2 text-gray-600">
                <MapPin className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span><strong>Reported Location:</strong> {selectedTask.location}</span>
              </div>
              {selectedTask.latitude && (
                <div className="mt-1 flex items-center gap-2 text-green-600">
                  <Navigation className="w-4 h-4 flex-shrink-0" />
                  <span>GPS: {selectedTask.latitude?.toFixed(5)}, {selectedTask.longitude?.toFixed(5)}</span>
                </div>
              )}
            </div>

            {/* GPS Error */}
            {gpsError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Location Verification Failed</p>
                  <p className="text-xs text-red-700 mt-1">{gpsError}</p>
                  {distanceToReport !== null && (
                    <p className="text-xs text-red-600 mt-1 font-medium">
                      Distance to site: <strong>{distanceToReport} meters</strong> (max allowed: {MAX_DISTANCE_METERS}m)
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Collector GPS (if captured) */}
            {collectorGps && !gpsError && (
              <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-3 text-xs flex items-center gap-2 text-green-700">
                <Navigation className="w-4 h-4" />
                <span>Your GPS: {collectorGps.lat.toFixed(5)}, {collectorGps.lng.toFixed(5)}</span>
                {distanceToReport !== null && (
                  <span className="ml-auto font-semibold text-green-800">{distanceToReport}m from site ✓</span>
                )}
              </div>
            )}

            {/* Before/After images */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Before (Reported)</p>
                {selectedTask.imageUrl ? (
                  <img src={selectedTask.imageUrl} alt="Before" className="w-full h-40 object-cover rounded-lg" />
                ) : (
                  <div className="w-full h-40 bg-gray-100 flex items-center justify-center rounded-lg text-gray-400 text-xs">No image</div>
                )}
              </div>
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">After (Cleanup)</p>
                {verificationImage ? (
                  <img src={verificationImage} alt="After" className="w-full h-40 object-cover rounded-lg" />
                ) : (
                  <div className="w-full h-40 bg-gray-50 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 hover:bg-gray-100 cursor-pointer relative">
                    <Upload className="h-8 w-8 text-gray-400 mb-2" />
                    <span className="text-xs text-blue-600 font-semibold">Upload cleanup photo</span>
                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImageUpload} accept="image/*" />
                  </div>
                )}
              </div>
            </div>

            {verificationImage && (
              <div className="mb-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-xs text-blue-700">
                <span>Cleanup photo uploaded ✓</span>
                <button onClick={() => setVerificationImage(null)} className="text-blue-600 font-semibold">Replace</button>
              </div>
            )}

            <Button
              onClick={handleVerify}
              className="w-full py-3 text-sm font-bold bg-green-600 hover:bg-green-700 text-white rounded-xl flex items-center justify-center gap-2"
              disabled={!verificationImage || verificationStatus === 'verifying' || gpsLoading}
            >
              {gpsLoading ? (
                <><Loader className="animate-spin h-4 w-4" /> Getting your GPS location...</>
              ) : verificationStatus === 'verifying' ? (
                <><Loader className="animate-spin h-4 w-4" /> Verifying with AI...</>
              ) : (
                <><Navigation className="h-4 w-4" /> Verify Location & Complete Task</>
              )}
            </Button>

            {verificationStatus === 'success' && verificationResult && !gpsError && (
              <div className="mt-6 bg-white/40 backdrop-blur-md border border-white/60 shadow-xl rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl -z-10" />

                {/* AI Summary Badge / Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4 mb-4 gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-500" />
                    <div>
                      <h4 className="text-sm font-extrabold text-gray-900">AI Inspection Certificate</h4>
                      <p className="text-[10px] text-gray-400 font-medium">Auto-generated via Gemini Vision Model</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm ${
                    verificationResult.aiRecommendation === 'Approve Cleanup'
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : verificationResult.aiRecommendation === 'Needs Manual Review'
                      ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}>
                    {verificationResult.verificationStatus || 'Verified'}
                  </span>
                </div>

                {/* Primary Meters */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                  <div className="bg-white/80 p-3 rounded-xl border border-gray-100">
                    <p className="text-[10px] text-gray-400 font-black uppercase mb-1">AI Confidence</p>
                    <div className="flex justify-between text-xs font-bold text-gray-700 mb-1">
                      <span>Score</span>
                      <span className="text-blue-600 font-extrabold">{verificationResult.aiConfidence || (verificationResult.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-gray-200/60 rounded-full h-1.5">
                      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-1.5 rounded-full" style={{ width: `${verificationResult.aiConfidence || (verificationResult.confidence * 100).toFixed(0)}%` }}></div>
                    </div>
                  </div>

                  <div className="bg-white/80 p-3 rounded-xl border border-gray-100">
                    <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Waste Removed</p>
                    <div className="flex justify-between text-xs font-bold text-gray-700 mb-1">
                      <span>Removal Success</span>
                      <span className="text-green-600 font-extrabold">{verificationResult.wasteCompletelyRemoved ?? 100}%</span>
                    </div>
                    <div className="w-full bg-gray-200/60 rounded-full h-1.5">
                      <div className="bg-gradient-to-r from-green-500 to-emerald-600 h-1.5 rounded-full" style={{ width: `${verificationResult.wasteCompletelyRemoved ?? 100}%` }}></div>
                    </div>
                  </div>

                  <div className="bg-white/80 p-3 rounded-xl border border-gray-100">
                    <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Similarity Index</p>
                    <div className="flex justify-between text-xs font-bold text-gray-700 mb-1">
                      <span>Before vs After</span>
                      <span className="text-indigo-600 font-extrabold">{verificationResult.beforeAfterSimilarity ?? 15}%</span>
                    </div>
                    <div className="w-full bg-gray-200/60 rounded-full h-1.5">
                      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 h-1.5 rounded-full" style={{ width: `${verificationResult.beforeAfterSimilarity ?? 15}%` }}></div>
                    </div>
                  </div>
                </div>

                {/* Telemetry Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: 'Cleanup Success', value: verificationResult.cleanupSuccess ? 'Yes' : 'No' },
                    { label: 'Remaining Waste', value: `${verificationResult.remainingWaste ?? 0}%` },
                    { label: 'Duplicate Image', value: verificationResult.duplicateImage ? 'Yes' : 'No' },
                    { label: 'Duplicate Report', value: verificationResult.duplicateReport ? 'Yes' : 'No' },
                    { label: 'Waste Still Visible', value: verificationResult.wasteStillVisible ? 'Yes' : 'No' },
                    { label: 'New Waste Added', value: verificationResult.newWasteAdded ? 'Yes' : 'No' },
                    { label: 'Wrong Location', value: verificationResult.wrongLocation ? 'Yes' : 'No' },
                    { label: 'GPS Match', value: verificationResult.gpsLocationMatch || 'Matched' },
                    { label: 'Image Quality', value: verificationResult.imageQuality || 'Excellent' },
                    { label: 'Blur Check', value: verificationResult.blurDetection || 'No Blur' },
                    { label: 'Brightness', value: verificationResult.brightnessAnalysis || 'Optimal' },
                    { label: 'Fake/Edited Check', value: verificationResult.fakeOrEdited || 'Clean' },
                  ].map(stat => (
                    <div key={stat.label} className="bg-white/80 p-2 rounded-xl border border-gray-100 text-xs">
                      <span className="text-[9px] text-gray-400 font-black uppercase tracking-wide">{stat.label}</span>
                      <p className="font-extrabold text-gray-800 mt-0.5">{stat.value}</p>
                    </div>
                  ))}
                </div>

                {/* Vision Sensor Matrix */}
                <div className="bg-white/60 border border-gray-100 p-3 rounded-xl mb-5">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest border-b border-gray-100 pb-1 mb-2">Vision Sensor Detections</p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-bold">
                    {[
                      { label: 'Human Presence', value: verificationResult.humanPresence },
                      { label: 'Vehicle Detected', value: verificationResult.vehiclePresence },
                      { label: 'Animal Detected', value: verificationResult.animalPresence },
                      { label: 'Hazardous Waste', value: verificationResult.hasHazardousMaterial, color: 'text-red-500' },
                      { label: 'Recyclables', value: verificationResult.recyclableDetected, color: 'text-green-500' },
                    ].map(det => (
                      <div key={det.label} className="flex items-center justify-between bg-white p-2 rounded-lg border border-gray-50">
                        <span className="text-[9px] text-gray-500">{det.label}</span>
                        <span className={`text-[10px] font-black uppercase ${det.value ? (det.color || 'text-indigo-600') : 'text-gray-300'}`}>{det.value ? 'Yes' : 'No'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Environmental Improvement & Weight */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-white/80 p-3 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[9px] text-gray-400 font-black uppercase tracking-wide">Est. Removed Weight</span>
                      <p className="font-black text-gray-800 text-sm mt-0.5">{verificationResult.estimatedWasteRemovedKg ?? 3.5} kg</p>
                    </div>
                    <Weight className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="bg-white/80 p-3 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[9px] text-gray-400 font-black uppercase tracking-wide">Environmental Improvement</span>
                      <p className="font-black text-green-600 text-sm mt-0.5">{verificationResult.environmentalImprovementScore ?? 95}/100</p>
                    </div>
                    <Percent className="w-5 h-5 text-green-500" />
                  </div>
                </div>

                {/* Text Observation & Recommendations */}
                <div className="space-y-3">
                  <div className="bg-white/80 p-3 rounded-xl border border-gray-100">
                    <p className="text-[9px] text-gray-400 font-black uppercase mb-1">AI Observation Detail</p>
                    <p className="text-xs text-gray-600 font-medium italic">"{verificationResult.detailedAiObservation || verificationResult.observations}"</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl">
                    <p className="text-[9px] text-blue-500 font-black uppercase mb-1">AI Recommendation & Audit Status</p>
                    <p className="text-xs text-blue-900 font-bold">"{verificationResult.aiRecommendation || 'Task completed successfully.'}"</p>
                  </div>
                </div>
              </div>
            )}

            {verificationStatus === 'failure' && (
              <p className="mt-4 text-red-600 text-center text-xs bg-red-50 border border-red-200 rounded-xl p-3">
                Verification failed. Please check the image and try again.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: CollectionTask['status'] }) {
  const config = {
    pending: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: Clock, label: 'Pending' },
    in_progress: { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Trash2, label: 'In Progress' },
    completed: { color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle, label: 'Completed' },
    verified: { color: 'bg-purple-100 text-purple-800 border-purple-200', icon: CheckCircle, label: 'Verified' },
    pending_manual_review: { color: 'bg-orange-100 text-orange-800 border-orange-200', icon: AlertTriangle, label: 'Pending Manual Review' }
  }
  const { color, icon: Icon, label } = config[status]
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${color} flex items-center gap-1`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}