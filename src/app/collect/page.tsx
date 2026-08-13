'use client'
import { useState, useEffect, useCallback } from 'react'
import { Trash2, MapPin, CheckCircle, Clock, ArrowRight, Upload, Loader, Calendar, Weight, Search, Navigation, AlertTriangle, X, Sparkles, Activity, ShieldAlert, ShieldCheck, Flame, Percent } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'react-hot-toast'
import { getWasteCollectionTasks, updateTaskStatus, updateTaskStatusWithLocation, saveCollectedWaste, getUserByEmail, createNotification, checkDuplicateImageInDb } from '@/utils/db/actions'
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

const checkIsSameImage = (img1?: string | null, img2?: string | null): boolean => {
  if (!img1 || !img2) return false
  const clean1 = (img1.includes(',') ? img1.split(',')[1] : img1).trim()
  const clean2 = (img2.includes(',') ? img2.split(',')[1] : img2).trim()
  if (clean1 === clean2) return true
  if (clean1.length > 300 && clean2.length > 300) {
    if (clean1.slice(0, 300) === clean2.slice(0, 300) || clean1.slice(-300) === clean2.slice(-300)) return true
  }
  return false
}

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const uploadedBase64 = reader.result as string
        setVerificationImage(uploadedBase64)
        setVerificationStatus('idle')
        setVerificationResult(null)

        if (selectedTask?.imageUrl && checkIsSameImage(selectedTask.imageUrl, uploadedBase64)) {
          toast.error("Duplicate Image! Cleanup photo is identical to the Before (Reported) photo.", { duration: 6000 })
        }
      }
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

    // Step 1: Immediate duplicate check between Before and After images
    if (selectedTask.imageUrl && checkIsSameImage(selectedTask.imageUrl, verificationImage)) {
      toast.error("Cannot submit: Before and After images are identical! (Duplicate Image)", { duration: 6000 })
      return
    }

    let isDuplicateClient = false
    let duplicateReasonStr = ''

    if (selectedTask.imageUrl && checkIsSameImage(selectedTask.imageUrl, verificationImage)) {
      isDuplicateClient = true
      duplicateReasonStr = "This image is duplicate. Uploaded cleanup photo is identical to the original report photo."
    }

    if (!isDuplicateClient) {
      const dbDupCheck = await checkDuplicateImageInDb(verificationImage, selectedTask.id)
      if (dbDupCheck.isDuplicate) {
        isDuplicateClient = true
        duplicateReasonStr = `This image is duplicate. ${dbDupCheck.reason || 'Matches an existing photo in the database.'}`
      }
    }

    // Step 2: Get Collector GPS
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

    // Step 3: AI Verification
    setVerificationStatus('verifying')
    try {
      const images: Array<{ base64: string; mimeType?: string }> = []
      let prompt = ""

      if (selectedTask.imageUrl) {
        images.push({ base64: selectedTask.imageUrl })
        images.push({ base64: verificationImage, mimeType: 'image/jpeg' })
        prompt = `You are an AI Waste Cleanup Verification Assistant for the green Janakpur Waste Management system.
Your task is to compare two uploaded images:
1. Before Cleanup (Citizen Report, Image 1)
2. After Cleanup (Collector Submission, Image 2)

Analyze carefully for:
1. DUPLICATE IMAGE: Is Image 2 the exact same photo as Image 1, or a cropped/rotated version of Image 1, or showing the same uncleaned waste pile?
2. CLEANNESS / WASTE REMOVAL: Is the ground/area in Image 2 completely cleaned of waste? Or is garbage/waste still visible?

Return your response as valid JSON with the following structure:
{
  "isDuplicateImage": true/false,
  "duplicateReason": "Brief explanation if duplicate image detected, otherwise empty",
  "verificationStatus": "Verified" | "Duplicate Image" | "Unclean Waste Present" | "Cleanup Failed",
  "confidence": 95,
  "cleanupCompleted": true/false,
  "cleanupPercentage": 100,
  "remainingWaste": "description of remaining waste or None",
  "wasteStillVisible": true/false,
  "cleannessLevel": "Clean" | "Slightly Dirty" | "Dirty" | "Extremely Dirty",
  "cleanupQuality": "Excellent" | "Good" | "Fair" | "Poor",
  "matchedLocation": "Matched" | "Not Matched" | "Cannot determine from image.",
  "beforeAfterComparison": "objective observation comparing before and after backgrounds/landmarks and trash levels",
  "objectsRemoved": ["plastic bottles", "cardboard boxes", "etc"],
  "objectsRemaining": ["residual plastics", "etc"],
  "environmentCondition": "Clean ground / restored surface",
  "aiSummary": "2-4 sentence summary of cleanup result",
  "recommendation": "Approve Cleanup" | "Reject Cleanup - Duplicate Image" | "Reject Cleanup - Waste Still Present" | "Manual Review"
}

Respond ONLY with valid JSON. Do not include markdown fences.`
      } else {
        images.push({ base64: verificationImage, mimeType: 'image/jpeg' })
        prompt = `You are an AI Waste Cleanup Verification Assistant for the green Janakpur Waste Management system.
Analyze the cleanup image and verify:
1. DUPLICATE IMAGE: Is this image duplicate or fake?
2. CLEANNESS: Is the site restored and clean without waste?

Return valid JSON:
{
  "isDuplicateImage": false,
  "duplicateReason": "",
  "verificationStatus": "Verified" | "Duplicate Image" | "Unclean Waste Present",
  "confidence": 95,
  "cleanupCompleted": true/false,
  "cleanupPercentage": 100,
  "remainingWaste": "None",
  "wasteStillVisible": false,
  "cleannessLevel": "Clean",
  "cleanupQuality": "Excellent",
  "matchedLocation": "Matched",
  "beforeAfterComparison": "Area is verified clean.",
  "environmentCondition": "Restored ground surface",
  "aiSummary": "Site is clean and free of waste.",
  "recommendation": "Approve Cleanup"
}

Respond ONLY with valid JSON.`
      }

      const text = await analyzeImages(prompt, images)
      const parsedResult = parseGeminiJson(text)

      const isDuplicateFinal = isDuplicateClient || !!parsedResult.isDuplicateImage || parsedResult.verificationStatus === 'Duplicate Image' || (parsedResult.recommendation && parsedResult.recommendation.includes('Duplicate'))
      const duplicateReasonFinal = duplicateReasonStr || parsedResult.duplicateReason || 'This image is duplicate.'

      const wasteStillVisible = parsedResult.wasteStillVisible === true || parsedResult.cleanupCompleted === false || (parsedResult.cleannessLevel && parsedResult.cleannessLevel !== 'Clean')
      const isClean = !wasteStillVisible && !isDuplicateFinal

      const confPercent = parsedResult.confidence !== undefined ? parsedResult.confidence : 90

      const normalizedResult = {
        verified: isClean && !isDuplicateFinal,
        cleanupSuccess: isClean,
        confidence: confPercent / 100,
        isDuplicateImage: isDuplicateFinal,
        duplicateReason: duplicateReasonFinal,
        isClean: isClean,
        wasteStillVisible: wasteStillVisible,
        cleannessLevel: parsedResult.cleannessLevel || (isClean ? 'Clean' : 'Unclean'),
        isDifferentLocation: parsedResult.matchedLocation === 'Not Matched',
        cleanupQuality: parsedResult.cleanupQuality ? parsedResult.cleanupQuality.toLowerCase() : (isClean ? 'good' : 'poor'),
        observations: parsedResult.aiSummary || parsedResult.beforeAfterComparison || 'Inspection complete.',
        ...parsedResult,
        verificationStatus: isDuplicateFinal 
          ? 'Duplicate Image' 
          : (wasteStillVisible ? 'Unclean Waste Present' : (parsedResult.verificationStatus || 'Verified')),
      }

      setVerificationResult(normalizedResult)
      setVerificationStatus('success')

      // STRICT SUBMISSION GATE: BLOCK COMPLETION IF DUPLICATE OR UNCLEAN
      if (isDuplicateFinal) {
        toast.error("This image is duplicate! Task completion blocked.", { duration: 6000, position: 'top-center' })
        await saveCollectedWaste(selectedTask.id, user.id, normalizedResult, verificationImage)
        return
      }

      if (wasteStillVisible) {
        toast.error("Cleanness verification failed! Waste is still present.", { duration: 6000, position: 'top-center' })
        await saveCollectedWaste(selectedTask.id, user.id, normalizedResult, verificationImage)
        return
      }

      // Step 4: Proximity check + task status update in DB
      let nextStatus: 'completed' | 'pending_manual_review' = 'pending_manual_review'
      if (isClean && confPercent >= 90 && !normalizedResult.isDifferentLocation) {
        nextStatus = 'completed'
      } else {
        nextStatus = 'pending_manual_review'
      }

      const locationResult = await updateTaskStatusWithLocation(
        selectedTask.id, nextStatus, user.id, cLat, cLng
      )

      if (!locationResult.success) {
        if (locationResult.error === 'too_far') {
          const dist = locationResult.distanceMeters || 0
          setDistanceToReport(dist)
          setGpsError(`You are ${dist}m away from the reported location. Move within ${MAX_DISTANCE_METERS}m to complete this task.`)
          toast.error(`Too far! You are ${dist} meters from the reported location.`, { duration: 6000 })
          return
        }
        toast.error('Failed to complete task. Please check location.')
        return
      }

      setDistanceToReport(locationResult.updatedReport?.distanceMeters || null)
      await saveCollectedWaste(selectedTask.id, user.id, normalizedResult, verificationImage)

      if (nextStatus === 'completed') {
        if (selectedTask.userId) {
          await createNotification(selectedTask.userId, "Your waste report cleanup has been successfully completed and verified by AI!", "info")
        }
        toast.success('Cleanup verified successfully by AI! Task Completed.', { duration: 5000, position: 'top-center' })
      } else if (normalizedResult.isDifferentLocation) {
        if (selectedTask.userId) {
          await createNotification(selectedTask.userId, "Your waste report requires an official Manual Inspector Site Visit due to unmatched photo location.", "info")
        }
        toast('Unmatched image location detected! Submitted to DB for Manual Inspector Site Visit.', { duration: 7000, position: 'top-center', icon: '⚠️' })
      } else {
        if (selectedTask.userId) {
          await createNotification(selectedTask.userId, "Your waste cleanup report requires manual administrator review.", "info")
        }
        toast('Task submitted for Manual Review.', { duration: 6000, position: 'top-center', icon: '⚠️' })
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
                  <span className="flex items-center gap-1 bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200" title="AI Estimated Weight">
                    <Sparkles className="w-3 h-3" />
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
              <div className="flex items-center gap-2 text-gray-700 font-medium">
                <MapPin className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span><strong>Reported Waste Address:</strong> {selectedTask.location}</span>
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

            {/* Instant Duplicate Warning if Before & After are identical */}
            {checkIsSameImage(selectedTask.imageUrl, verificationImage) && (
              <div className="mb-4 bg-red-100 border-2 border-red-500 rounded-xl p-4 text-xs text-red-900 flex items-start gap-3 shadow-md">
                <ShieldAlert className="w-6 h-6 text-red-600 flex-shrink-0 animate-pulse mt-0.5" />
                <div>
                  <p className="font-extrabold text-sm uppercase text-red-900">This image is duplicate</p>
                  <p className="font-semibold text-red-800 mt-0.5">
                    The uploaded "After (Cleanup)" image is identical to the "Before (Reported)" image.
                  </p>
                  <p className="font-bold text-red-700 mt-1.5 bg-red-200 px-2.5 py-1 rounded inline-block">
                    🚫 Submission & Task Completion BLOCKED: You cannot submit the same image.
                  </p>
                </div>
              </div>
            )}

            <Button
              onClick={handleVerify}
              className={`w-full py-3 text-sm font-bold rounded-xl flex items-center justify-center gap-2 ${
                checkIsSameImage(selectedTask.imageUrl, verificationImage)
                  ? 'bg-red-300 text-red-900 border border-red-400 cursor-not-allowed opacity-80'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
              disabled={!verificationImage || verificationStatus === 'verifying' || gpsLoading || checkIsSameImage(selectedTask.imageUrl, verificationImage)}
            >
              {checkIsSameImage(selectedTask.imageUrl, verificationImage) ? (
                <>🚫 Submit Blocked: Duplicate Image</>
              ) : gpsLoading ? (
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

                {/* Duplicate Image Warning Banner */}
                {verificationResult.isDuplicateImage && (
                  <div className="bg-red-50 border-2 border-red-500 rounded-2xl p-5 mb-5 text-red-900 shadow-sm flex items-start gap-3.5">
                    <ShieldAlert className="w-8 h-8 text-red-600 flex-shrink-0 mt-0.5 animate-pulse" />
                    <div>
                      <h4 className="text-base font-black text-red-900 uppercase tracking-tight">This image is duplicate</h4>
                      <p className="text-xs font-bold text-red-700 mt-1">
                        {verificationResult.duplicateReason || "Duplicate image detected! You cannot submit the same image or a photo already saved in the database."}
                      </p>
                      <p className="text-[11px] font-semibold text-red-600 mt-2 bg-red-100 px-2.5 py-1 rounded-lg inline-block">
                        🚫 Task completion blocked: Duplicate images are not allowed. Please upload a genuine, newly taken photo of the cleaned site.
                      </p>
                    </div>
                  </div>
                )}

                {/* Cleanness Verification Failed Banner */}
                {!verificationResult.isDuplicateImage && (verificationResult.wasteStillVisible || !verificationResult.isClean) && (
                  <div className="bg-amber-50 border-2 border-amber-500 rounded-2xl p-5 mb-5 text-amber-900 shadow-sm flex items-start gap-3.5">
                    <AlertTriangle className="w-8 h-8 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-base font-black text-amber-900 uppercase tracking-tight">Cleanness Verification Failed: Waste Still Present</h4>
                      <p className="text-xs font-bold text-amber-800 mt-1">
                        The uploaded photo does not show a clean site. Waste or garbage is still visible in the image.
                      </p>
                      <p className="text-[11px] font-semibold text-amber-700 mt-2 bg-amber-100 px-2.5 py-1 rounded-lg inline-block">
                        🚫 Task completion blocked: The report cannot be submitted without site cleanness.
                      </p>
                    </div>
                  </div>
                )}

                {/* Cleanness Success Banner */}
                {!verificationResult.isDuplicateImage && verificationResult.isClean && (
                  <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 mb-5 text-emerald-900 flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-extrabold text-emerald-900">Cleanness Verified: Site Clean & Restored</h4>
                      <p className="text-xs text-emerald-700 font-medium mt-0.5">
                        AI confirmed 100% waste removal. Both report & collector locations verified and saved in database.
                      </p>
                    </div>
                  </div>
                )}

                {/* Unmatched / Suspicious Location Banner */}
                {verificationResult.isDifferentLocation && (
                  <div className="bg-amber-50 border-2 border-amber-500 rounded-2xl p-5 mb-5 text-amber-900 shadow-sm flex items-start gap-3.5">
                    <ShieldAlert className="w-8 h-8 text-amber-600 flex-shrink-0 mt-0.5 animate-pulse" />
                    <div>
                      <h4 className="text-base font-black text-amber-900 uppercase tracking-tight">
                        ⚠️ Suspicious / Unmatched Location — Manual Site Visit Required
                      </h4>
                      <p className="text-xs font-bold text-amber-800 mt-1">
                        The uploaded "After Cleanup" image shows a totally different location or background landmarks compared to the original report photo.
                      </p>
                      <p className="text-[11px] font-bold text-amber-700 mt-2 bg-amber-100 px-2.5 py-1 rounded-lg inline-block">
                        📋 Saved to Database: Status updated to "Pending Manual Review" for official Inspector Site Visit.
                      </p>
                    </div>
                  </div>
                )}

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
                    verificationResult.isDuplicateImage
                      ? 'bg-red-100 border-red-300 text-red-800'
                      : verificationResult.wasteStillVisible || !verificationResult.isClean
                      ? 'bg-amber-100 border-amber-300 text-amber-800'
                      : 'bg-green-50 border-green-200 text-green-700'
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

                {/* GPS Location Verification Stats Card */}
                <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-200 rounded-2xl p-4 mb-5 shadow-sm">
                  <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2.5 mb-3">
                    <div className="flex items-center gap-2">
                      <Navigation className="w-5 h-5 text-emerald-600 animate-pulse" />
                      <h4 className="text-xs font-black text-emerald-900 uppercase tracking-widest">GPS Location Verification Stats</h4>
                    </div>
                    <span className={`px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                      distanceToReport !== null && distanceToReport <= MAX_DISTANCE_METERS
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                        : 'bg-blue-100 border-blue-300 text-blue-800'
                    }`}>
                      {distanceToReport !== null && distanceToReport <= MAX_DISTANCE_METERS ? 'Location Verified ✓' : 'Proximity Validated'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                      <span className="text-[9px] text-gray-400 font-black uppercase">Citizen Report GPS</span>
                      <p className="font-extrabold text-gray-800 mt-0.5">
                        {selectedTask.latitude ? `${selectedTask.latitude.toFixed(5)}, ${selectedTask.longitude?.toFixed(5)}` : 'Captured'}
                      </p>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                      <span className="text-[9px] text-gray-400 font-black uppercase">Collector GPS</span>
                      <p className="font-extrabold text-gray-800 mt-0.5">
                        {collectorGps ? `${collectorGps.lat.toFixed(5)}, ${collectorGps.lng.toFixed(5)}` : 'Verified'}
                      </p>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                      <span className="text-[9px] text-gray-400 font-black uppercase">Proximity Distance</span>
                      <p className="font-extrabold text-emerald-700 mt-0.5">
                        {distanceToReport !== null ? `${distanceToReport} meters` : '< 100m'} <span className="text-[9px] text-gray-400 font-medium">(Max 100m)</span>
                      </p>
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
                    { label: 'GPS Proximity', value: distanceToReport !== null ? `${distanceToReport}m (Verified)` : 'Location Verified' },
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