'use client'
import { useState } from 'react'
import { Upload, CheckCircle, XCircle, Loader, ShieldAlert, AlertTriangle, Sparkles, Navigation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { analyzeImages } from '@/utils/geminiHelper'
import { parseGeminiJson } from '@/utils/geminiClientHelper'
import { checkDuplicateImageInDb } from '@/utils/db/actions'
import { toast } from 'react-hot-toast'

export default function VerifyWastePage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'failure'>('idle')
  const [verificationResult, setVerificationResult] = useState<{
    wasteCategory?: string;
    wasteType?: string;
    quantity?: string;
    confidence?: number;
    isDuplicateImage?: boolean;
    duplicateReason?: string;
    isClean?: boolean;
    wasteStillVisible?: boolean;
    cleannessCondition?: string;
    recommendation?: string;
    summary?: string;
  } | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      setFile(selectedFile)
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target?.result as string)
      }
      reader.readAsDataURL(selectedFile)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !preview) return

    setVerificationStatus('verifying')
    setVerificationResult(null)

    try {
      // Step 1: Duplicate check in DB
      const dupCheck = await checkDuplicateImageInDb(preview)

      // Step 2: AI Vision Analysis
      const prompt = `You are green Janakpur AI, an environmental waste & cleanup verification assistant.
Analyze this image and return ONLY valid JSON:
{
  "isDuplicateImage": false,
  "wasteDetected": true/false,
  "wasteCategory": "Plastic / Paper / Mixed / Clean Ground",
  "estimatedQuantity": "e.g. 2.5 kg",
  "confidence": 95,
  "isClean": true/false,
  "wasteStillVisible": true/false,
  "cleannessCondition": "Clean" | "Slightly Dirty" | "Dirty",
  "summary": "Brief summary of image analysis",
  "recommendation": "Approve Report" | "Reject - Duplicate" | "Reject - Waste Present"
}
Respond strictly with valid JSON.`

      const text = await analyzeImages(prompt, [{ base64: preview, mimeType: file.type }])
      const parsed = parseGeminiJson(text) || {}

      const isDup = dupCheck.isDuplicate || !!parsed.isDuplicateImage || parsed.recommendation?.includes('Duplicate')
      const dupReason = dupCheck.reason || parsed.duplicateReason || 'This image is duplicate (found matching image in database).'

      const wasteVisible = parsed.wasteStillVisible === true || (parsed.wasteDetected === true && parsed.isClean !== true)
      const isCleanSite = !wasteVisible && !isDup

      const resultObj = {
        wasteCategory: parsed.wasteCategory || (isCleanSite ? 'Cleaned Site' : 'Mixed Waste'),
        wasteType: parsed.wasteCategory || 'General Waste',
        quantity: parsed.estimatedQuantity || '2.5 kg',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 90,
        isDuplicateImage: isDup,
        duplicateReason: dupReason,
        isClean: isCleanSite,
        wasteStillVisible: wasteVisible,
        cleannessCondition: parsed.cleannessCondition || (isCleanSite ? 'Clean' : 'Dirty'),
        summary: parsed.summary || (isDup ? 'This image is duplicate.' : (isCleanSite ? 'Site is verified clean.' : 'Waste detected in image.')),
        recommendation: parsed.recommendation || (isDup ? 'Reject - Duplicate' : (isCleanSite ? 'Approve Report' : 'Needs Cleanness')),
      }

      setVerificationResult(resultObj)
      setVerificationStatus('success')

      if (isDup) {
        toast.error("This image is duplicate!", { duration: 5000 })
      } else if (wasteVisible) {
        toast.error("Waste is still visible in the image.", { duration: 5000 })
      } else {
        toast.success("Image verified successfully!", { duration: 5000 })
      }
    } catch (error) {
      console.error("Verification error:", error)
      setVerificationStatus('failure')
    }
  }

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2 text-gray-800">Verify Waste Image</h1>
      <p className="text-gray-500 text-sm mb-8">Upload an image to run AI inspection, duplicate detection, and cleanness verification.</p>
      
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8">
        <div className="mb-6">
          <label htmlFor="waste-image" className="block text-sm font-semibold text-gray-700 mb-2">
            Upload Waste or Cleanup Image
          </label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:border-green-400 transition-colors">
            <div className="space-y-1 text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <div className="flex text-sm text-gray-600">
                <label
                  htmlFor="waste-image"
                  className="relative cursor-pointer bg-white rounded-md font-medium text-green-600 hover:text-green-500 focus-within:outline-none"
                >
                  <span>Upload a file</span>
                  <input id="waste-image" name="waste-image" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500">PNG, JPG up to 10MB</p>
            </div>
          </div>
        </div>
        
        {preview && (
          <div className="mt-4 mb-6">
            <img src={preview} alt="Waste preview" className="max-w-full h-56 object-cover rounded-xl border border-gray-100 shadow-sm" />
          </div>
        )}
        
        <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold" disabled={!file || verificationStatus === 'verifying'}>
          {verificationStatus === 'verifying' ? (
            <>
              <Loader className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
              Analyzing Image with AI...
            </>
          ) : 'Verify Waste & Cleanness'}
        </Button>
      </form>

      {verificationStatus === 'success' && verificationResult && (
        <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-md mb-8">
          {/* Duplicate Banner */}
          {verificationResult.isDuplicateImage && (
            <div className="bg-red-50 border-2 border-red-500 rounded-2xl p-5 mb-5 text-red-900 flex items-start gap-3.5">
              <ShieldAlert className="w-8 h-8 text-red-600 flex-shrink-0 animate-pulse" />
              <div>
                <h4 className="text-base font-black text-red-900 uppercase">This image is duplicate</h4>
                <p className="text-xs font-bold text-red-700 mt-1">
                  {verificationResult.duplicateReason || "Duplicate image detected! You cannot submit an image that is already saved in the database."}
                </p>
              </div>
            </div>
          )}

          {/* Cleanness Failed Banner */}
          {!verificationResult.isDuplicateImage && verificationResult.wasteStillVisible && (
            <div className="bg-amber-50 border-2 border-amber-500 rounded-2xl p-5 mb-5 text-amber-900 flex items-start gap-3.5">
              <AlertTriangle className="w-8 h-8 text-amber-600 flex-shrink-0" />
              <div>
                <h4 className="text-base font-black text-amber-900 uppercase">Cleanness Verification Failed</h4>
                <p className="text-xs font-bold text-amber-800 mt-1">
                  Waste is still visible in this image. Site cleanness check was not satisfied.
                </p>
              </div>
            </div>
          )}

          {/* Cleanness Success Banner */}
          {!verificationResult.isDuplicateImage && verificationResult.isClean && (
            <div className="bg-green-50 border border-green-300 rounded-2xl p-4 mb-5 text-green-900 flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-extrabold text-green-900">Cleanness Verified</h4>
                <p className="text-xs text-green-700 font-medium">Ground is clean and free of waste.</p>
              </div>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3">AI Verification Details</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-gray-50 p-3 rounded-xl">
                <span className="text-[10px] text-gray-400 font-bold uppercase">Category</span>
                <p className="font-extrabold text-gray-800 mt-0.5">{verificationResult.wasteCategory}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-xl">
                <span className="text-[10px] text-gray-400 font-bold uppercase">Confidence</span>
                <p className="font-extrabold text-green-600 mt-0.5">{verificationResult.confidence}%</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-xl">
                <span className="text-[10px] text-gray-400 font-bold uppercase">Duplicate Status</span>
                <p className={`font-extrabold mt-0.5 ${verificationResult.isDuplicateImage ? 'text-red-600' : 'text-green-600'}`}>
                  {verificationResult.isDuplicateImage ? 'Duplicate Image' : 'Original Photo'}
                </p>
              </div>
            </div>
            {verificationResult.summary && (
              <p className="text-xs text-gray-600 mt-4 bg-gray-50 p-3 rounded-xl">
                <strong>Summary:</strong> {verificationResult.summary}
              </p>
            )}
          </div>
        </div>
      )}

      {verificationStatus === 'failure' && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-8 rounded-r-xl">
          <div className="flex">
            <XCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Verification Failed</h3>
              <p className="text-xs text-red-700 mt-1">Unable to verify the image. Please try again.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}