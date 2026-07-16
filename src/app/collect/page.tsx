'use client'
import { useState, useEffect } from 'react'
import { Trash2, MapPin, CheckCircle, Clock, ArrowRight, Camera, Upload, Loader, Calendar, Weight, Search, Coins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'react-hot-toast'
import { getWasteCollectionTasks, updateTaskStatus, saveReward, saveCollectedWaste, getUserByEmail, createNotification } from '@/utils/db/actions'
import { GoogleGenerativeAI } from "@google/generative-ai"
import { useSession } from "next-auth/react"

// Make sure to set your Gemini API key in your environment variables
const geminiApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY

type CollectionTask = {
  id: number
  userId?: number
  location: string
  wasteType: string
  amount: string
  status: 'pending' | 'in_progress' | 'completed' | 'verified'
  date: string
  collectorId: number | null
  imageUrl?: string | null
}

const ITEMS_PER_PAGE = 5

export default function CollectPage() {
  const [tasks, setTasks] = useState<CollectionTask[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredWasteType, setHoveredWasteType] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [user, setUser] = useState<{ id: number; email: string; name: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'nearby' | 'accepted' | 'completed'>('nearby')

  const { data: session, status } = useSession();

  useEffect(() => {
    const fetchUserAndTasks = async () => {
      setLoading(true)
      try {
        if (status === "authenticated" && session?.user?.email) {
          const fetchedUser = await getUserByEmail(session.user.email)
          if (fetchedUser) {
            setUser(fetchedUser)
          } else {
            toast.error('User not found. Please log in again.')
          }
        }

        const fetchedTasks = await getWasteCollectionTasks()
        setTasks(fetchedTasks as CollectionTask[])
      } catch (error) {
        console.error('Error fetching user and tasks:', error)
        toast.error('Failed to load user data and tasks. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    if (status !== "loading") {
      fetchUserAndTasks()
    }
  }, [status, session])

  const [selectedTask, setSelectedTask] = useState<CollectionTask | null>(null)
  const [verificationImage, setVerificationImage] = useState<string | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'failure'>('idle')
  const [verificationResult, setVerificationResult] = useState<{
    wasteTypeMatch: boolean;
    quantityMatch: boolean;
    confidence: number;
    cleanupQuality?: string;
    observations?: string;
  } | null>(null)
  const [reward, setReward] = useState<number | null>(null)

  const handleStatusChange = async (taskId: number, newStatus: CollectionTask['status']) => {
    if (!user) {
      toast.error('Please log in to collect waste.')
      return
    }

    try {
      const updatedTask = await updateTaskStatus(taskId, newStatus, user.id)
      if (updatedTask) {
        setTasks(tasks.map(task => 
          task.id === taskId ? { ...task, status: newStatus, collectorId: user.id } : task
        ))
        toast.success(newStatus === 'in_progress' ? 'Task claimed successfully! Citizen notified.' : 'Task status updated')
      } else {
        toast.error('Failed to update task status. Please try again.')
      }
    } catch (error) {
      console.error('Error updating task status:', error)
      toast.error('Failed to update task status. Please try again.')
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setVerificationImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const readFileAsBase64 = (dataUrl: string): string => {
    return dataUrl.split(',')[1]
  }

  const handleVerify = async () => {
    if (!selectedTask || !verificationImage || !user) {
      toast.error('Missing required information for verification.')
      return
    }

    setVerificationStatus('verifying')
    
    try {
      if (!geminiApiKey) {
        console.error("Gemini API key is missing.");
        setVerificationStatus('failure');
        toast.error("No data fetched or no result returned from the AI API. Missing API key.");
        return;
      }

      const genAI = new GoogleGenerativeAI(geminiApiKey)
      const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" })

      const afterBase64 = readFileAsBase64(verificationImage)

      const imageParts = [
        {
          inlineData: {
            data: afterBase64,
            mimeType: 'image/jpeg',
          },
        },
      ]

      let prompt = "";
      
      if (selectedTask.imageUrl && selectedTask.imageUrl.startsWith('data:image')) {
        const beforeBase64 = selectedTask.imageUrl.split(',')[1];
        const beforeMimeType = selectedTask.imageUrl.split(';')[0].split(':')[1];
        
        imageParts.unshift({
          inlineData: {
            data: beforeBase64,
            mimeType: beforeMimeType,
          }
        });

        prompt = `You are a waste management inspector. Compare these two images:
          1. Image 1 (BEFORE): The reported waste pile at the location.
          2. Image 2 (AFTER): The location after cleaning it up.
          
          Analyze both images to verify if the waste shown in Image 1 (BEFORE) has been successfully cleared and cleaned up in Image 2 (AFTER). The location should look clean and free of the reported waste.
          
          Respond in JSON format like this:
          {
            "verified": true/false,
            "confidence": confidence level as a number between 0 and 1,
            "cleanupQuality": "excellent" | "good" | "poor" | "not_cleaned",
            "observations": "brief description of what you see (e.g., 'All plastic bottles have been cleared. Roadside is clean.')"
          }`;
      } else {
        prompt = `You are a waste management inspector. Analyze this image showing a cleaned up area.
          Verify if the area shown is clean, clear, and free of waste.
          
          Respond in JSON format like this:
          {
            "verified": true/false,
            "confidence": confidence level as a number between 0 and 1,
            "cleanupQuality": "excellent" | "good" | "poor" | "not_cleaned",
            "observations": "brief description of what you see"
          }`;
      }

      const result = await model.generateContent([prompt, ...imageParts])
      const response = await result.response
      const text = response.text()
      
      try {
        const jsonText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedResult = JSON.parse(jsonText);
        
        setVerificationResult({
          wasteTypeMatch: parsedResult.verified,
          quantityMatch: parsedResult.verified,
          confidence: parsedResult.confidence,
          cleanupQuality: parsedResult.cleanupQuality,
          observations: parsedResult.observations
        })
        setVerificationStatus('success')
        
        if (parsedResult.verified && parsedResult.confidence > 0.7) {
          await handleStatusChange(selectedTask.id, 'verified')
          const earnedReward = 20; // exactly 20 points
          
          await saveReward(user.id, earnedReward)
          await saveCollectedWaste(selectedTask.id, user.id, parsedResult)

          // Notify citizen who reported this waste
          if (selectedTask.userId) {
            await createNotification(selectedTask.userId, "Cleanup verified.", "info");
          }

          setReward(earnedReward)
          toast.success(`Verification successful! You earned ${earnedReward} points!`, {
            duration: 5000,
            position: 'top-center',
          })
        } else {
          toast.error('Verification failed. The collected waste does not match the reported waste.', {
            duration: 5000,
            position: 'top-center',
          })
        }
      } catch (error) {
        console.error('Failed to parse JSON response:', text)
        setVerificationStatus('failure')
      }
    } catch (error) {
      console.error('Error verifying waste:', error)
      setVerificationStatus('failure')
    }
  }

  const nearbyCount = tasks.filter(t => t.status === 'pending').length;
  const acceptedCount = tasks.filter(t => t.status === 'in_progress' && t.collectorId === user?.id).length;
  const completedCount = tasks.filter(t => t.status === 'verified' && t.collectorId === user?.id).length;

  const getTodayPoints = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayVerifiedTasks = tasks.filter(t => 
      t.status === 'verified' && 
      t.collectorId === user?.id && 
      t.date === todayStr
    );
    return todayVerifiedTasks.length * 20;
  }

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.location.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (activeTab === 'nearby') {
      return task.status === 'pending';
    }
    if (activeTab === 'accepted') {
      return task.status === 'in_progress' && task.collectorId === user?.id;
    }
    if (activeTab === 'completed') {
      return task.status === 'verified' && task.collectorId === user?.id;
    }
    return false;
  })

  const pageCount = Math.ceil(filteredTasks.length / ITEMS_PER_PAGE)
  const paginatedTasks = filteredTasks.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold mb-6 text-gray-800">Collector Dashboard</h1>
      
      {/* Stats Cards Row */}
      {user && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col items-center justify-center text-center">
            <Trash2 className="w-6 h-6 text-yellow-500 mb-2" />
            <p className="text-2xl font-bold text-gray-800">{nearbyCount}</p>
            <p className="text-xs text-gray-500 font-semibold uppercase mt-1">Nearby Waste</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col items-center justify-center text-center">
            <Clock className="w-6 h-6 text-blue-500 mb-2" />
            <p className="text-2xl font-bold text-gray-800">{acceptedCount}</p>
            <p className="text-xs text-gray-500 font-semibold uppercase mt-1">Accepted Reports</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col items-center justify-center text-center">
            <CheckCircle className="w-6 h-6 text-green-500 mb-2" />
            <p className="text-2xl font-bold text-gray-800">{completedCount}</p>
            <p className="text-xs text-gray-500 font-semibold uppercase mt-1">Completed Reports</p>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-5 rounded-2xl border border-green-200 shadow-sm flex flex-col items-center justify-center text-center">
            <Coins className="w-6 h-6 text-green-600 mb-2" />
            <p className="text-2xl font-bold text-green-700">{getTodayPoints()}</p>
            <p className="text-xs text-green-600 font-semibold uppercase mt-1">Today's Points</p>
          </div>
        </div>
      )}

      {/* Tabs Selector */}
      <div className="flex space-x-2 bg-gray-100 p-1.5 rounded-xl border border-gray-200 mb-6 shadow-sm">
        <button
          onClick={() => { setActiveTab('nearby'); setCurrentPage(1); }}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 flex items-center justify-center ${
            activeTab === 'nearby' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Nearby Reports ({nearbyCount})
        </button>
        <button
          onClick={() => { setActiveTab('accepted'); setCurrentPage(1); }}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 flex items-center justify-center ${
            activeTab === 'accepted' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Accepted Reports ({acceptedCount})
        </button>
        <button
          onClick={() => { setActiveTab('completed'); setCurrentPage(1); }}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 flex items-center justify-center ${
            activeTab === 'completed' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Completed Reports ({completedCount})
        </button>
      </div>

      <div className="mb-4 flex items-center">
        <Input
          type="text"
          placeholder="Search by area..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mr-2"
        />
        <Button variant="outline" size="icon">
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader className="animate-spin h-8 w-8 text-gray-500" />
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {paginatedTasks.map(task => (
              <div key={task.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-lg font-medium text-gray-800 flex items-center">
                    <MapPin className="w-5 h-5 mr-2 text-gray-500" />
                    {task.location}
                  </h2>
                  <StatusBadge status={task.status} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm text-gray-600 mb-3">
                  <div className="flex items-center relative">
                    <Trash2 className="w-4 h-4 mr-2 text-gray-500" />
                    <span 
                      onMouseEnter={() => setHoveredWasteType(task.wasteType)}
                      onMouseLeave={() => setHoveredWasteType(null)}
                      className="cursor-pointer"
                    >
                      {task.wasteType.length > 8 ? `${task.wasteType.slice(0, 8)}...` : task.wasteType}
                    </span>
                    {hoveredWasteType === task.wasteType && (
                      <div className="absolute left-0 top-full mt-1 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
                        {task.wasteType}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center">
                    <Weight className="w-4 h-4 mr-2 text-gray-500" />
                    {task.amount}
                  </div>
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                    {task.date}
                  </div>
                </div>
                <div className="flex justify-end">
                  {task.status === 'pending' && (
                    <Button onClick={() => handleStatusChange(task.id, 'in_progress')} variant="outline" size="sm">
                      Start Collection
                    </Button>
                  )}
                  {task.status === 'in_progress' && task.collectorId === user?.id && (
                    <Button onClick={() => setSelectedTask(task)} variant="outline" size="sm">
                      Complete & Verify
                    </Button>
                  )}
                  {task.status === 'in_progress' && task.collectorId !== user?.id && (
                    <span className="text-yellow-600 text-sm font-medium">In progress by another collector</span>
                  )}
                  {task.status === 'verified' && (
                    <span className="text-green-600 text-sm font-medium">Reward Earned</span>
                  )}
                </div>
              </div>
            ))}
            {paginatedTasks.length === 0 && (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <Trash2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 font-medium">No tasks found in this section.</p>
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-center">
            <Button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="mr-2"
            >
              Previous
            </Button>
            <span className="mx-2 self-center">
              Page {currentPage} of {pageCount}
            </span>
            <Button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, pageCount))}
              disabled={currentPage === pageCount}
              className="ml-2"
            >
              Next
            </Button>
          </div>
        </>
      )}

      {selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl transition-all duration-300">
            <h3 className="text-2xl font-bold mb-2 text-gray-800">Cleanup Verification</h3>
            <p className="mb-6 text-sm text-gray-500">Upload a photo of the cleared area to prove you've successfully cleaned up the waste.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Before (Reported Waste)</p>
                {selectedTask.imageUrl ? (
                  <img src={selectedTask.imageUrl} alt="Before cleanup" className="w-full h-48 object-cover rounded-lg border border-gray-100 shadow-sm" />
                ) : (
                  <div className="w-full h-48 bg-gray-100 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400">
                    <p className="text-sm">No before image available</p>
                  </div>
                )}
              </div>
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">After (Collector Cleanup)</p>
                {verificationImage ? (
                  <img src={verificationImage} alt="After cleanup" className="w-full h-48 object-cover rounded-lg border border-gray-100 shadow-sm" />
                ) : (
                  <div className="w-full h-48 bg-gray-50 flex flex-col items-center justify-center rounded-lg border-2 border-gray-300 border-dashed hover:bg-gray-100 transition-colors duration-200 cursor-pointer relative">
                    <Upload className="h-10 w-10 text-gray-400 mb-2" />
                    <span className="text-sm text-blue-600 font-semibold">Upload cleanup photo</span>
                    <span className="text-xs text-gray-500 mt-1">PNG, JPG up to 10MB</span>
                    <input id="verification-image" name="verification-image" type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImageUpload} accept="image/*" />
                  </div>
                )}
              </div>
            </div>

            {verificationImage && (
              <div className="mb-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-blue-800 text-sm">
                <span>Cleanup photo uploaded successfully.</span>
                <button onClick={() => setVerificationImage(null)} className="text-blue-600 hover:text-blue-800 font-semibold">Replace</button>
              </div>
            )}

            <Button
              onClick={handleVerify}
              className="w-full py-3 text-lg font-semibold bg-green-600 hover:bg-green-700 text-white rounded-xl transition-colors duration-300 flex items-center justify-center"
              disabled={!verificationImage || verificationStatus === 'verifying'}
            >
              {verificationStatus === 'verifying' ? (
                <>
                  <Loader className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
                  Verifying Cleanup...
                </>
              ) : 'Verify & Claim Reward'}
            </Button>

            {verificationStatus === 'success' && verificationResult && (
              <div className="mt-6 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 p-4 rounded-xl shadow-sm text-green-800">
                <div className="flex items-center mb-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                  <h4 className="font-bold text-green-900">Cleanup Confirmed!</h4>
                </div>
                <div className="text-sm space-y-1">
                  <p><strong>Verification Confidence:</strong> {(verificationResult.confidence * 100).toFixed(1)}%</p>
                  <p><strong>Cleanup Quality:</strong> <span className="capitalize font-semibold">{verificationResult.cleanupQuality}</span></p>
                  <p className="mt-2 text-xs italic text-gray-600 bg-white p-2 rounded-lg border border-green-100">"{verificationResult.observations}"</p>
                </div>
              </div>
            )}
            
            {verificationStatus === 'failure' && (
              <p className="mt-4 text-red-650 text-center text-xs bg-red-50 border border-red-200 rounded-xl p-3 font-semibold">
                No data fetched or no result returned from the AI API. Please configure a valid Gemini API key and try again.
              </p>
            )}
            
            <Button onClick={() => {
              setSelectedTask(null);
              setVerificationImage(null);
              setVerificationStatus('idle');
              setVerificationResult(null);
            }} variant="outline" className="w-full mt-4 py-2.5 rounded-xl text-gray-700 hover:bg-gray-50 border-gray-300">
              Close
            </Button>
          </div>
        </div>
      )}

      {/* Add a conditional render to show user info or login prompt */}
      {/* {user ? (
        <p className="text-sm text-gray-600 mb-4">Logged in as: {user.name}</p>
      ) : (
        <p className="text-sm text-red-600 mb-4">Please log in to collect waste and earn rewards.</p>
      )} */}
    </div>
  )
}

function StatusBadge({ status }: { status: CollectionTask['status'] }) {
  const statusConfig = {
    pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
    in_progress: { color: 'bg-blue-100 text-blue-800', icon: Trash2 },
    completed: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
    verified: { color: 'bg-purple-100 text-purple-800', icon: CheckCircle },
  }

  const { color, icon: Icon } = statusConfig[status]

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${color} flex items-center`}>
      <Icon className="mr-1 h-3 w-3" />
      {status.replace('_', ' ')}
    </span>
  )
}