'use client'
import { useState, useCallback, useEffect } from 'react'
import { MapPin, Upload, CheckCircle, Loader, AlertTriangle, Navigation, ShieldCheck, ShieldAlert, Sparkles, Check, X, Flame, AlertCircle, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { analyzeImages } from '@/utils/geminiHelper'
import { parseGeminiJson } from '@/utils/geminiClientHelper'
import ExifReader from 'exifreader'
import { StandaloneSearchBox, useJsApiLoader } from '@react-google-maps/api'
import { Libraries } from '@react-google-maps/api'
import { createUser, getUserByEmail, createReport, getRecentReports, checkDuplicateImageInDb } from '@/utils/db/actions'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { useSession } from "next-auth/react"

const geminiApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY
// Note: geminiHelper auto-detects API key vs OAuth Bearer token
const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
const libraries: Libraries = ['places']

export default function ReportPage() {
  const [user, setUser] = useState<{ id: number; email: string; name: string } | null>(null)
  const router = useRouter()

  const [reports, setReports] = useState<Array<{
    id: number
    location: string
    wasteType: string
    amount: string
    createdAt: string
    confidence?: number
    priority?: string
  }>>([])

  const [newReport, setNewReport] = useState({ location: '', type: '' })
  const [locationGps, setLocationGps] = useState<{
    lat: number | null
    lng: number | null
    formattedAddress: string
    wardNumber: string
  }>({ lat: null, lng: null, formattedAddress: '', wardNumber: '' })

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'failure'>('idle')
  const [verificationResult, setVerificationResult] = useState<any | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{
    isDuplicate: boolean
    duplicateOfId: number | null
    confidence: number
    reason: string
  } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [searchBox, setSearchBox] = useState<google.maps.places.SearchBox | null>(null)

  // Optional Visual Scale Reference feature
  const [hasScaleReference, setHasScaleReference] = useState<boolean>(false)
  const [scaleReferenceType, setScaleReferenceType] = useState<string>('Dustbin')

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: googleMapsApiKey!,
    libraries,
  })

  const onLoad = useCallback((ref: google.maps.places.SearchBox) => setSearchBox(ref), [])

  const extractWardFromComponents = (components: google.maps.GeocoderAddressComponent[]): string => {
    for (const component of components) {
      const name = component.long_name.toLowerCase()
      // Check for ward in sublocality, neighborhood, or explicit ward mentions
      if (component.types.includes('sublocality') || component.types.includes('neighborhood')) {
        const wardMatch = name.match(/ward\s*[#-]?\s*(\d+)/i)
        if (wardMatch) return wardMatch[1]
      }
      // Check long_name for ward number patterns
      const wardMatch = component.long_name.match(/ward\s*[#-]?\s*(\d+)/i)
      if (wardMatch) return wardMatch[1]
    }
    // Try political sublocality for Janakpur
    for (const component of components) {
      if (component.types.includes('sublocality_level_1') || component.types.includes('sublocality_level_2')) {
        return component.short_name || ''
      }
    }
    return ''
  }

  const onPlacesChanged = () => {
    if (searchBox) {
      const places = searchBox.getPlaces()
      if (places && places.length > 0) {
        const place = places[0]
        const lat = place.geometry?.location?.lat() || null
        const lng = place.geometry?.location?.lng() || null
        const formattedAddress = place.formatted_address || ''
        const wardNumber = place.address_components
          ? extractWardFromComponents(place.address_components)
          : ''

        setNewReport(prev => ({ ...prev, location: formattedAddress }))
        setLocationGps({ lat, lng, formattedAddress, wardNumber })
      }
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setNewReport(prev => ({ ...prev, [name]: value }))
  }

  const setLocationInputValue = (address: string) => {
    setNewReport(prev => ({ ...prev, location: address }))
    setTimeout(() => {
      const inputEl = document.getElementById('location-input') as HTMLInputElement
      if (inputEl) {
        inputEl.value = address
      }
    }, 100)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const selectedFile = e.target.files[0]
      setFile(selectedFile)
      
      const reader = new FileReader()
      reader.onload = (e) => setPreview(e.target?.result as string)
      reader.readAsDataURL(selectedFile)

      try {
        const tags = await ExifReader.load(selectedFile, { expanded: true })
        if (tags.gps && typeof tags.gps.Latitude === 'number' && typeof tags.gps.Longitude === 'number') {
          const lat = tags.gps.Latitude
          const lng = tags.gps.Longitude
          
          toast.success("Image contains GPS coordinates! Autofilling location...")

          if (typeof google !== 'undefined' && google.maps && google.maps.Geocoder) {
            const geocoder = new google.maps.Geocoder()
            geocoder.geocode({ location: { lat, lng } }, (results, status) => {
              if (status === 'OK' && results && results[0]) {
                const address = results[0].formatted_address
                const ward = results[0].address_components
                  ? extractWardFromComponents(results[0].address_components)
                  : ''
                setLocationGps({ lat, lng, formattedAddress: address, wardNumber: ward })
              } else {
                const coordsAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
                setLocationGps({ lat, lng, formattedAddress: coordsAddress, wardNumber: '' })
              }
            })
          } else {
            const coordsAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
            setLocationGps({ lat, lng, formattedAddress: coordsAddress, wardNumber: '' })
          }
        }
      } catch (exifErr) {
        console.warn("No GPS EXIF tags detected in uploaded photo:", exifErr)
      }
    }
  }

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.')
      return
    }
    toast.loading('Detecting your GPS location...', { id: 'report-gps' })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude

        const doReverseGeocode = (geocoder: google.maps.Geocoder) => {
          geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            if (status === 'OK' && results && results[0]) {
              const address = results[0].formatted_address
              const ward = results[0].address_components
                ? extractWardFromComponents(results[0].address_components)
                : ''
              setLocationGps({ lat, lng, formattedAddress: address, wardNumber: ward })
              toast.success('Location auto-filled from GPS!', { id: 'report-gps' })
            } else {
              // Geocoder failed — try OpenStreetMap Nominatim as fallback
              fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&email=smartjanakpur@gmail.com`)
                .then(r => r.json())
                .then(data => {
                  const address = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
                  setLocationGps({ lat, lng, formattedAddress: address, wardNumber: '' })
                  toast.success('Location auto-filled from GPS!', { id: 'report-gps' })
                })
                .catch(() => {
                  // Last resort: show readable coords
                  const fallback = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`
                  setLocationGps({ lat, lng, formattedAddress: fallback, wardNumber: '' })
                  toast.success('GPS coordinates captured!', { id: 'report-gps' })
                })
            }
          })
        }

        if (typeof google !== 'undefined' && google.maps && google.maps.Geocoder) {
          doReverseGeocode(new google.maps.Geocoder())
        } else {
          // Google Maps not loaded — use Nominatim directly
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&email=smartjanakpur@gmail.com`)
            .then(r => r.json())
            .then(data => {
              const address = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
              setLocationGps({ lat, lng, formattedAddress: address, wardNumber: '' })
              toast.success('Location auto-filled from GPS!', { id: 'report-gps' })
            })
            .catch(() => {
              const fallback = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`
              setLocationGps({ lat, lng, formattedAddress: fallback, wardNumber: '' })
              toast.success('GPS coordinates captured!', { id: 'report-gps' })
            })
        }
      },
      (err) => {
        toast.error('Unable to get GPS location. Please allow location access.', { id: 'report-gps' })
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const checkDuplicateReport = async (newImageBase64: string, newLocation: string) => {
    try {
      if (!geminiApiKey) return null
      const recentReports = await getRecentReports()
      const candidates = recentReports
        .filter(r => r.imageUrl && r.location && (r.status === 'pending' || r.status === 'in_progress'))
        .slice(0, 3)
      if (candidates.length === 0) return null

      const images: Array<{ base64: string; mimeType?: string }> = [
        { base64: newImageBase64, mimeType: 'image/jpeg' }
      ]
      const candidatesInfo: Array<{ id: number; location: string; wasteType: string }> = []

      for (const report of candidates) {
        if (report.imageUrl?.startsWith('data:image')) {
          images.push({ base64: report.imageUrl })
          candidatesInfo.push({ id: report.id, location: report.location, wasteType: report.wasteType })
        }
      }

      if (images.length <= 1) return null

      const prompt = `You are a waste management AI checking for duplicate waste reports.
New report location: "${newLocation}"
Existing reports: ${candidatesInfo.map((c, i) => `Image ${i + 2}: Report #${c.id} at "${c.location}" (${c.wasteType})`).join(', ')}
Compare Image 1 (new) with the other images. Is it a duplicate of the same waste pile?
Respond ONLY in JSON (no markdown): { "isDuplicate": bool, "duplicateOfId": number|null, "confidence": 0-1, "reason": "brief explanation" }`

      const text = await analyzeImages(prompt, images)
      return parseGeminiJson(text)
    } catch (error) {
      console.error("Duplicate check error:", error)
      return null
    }
  }

  const handleVerify = async () => {
    if (!file) return
    setVerificationStatus('verifying')
    try {
      const base64Data = await readFileAsBase64(file)

      const scaleContext = hasScaleReference
        ? `Visual Scale Reference Context: A user-indicated scale reference object of type "${scaleReferenceType}" is present in the image.`
        : `Visual Scale Reference Context: No scale reference object indicated by user.`

      const prompt = `You are green Janakpur AI, an expert environmental waste inspection assistant using computer vision.

${scaleContext}

Analyze the uploaded Citizen waste image carefully.

Return ONLY a single valid JSON object with NO markdown fences, matching this EXACT schema:

{
  "verificationStatus": "Verified",
  "wasteDetected": true,
  "wasteCategory": "Plastic & Mixed Recyclables",
  "wasteTypes": [
    "Plastic Containers",
    "Plastic Packaging",
    "Paper",
    "Cardboard"
  ],
  "confidence": 88,
  "estimatedQuantity": {
    "value": "Approximately 15–20",
    "confidence": 75,
    "basis": "Visible count estimate"
  },
  "dimensions": {
    "lengthCm": null,
    "widthCm": null,
    "heightCm": null,
    "status": "Cannot reliably estimate from image",
    "confidence": 0
  },
  "volume": {
    "valueM3": null,
    "status": "Cannot reliably estimate from image",
    "confidence": 0
  },
  "density": {
    "class": null,
    "status": "Cannot reliably determine",
    "confidence": 0
  },
  "weightRange": {
    "minKg": null,
    "maxKg": null,
    "status": "Cannot reliably estimate without sufficient scale/volume evidence",
    "confidence": 0
  },
  "recyclability": {
    "status": "Partially Recyclable",
    "confidence": 88
  },
  "priorityLevel": "High",
  "environmentalRisk": "Medium",
  "generatedDescription": "The image shows scattered plastic containers and mixed paper and cardboard waste accumulated in an outdoor area.",
  "recyclingRecommendations": [
    "Separate plastic containers from paper and cardboard.",
    "Keep recyclable materials clean and dry before recycling.",
    "Send recyclable plastic, paper and cardboard to an appropriate recycling facility."
  ],
  "duplicateCheck": {
    "isPotentialDuplicate": false,
    "similarityConfidence": 91,
    "matchedReportId": null,
    "reason": "No sufficiently similar recent report was identified."
  },
  "aiSummary": "Mixed recyclable waste has been detected. The image provides sufficient evidence to classify the waste and estimate its visible quantity, but there is not enough reliable visual scale information to estimate physical dimensions, volume or weight.",
  "measurementWarning": "Physical measurements and weight require field measurement or a reliable visual scale reference."
}

CRITICAL RULES:
1. Distinguish between VISUALLY DETECTABLE info vs PHYSICAL VISUAL ESTIMATION.
2. Physical estimates (dimensions, volume, density, weightRange) MUST ONLY be estimated if reliable visual scale evidence exists in the image (e.g. known size object, dustbin, vehicle, person, door, ruler, standard container).
3. If no reliable reference exists:
   - Set lengthCm, widthCm, heightCm to null and dimensions.status to "Cannot reliably estimate from image".
   - Set valueM3 to null and volume.status to "Cannot reliably estimate from image".
   - Set class to null and density.status to "Cannot reliably determine".
   - Set minKg and maxKg to null and weightRange.status to "Cannot reliably estimate without sufficient scale/volume evidence".
4. NEVER fabricate physical dimensions or volume simply because waste looks large.
5. NEVER estimate weight or weight range if dimensions or volume cannot be estimated reliably! Weight estimation depends directly on volume and density.
6. If visual scale evidence EXISTS:
   - Estimate lengthCm, widthCm, heightCm in centimeters.
   - Calculate volume valueM3 (approx Length × Width × Height in meters).
   - Determine density class ("Low", "Medium", "High", "Mixed/Variable").
   - Calculate weightRange minKg and maxKg (derive range from volume × density).
7. Respond ONLY with valid JSON.`

      const text = await analyzeImages(prompt, [{ base64: base64Data, mimeType: file.type }])
      
      if (!text) {
        setErrorMessage('AI analysis returned no response. This could be due to slow internet or API rate limits. Please try again.')
        setVerificationStatus('failure')
        return
      }

      let parsedResult: any
      try {
        parsedResult = parseGeminiJson(text)
      } catch (jsonErr) {
        console.error("Gemini output was not valid JSON:", jsonErr)
        setErrorMessage('AI returned an unexpected response. Please try again.')
        setVerificationStatus('failure')
        return
      }

      if (parsedResult) {
        const r = parsedResult.analysis || parsedResult

        const confRaw = r.confidence !== undefined ? r.confidence : (r.aiConfidence !== undefined ? r.aiConfidence : 85)
        const confidenceVal = confRaw <= 1 ? Math.round(confRaw * 100) : Math.round(confRaw)

        // Parse & normalize dimensions
        let dimObj = r.dimensions || null
        if (!dimObj && r.estimatedDimensions) {
          const d = r.estimatedDimensions
          if (d.lengthCm || d.widthCm || d.heightCm) {
            dimObj = {
              lengthCm: d.lengthCm ?? null,
              widthCm: d.widthCm ?? null,
              heightCm: d.heightCm ?? null,
              status: "Estimated from visual reference",
              confidence: confidenceVal,
            }
          }
        }
        if (!dimObj) {
          dimObj = {
            lengthCm: null,
            widthCm: null,
            heightCm: null,
            status: "Cannot reliably estimate from image",
            confidence: 0,
          }
        }

        const hasValidDims = dimObj.lengthCm !== null && dimObj.lengthCm !== undefined && !dimObj.status?.includes("Cannot")

        // Parse & normalize volume
        let volObj = r.volume || null
        if (!volObj && r.estimatedVolumeM3 !== undefined && r.estimatedVolumeM3 !== null) {
          volObj = {
            valueM3: r.estimatedVolumeM3,
            status: "Estimated from visual dimensions",
            confidence: confidenceVal,
          }
        }
        const hasValidVol = volObj?.valueM3 !== null && volObj?.valueM3 !== undefined && !volObj?.status?.includes("Cannot")

        if (!hasValidDims || !hasValidVol) {
          volObj = {
            valueM3: null,
            status: "Cannot reliably estimate from image",
            confidence: 0,
          }
        }

        // Parse & normalize density
        let densityObj = r.density || null
        if (!densityObj && r.densityClass) {
          densityObj = {
            class: r.densityClass !== "Cannot Determine" ? r.densityClass : null,
            status: r.densityClass !== "Cannot Determine" ? "Determined from visible waste category" : "Cannot reliably determine",
            confidence: r.densityClass !== "Cannot Determine" ? confidenceVal : 0,
          }
        }
        if (!densityObj) {
          densityObj = {
            class: null,
            status: "Cannot reliably determine",
            confidence: 0,
          }
        }

        // Parse & normalize weight range - CRITICAL INVARIANT SAFEGUARD
        let weightObj = r.weightRange || null
        if (!weightObj && r.estimatedWeightRangeKg && typeof r.estimatedWeightRangeKg.min === 'number') {
          weightObj = {
            minKg: r.estimatedWeightRangeKg.min,
            maxKg: r.estimatedWeightRangeKg.max,
            status: "Estimated from volume and density",
            confidence: confidenceVal,
          }
        }

        // IF DIMENSIONS OR VOLUME CANNOT BE ESTIMATED RELIABLY, WEIGHT RANGE MUST BE NULL!
        if (!hasValidDims || !hasValidVol) {
          weightObj = {
            minKg: null,
            maxKg: null,
            status: "Cannot reliably estimate without sufficient scale/volume evidence",
            confidence: 0,
          }
        }

        // Parse quantity
        let qtyObj = r.estimatedQuantity || null
        if (typeof qtyObj === 'string') {
          qtyObj = {
            value: qtyObj,
            confidence: confidenceVal,
            basis: "Visible count estimate",
          }
        } else if (!qtyObj) {
          qtyObj = {
            value: "Scattered / uncountable",
            confidence: 0,
            basis: "Visual inspection",
          }
        }

        // Parse recyclability
        let recyclabilityObj = r.recyclability || null
        if (typeof recyclabilityObj === 'string') {
          recyclabilityObj = {
            status: recyclabilityObj,
            confidence: confidenceVal,
          }
        } else if (!recyclabilityObj) {
          recyclabilityObj = {
            status: r.recyclable ? (typeof r.recyclable === 'string' ? r.recyclable : 'Mostly Recyclable') : 'Partially Recyclable',
            confidence: confidenceVal,
          }
        }

        const wasteDetected = r.wasteDetected !== undefined ? r.wasteDetected : true
        const isVerified = wasteDetected && confidenceVal >= 60

        const recList = Array.isArray(r.recyclingRecommendations)
          ? r.recyclingRecommendations
          : Array.isArray(r.recyclingSuggestions)
          ? r.recyclingSuggestions
          : ["Separate recyclable materials for processing."]

        const wasteTypes = Array.isArray(r.wasteTypes)
          ? r.wasteTypes
          : Array.isArray(r.wasteObjects)
          ? r.wasteObjects.map((o: any) => o.name)
          : [r.wasteCategory || r.primaryWasteType || "Mixed Waste"]

        const dupCheckObj = r.duplicateCheck || {
          isPotentialDuplicate: false,
          similarityConfidence: 0,
          matchedReportId: null,
          reason: "No sufficiently similar recent report was identified.",
        }

        const normalizedResult = {
          verificationStatus: isVerified ? "Verified" : "Manual Review Recommended",
          wasteDetected,
          wasteCategory: r.wasteCategory || r.primaryWasteType || "Plastic & Mixed Recyclables",
          wasteTypes,
          confidence: confidenceVal,
          aiConfidence: confidenceVal,
          estimatedQuantity: qtyObj,
          dimensions: dimObj,
          volume: volObj,
          density: densityObj,
          weightRange: weightObj,
          recyclability: recyclabilityObj,
          priorityLevel: r.priorityLevel || r.priority || "High",
          environmentalRisk: r.environmentalRisk || r.environmentRisk || "Medium",
          generatedDescription: r.generatedDescription || r.wasteDescription || "Waste pile detected in reported area.",
          recyclingRecommendations: recList,
          duplicateCheck: dupCheckObj,
          aiSummary: r.aiSummary || r.summary || (isVerified ? "Waste detected and verified." : "Low confidence analysis."),
          measurementWarning: r.measurementWarning || "Physical measurements and weight require field measurement or a reliable visual scale reference.",
          // Legacy compat fields for external components
          estimatedDimensions: (dimObj.lengthCm && dimObj.widthCm && dimObj.heightCm)
            ? { lengthCm: dimObj.lengthCm, widthCm: dimObj.widthCm, heightCm: dimObj.heightCm }
            : null,
          estimatedVolumeM3: volObj.valueM3,
          densityClass: densityObj.class,
          estimatedWeightRangeKg: (weightObj.minKg !== null && weightObj.minKg !== undefined)
            ? { min: weightObj.minKg, max: weightObj.maxKg }
            : null,
          estimatedWeightKg: (weightObj.minKg !== null && weightObj.minKg !== undefined)
            ? `~${weightObj.minKg}–${weightObj.maxKg} kg`
            : "Not reliably estimable",
          ...r,
        }

        setVerificationResult(normalizedResult)
        setNewReport(prev => ({
          ...prev,
          type: normalizedResult.wasteCategory,
        }))

        const dbDupCheck = await checkDuplicateImageInDb(base64Data)

        if (normalizedResult.isDuplicate || dbDupCheck.isDuplicate || dupCheckObj.isPotentialDuplicate) {
          setDuplicateWarning({
            isDuplicate: true,
            duplicateOfId: dbDupCheck.duplicateOfId || normalizedResult.similarReportId || dupCheckObj.matchedReportId,
            confidence: (normalizedResult.duplicateConfidence || dupCheckObj.similarityConfidence || 100) / 100,
            reason: dbDupCheck.reason || dupCheckObj.reason || `This image is duplicate (highly similar to previous report #${normalizedResult.similarReportId}).`
          })
          toast.error(`This image is duplicate! You cannot submit duplicate images.`, { duration: 5000 })
        } else {
          setDuplicateWarning(null)
        }

        setVerificationStatus('success')
      } else {
        setErrorMessage('Could not analyze the image. Please try again.')
        setVerificationStatus('failure')
      }
    } catch (error) {
      console.error('Verification error:', error)
      setErrorMessage('Network error — please check your internet connection and try again.')
      setVerificationStatus('failure')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (verificationStatus !== 'success' || !user) {
      toast.error('Please verify the waste image before submitting.')
      return
    }
    const qtyVal = typeof verificationResult?.estimatedQuantity === 'object'
      ? verificationResult.estimatedQuantity?.value
      : verificationResult?.estimatedQuantity

    let submittedAmount = 'Visual estimate'
    if (verificationResult?.weightRange?.minKg !== null && verificationResult?.weightRange?.minKg !== undefined) {
      submittedAmount = `~${verificationResult.weightRange.minKg}–${verificationResult.weightRange.maxKg} kg (${qtyVal || 'Visual count'})`
    } else if (verificationResult?.estimatedWeightRangeKg?.min !== undefined) {
      submittedAmount = `~${verificationResult.estimatedWeightRangeKg.min}–${verificationResult.estimatedWeightRangeKg.max} kg (${qtyVal || 'Visual count'})`
    } else if (qtyVal) {
      submittedAmount = `${qtyVal} (Weight unestimable without scale)`
    }

    if (duplicateWarning?.isDuplicate) {
      toast.error('This image is duplicate! Report submission is blocked.')
      return
    }

    if (verificationResult?.wasteDetected === false) {
      toast.error('No waste detected in this image! Report submission is blocked.')
      return
    }

    setIsSubmitting(true)
    try {
      const report = await createReport(
        user.id,
        newReport.location,
        newReport.type,
        submittedAmount,
        preview || undefined,
        verificationResult || undefined,
        locationGps.lat ?? undefined,
        locationGps.lng ?? undefined,
        locationGps.formattedAddress || undefined,
        locationGps.wardNumber || undefined,
      ) as any

      const formattedReport = {
        id: report.id,
        location: report.location,
        wasteType: report.wasteType,
        amount: report.amount,
        createdAt: report.createdAt instanceof Date
          ? report.createdAt.toISOString().split('T')[0]
          : new Date(report.createdAt).toISOString().split('T')[0],
        confidence: verificationResult?.confidence,
        priority: verificationResult?.priorityLevel || verificationResult?.priority,
      }

      setReports([formattedReport, ...reports])
      setNewReport({ location: '', type: '' })
      setLocationGps({ lat: null, lng: null, formattedAddress: '', wardNumber: '' })
      setFile(null)
      setPreview(null)
      setVerificationStatus('idle')
      setVerificationResult(null)
      setDuplicateWarning(null)

      toast.success('Report submitted! Points will be awarded after a collector verifies the cleanup.')
    } catch (error) {
      console.error('Submit error:', error)
      toast.error('Failed to submit report. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const { data: session, status } = useSession()

  useEffect(() => {
    const checkUser = async () => {
      if (status === "authenticated" && session?.user?.email) {
        let fetchedUser = await getUserByEmail(session.user.email)
        if (!fetchedUser) {
          fetchedUser = await createUser(session.user.email, session.user.name || 'Anonymous')
        }
        setUser(fetchedUser)

        if (fetchedUser?.wardNumber) {
          setLocationGps(prev => ({
            ...prev,
            wardNumber: prev.wardNumber || fetchedUser.wardNumber || ''
          }))
        }

        const recentReports = await getRecentReports()
        setReports(recentReports.map(r => {
          const parsedResult = r.verificationResult ? (typeof r.verificationResult === 'string' ? JSON.parse(r.verificationResult) : r.verificationResult) : null
          return {
            ...r,
            createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString().split('T')[0] : new Date(r.createdAt as any).toISOString().split('T')[0],
            confidence: parsedResult?.confidence || parsedResult?.aiConfidence,
            priority: parsedResult?.priorityLevel || parsedResult?.priority || "High"
          }
        }))
      } else if (status === "unauthenticated") {
        router.push('/login')
      }
    }
    checkUser()
  }, [status, session, router])

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Report Waste</h1>
        <p className="text-gray-500 text-sm mt-1">Submit a verified waste report to earn <strong>20 points</strong> after cleanup is confirmed.</p>
      </div>

      {/* Points Info Banner */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-6 flex items-start gap-2.5">
        <Navigation className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-green-700">
          <strong>+20 points</strong> will be awarded to your account once a collector verifies the cleanup at the reported location.
          Your GPS coordinates are saved to enable precise verification.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100 mb-10">
        {/* Image Upload */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Upload Waste Image</label>
          <div className="flex justify-center px-6 pt-5 pb-6 border-2 border-gray-200 border-dashed rounded-xl hover:border-green-400 transition-colors">
            <div className="space-y-1 text-center">
              <Upload className="mx-auto h-10 w-10 text-gray-300" />
              <div className="flex text-sm text-gray-500">
                <label htmlFor="waste-image" className="cursor-pointer font-medium text-green-600 hover:text-green-500">
                  <span>Upload a file</span>
                  <input id="waste-image" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-400">PNG, JPG up to 10MB</p>
            </div>
          </div>
        </div>
        {/* Optional Visual Scale Reference Control */}
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={hasScaleReference}
              onChange={(e) => setHasScaleReference(e.target.checked)}
              className="w-4 h-4 text-green-600 rounded focus:ring-green-500 cursor-pointer"
            />
            <span className="text-xs font-bold text-gray-800">
              Is a size reference visible in the image? <span className="text-gray-400 font-normal">(Optional)</span>
            </span>
          </label>

          {hasScaleReference && (
            <div className="pt-2 border-t border-gray-200 animate-in fade-in duration-200">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Reference Type:
              </label>
              <select
                value={scaleReferenceType}
                onChange={(e) => setScaleReferenceType(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-800 focus:ring-2 focus:ring-green-400 focus:outline-none font-medium"
              >
                <option value="Ruler">Ruler / Measurement Marker</option>
                <option value="Person">Person / Human</option>
                <option value="Vehicle">Vehicle / Car / Motorbike</option>
                <option value="Dustbin">Dustbin / Standard Trash Bin</option>
                <option value="Door">Door / Entrance</option>
                <option value="Standard Container">Standard Container / Box</option>
                <option value="Other">Other Known Object</option>
              </select>
              <p className="text-[11px] text-gray-500 mt-1 font-medium">
                AI will use this scale reference to estimate physical dimensions and volume if clearly visible.
              </p>
            </div>
          )}
        </div>

        {preview && (
          <div className="mt-2 mb-6">
            <img src={preview} alt="Waste preview" className="max-w-full h-48 object-cover rounded-xl shadow-sm border border-gray-100" />
          </div>
        )}

        <Button
          type="button"
          onClick={handleVerify}
          className="w-full mb-6 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold"
          disabled={!file || verificationStatus === 'verifying'}
        >
          {verificationStatus === 'verifying' ? (
            <><Loader className="animate-spin mr-2 h-4 w-4" /> Analyzing Image...</>
          ) : 'Analyze with AI'}
        </Button>

        {verificationStatus === 'failure' && (
          <div className="mb-6 bg-red-50 border border-red-200 p-4 rounded-xl text-red-800 text-sm">
            <p className="font-bold">Analysis Failed</p>
            <p className="text-xs mt-1">{errorMessage || 'Something went wrong. Please try again.'}</p>
            <button
              type="button"
              onClick={handleVerify}
              className="mt-2 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg font-semibold transition-colors"
            >
              🔄 Retry Analysis
            </button>
          </div>
        )}

        {verificationStatus === 'success' && verificationResult && (
          <div className="bg-white/60 backdrop-blur-xl border border-white/80 shadow-2xl p-6 sm:p-8 mb-8 rounded-3xl relative overflow-hidden">
            {/* Glow accents */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 rounded-full blur-3xl -z-10" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -z-10" />

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-5 mb-6 gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-tr from-green-500 to-emerald-600 rounded-2xl text-white shadow-lg shadow-green-500/20">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-gray-900 tracking-tight">AI WASTE ANALYSIS</h3>
                  <p className="text-xs text-gray-500 mt-0.5 font-medium">Smart Janakpur Waste Analysis Assistant</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Status:</span>
                <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border shadow-sm ${
                  (verificationResult.verificationStatus === 'Verified' || verificationResult.verificationStatus === 'Verified ✓')
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                  {verificationResult.verificationStatus === 'Verified' ? '✓ Verified' : (verificationResult.verificationStatus || 'Manual Review Recommended')}
                </span>
              </div>
            </div>

            {/* Duplicate Warning */}
            {duplicateWarning?.isDuplicate && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-start gap-3 text-amber-900 shadow-sm">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-900">Duplicate Report Identified</p>
                  <p className="text-xs text-amber-800 mt-1 font-medium">Similar to Report #{duplicateWarning.duplicateOfId} with {(duplicateWarning.confidence * 100).toFixed(0)}% match. {duplicateWarning.reason}</p>
                </div>
              </div>
            )}

            {/* No Waste Warning */}
            {verificationResult.wasteDetected === false && (
              <div className="bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-500 rounded-2xl p-5 mb-6 flex items-start gap-3 text-red-900 shadow-md">
                <AlertCircle className="h-7 w-7 text-red-600 mt-0.5 flex-shrink-0 animate-pulse" />
                <div>
                  <h4 className="text-base font-black text-red-900 uppercase tracking-tight">No Waste Detected in Image</h4>
                  <p className="text-xs font-bold text-red-800 mt-1">AI analysis found no waste in this image. Upload a clear photo containing actual waste.</p>
                  <p className="text-[11px] font-bold text-red-700 mt-2 bg-red-100 px-2.5 py-1 rounded-lg inline-block">🚫 Report Submission BLOCKED</p>
                </div>
              </div>
            )}

            {/* ── AI ANALYSIS SECTIONS ── */}
            <div className="space-y-4">

              {/* Section 1 & 2: Waste Detected Category + Waste Types */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white/80 p-3.5 rounded-xl border border-gray-100">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Waste Detected</p>
                  <p className="text-sm font-extrabold text-gray-800">{verificationResult.wasteCategory || 'Plastic & Mixed Recyclables'}</p>
                </div>
                <div className="bg-white/80 p-3.5 rounded-xl border border-gray-100">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Waste Types</p>
                  {Array.isArray(verificationResult.wasteTypes) && verificationResult.wasteTypes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      {verificationResult.wasteTypes.map((t: string, idx: number) => (
                        <span key={idx} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md text-[11px] font-semibold">{t}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-gray-500">—</p>
                  )}
                </div>
              </div>

              {/* Section 3 & 4: Confidence + Quantity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white/80 p-3.5 rounded-xl border border-gray-100">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1.5">AI Confidence</p>
                  <div className="flex justify-between text-xs font-bold text-gray-700 mb-1">
                    <span>Overall Visual Confidence</span>
                    <span className="text-green-600 font-extrabold">{verificationResult.confidence || verificationResult.aiConfidence}%</span>
                  </div>
                  <div className="w-full bg-gray-200/60 rounded-full h-2">
                    <div className="bg-gradient-to-r from-green-500 to-emerald-600 h-2 rounded-full transition-all duration-500" style={{ width: `${verificationResult.confidence || verificationResult.aiConfidence}%` }} />
                  </div>
                </div>
                <div className="bg-white/80 p-3.5 rounded-xl border border-gray-100">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Estimated Quantity</p>
                  <p className="text-xs font-extrabold text-gray-800">
                    {typeof verificationResult.estimatedQuantity === 'object'
                      ? verificationResult.estimatedQuantity.value
                      : (verificationResult.estimatedQuantity || '—')}
                  </p>
                </div>
              </div>

              {/* Section 5: Physical Size Estimation */}
              <div className="bg-white/80 p-4 rounded-xl border border-gray-100">
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-2">Physical Size Estimation</p>
                {verificationResult.dimensions?.lengthCm !== null && verificationResult.dimensions?.lengthCm !== undefined ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-3 text-xs font-semibold text-gray-700">
                      <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-100">Length: ~{verificationResult.dimensions.lengthCm} cm</span>
                      <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-100">Width: ~{verificationResult.dimensions.widthCm} cm</span>
                      <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-100">Height: ~{verificationResult.dimensions.heightCm} cm</span>
                    </div>
                    {hasScaleReference && (
                      <p className="text-[11px] text-green-700 font-medium bg-green-50 px-2.5 py-1 rounded-md inline-block">
                        Visual estimate based on available scale/reference information ({scaleReferenceType}).
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5 text-xs text-gray-600">
                    <p className="flex items-center gap-2"><span className="font-semibold text-gray-700">Length:</span> <span className="text-gray-500 italic">Not reliably measurable</span></p>
                    <p className="flex items-center gap-2"><span className="font-semibold text-gray-700">Width:</span> <span className="text-gray-500 italic">Not reliably measurable</span></p>
                    <p className="flex items-center gap-2"><span className="font-semibold text-gray-700">Height:</span> <span className="text-gray-500 italic">Not reliably measurable</span></p>
                    <div className="mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-500">
                      <strong className="text-gray-700">Why?</strong> No reliable visual scale reference was detected in the image.
                    </div>
                  </div>
                )}
              </div>

              {/* Section 6 & 7: Estimated Volume + Density */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white/80 p-3.5 rounded-xl border border-gray-100">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Estimated Volume</p>
                  {verificationResult.volume?.valueM3 !== null && verificationResult.volume?.valueM3 !== undefined ? (
                    <p className="text-sm font-extrabold text-gray-800">~{verificationResult.volume.valueM3} m³</p>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 italic">Not available</p>
                      <p className="text-[10px] text-gray-400 mt-1">Reason: Physical dimensions could not be reliably estimated from this image.</p>
                    </div>
                  )}
                </div>
                <div className="bg-white/80 p-3.5 rounded-xl border border-gray-100">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Density</p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    verificationResult.density?.class === 'High' ? 'bg-red-100 text-red-800'
                    : verificationResult.density?.class === 'Medium' ? 'bg-yellow-100 text-yellow-800'
                    : verificationResult.density?.class === 'Low' ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-700'
                  }`}>
                    {verificationResult.density?.class || verificationResult.densityClass || 'Cannot Determine'}
                  </span>
                </div>
              </div>

              {/* Section 8: Estimated Weight */}
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-4 rounded-xl border border-emerald-200">
                <p className="text-[10px] text-emerald-700 font-black uppercase tracking-widest mb-1">Estimated Weight</p>
                {verificationResult.weightRange?.minKg !== null && verificationResult.weightRange?.minKg !== undefined ? (
                  <p className="text-lg font-extrabold text-emerald-800">~{verificationResult.weightRange.minKg}–{verificationResult.weightRange.maxKg} kg</p>
                ) : (
                  <div>
                    <p className="text-sm font-bold text-emerald-900 italic">Not reliably estimable</p>
                    <p className="text-[11px] text-emerald-700 mt-1 font-medium">
                      Weight estimation requires reliable volume/density information or physical measurement.
                    </p>
                  </div>
                )}
              </div>

              {/* Section 9, 10, 11: Recyclability + Priority + Env Risk */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white/80 p-3.5 rounded-xl border border-gray-100">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Recyclability</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    (typeof verificationResult.recyclability === 'object' ? verificationResult.recyclability.status : verificationResult.recyclability || '').includes('Highly') ? 'bg-green-100 text-green-800'
                    : (typeof verificationResult.recyclability === 'object' ? verificationResult.recyclability.status : verificationResult.recyclability || '').includes('Mostly') ? 'bg-emerald-100 text-emerald-800'
                    : (typeof verificationResult.recyclability === 'object' ? verificationResult.recyclability.status : verificationResult.recyclability || '').includes('Partially') ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-800'
                  }`}>
                    {typeof verificationResult.recyclability === 'object' ? verificationResult.recyclability.status : (verificationResult.recyclability || '—')}
                  </span>
                </div>
                <div className="bg-white/80 p-3.5 rounded-xl border border-gray-100">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Priority</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    verificationResult.priorityLevel === 'Critical' ? 'bg-rose-100 text-rose-800 animate-pulse'
                    : verificationResult.priorityLevel === 'High' ? 'bg-red-100 text-red-800'
                    : verificationResult.priorityLevel === 'Medium' ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-blue-100 text-blue-800'
                  }`}>
                    {verificationResult.priorityLevel || verificationResult.priority || '—'}
                  </span>
                </div>
                <div className="bg-white/80 p-3.5 rounded-xl border border-gray-100">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Environmental Risk</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    verificationResult.environmentalRisk === 'Critical' ? 'bg-rose-100 text-rose-800'
                    : verificationResult.environmentalRisk === 'High' ? 'bg-red-100 text-red-800'
                    : verificationResult.environmentalRisk === 'Medium' ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-green-100 text-green-800'
                  }`}>
                    {verificationResult.environmentalRisk || '—'}
                  </span>
                </div>
              </div>

              {/* Section 12: AI Generated Description */}
              <div className="bg-white/80 p-4 rounded-xl border border-gray-100">
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1.5">AI Description</p>
                <p className="text-xs text-gray-700 leading-relaxed font-medium">"{verificationResult.generatedDescription || verificationResult.wasteDescription}"</p>
              </div>

              {/* Section 13: Recycling Recommendations */}
              {(Array.isArray(verificationResult.recyclingRecommendations) && verificationResult.recyclingRecommendations.length > 0) && (
                <div className="bg-white/80 p-4 rounded-xl border border-gray-100">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-2">Recycling Recommendations</p>
                  <ul className="space-y-1 text-xs text-gray-700 font-medium">
                    {verificationResult.recyclingRecommendations.map((rec: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-green-600 font-bold">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Section 14: Duplicate Check */}
              <div className="bg-white/80 p-3.5 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Duplicate Check</span>
                <span className={`font-bold px-2.5 py-0.5 rounded-full text-[11px] ${
                  duplicateWarning?.isDuplicate || verificationResult.duplicateCheck?.isPotentialDuplicate
                    ? 'bg-red-100 text-red-800 border border-red-200'
                    : 'bg-green-100 text-green-800 border border-green-200'
                }`}>
                  {duplicateWarning?.isDuplicate || verificationResult.duplicateCheck?.isPotentialDuplicate ? 'Potential Duplicate Identified' : 'No Potential Duplicate'}
                </span>
              </div>

              {/* Section 15: AI Summary */}
              {verificationResult.aiSummary && (
                <div className="bg-blue-50/70 border border-blue-100 p-4 rounded-xl">
                  <p className="text-[10px] text-blue-700 font-black uppercase tracking-widest mb-1">AI Summary</p>
                  <p className="text-xs text-blue-900 leading-relaxed font-medium">"{verificationResult.aiSummary}"</p>
                </div>
              )}

              {/* Section 16: Important Notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-900 font-medium leading-relaxed">
                  <strong>Important Notice —</strong> {verificationResult.measurementWarning || "AI visual analysis is an estimate based on the uploaded image. Actual weight and physical dimensions require field measurement."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Location + Fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-semibold text-gray-700">Reported Waste Address</label>
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold px-2.5 py-1 rounded-lg border border-blue-200 flex items-center gap-1 transition-colors"
              >
                <Navigation className="w-3 h-3 text-blue-600" />
                Use My Current GPS
              </button>
            </div>
            {isLoaded ? (
              <StandaloneSearchBox onLoad={onLoad} onPlacesChanged={onPlacesChanged}>
                <input
                  id="location-input"
                  type="text"
                  name="location"
                  value={newReport.location}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 text-sm shadow-sm"
                  placeholder="Enter or search reported waste address..."
                />
              </StandaloneSearchBox>
            ) : (
              <input
                id="location-input"
                type="text"
                name="location"
                value={newReport.location}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 text-sm shadow-sm"
                placeholder="Enter or search reported waste address..."
              />
            )}
            {locationGps.lat && (
              <div className="mt-2 flex items-center gap-2 text-xs text-green-600">
                <Navigation className="w-3 h-3" />
                <span>GPS captured: {locationGps.lat.toFixed(5)}, {locationGps.lng?.toFixed(5)}</span>
                {locationGps.wardNumber && <span className="ml-1 font-semibold">· Ward {locationGps.wardNumber}</span>}
              </div>
            )}
          </div>

          {/* GPS Coordinates — shows coordinates auto-filled from GPS */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">GPS Location (Auto-filled)</label>
            <input
              type="text"
              name="gpsCoordinates"
              value={locationGps.lat ? `${locationGps.lat.toFixed(5)}, ${locationGps.lng?.toFixed(5)}` : ''}
              readOnly
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm text-gray-600 shadow-sm"
              placeholder="Auto-filled when GPS is captured"
            />
            {locationGps.lat && locationGps.wardNumber && (
              <p className="mt-1 text-[11px] text-gray-400 font-mono">
                · Ward {locationGps.wardNumber}
              </p>
            )}
          </div>

          {/* Waste Type — auto-filled by AI */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Waste Type <span className="text-[11px] text-blue-500 font-normal">(Auto-filled by AI)</span></label>
            <input
              type="text"
              name="type"
              value={newReport.type}
              onChange={handleInputChange}
              required
              readOnly
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm text-gray-600 shadow-sm"
              placeholder="Analyze image first to auto-fill"
            />
          </div>

          {/* Ward Number — auto-filled by GPS/Map */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Ward Number <span className="text-[11px] text-blue-500 font-normal">(Auto-filled by GPS)</span></label>
            <input
              type="text"
              name="ward"
              value={locationGps.wardNumber || ''}
              readOnly
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm text-gray-600 shadow-sm"
              placeholder="Auto-filled by Map/GPS"
            />
          </div>
        </div>

        <Button
          type="submit"
          className={`w-full py-3.5 text-sm font-extrabold rounded-xl text-white transition-all flex items-center justify-center gap-2 shadow-md ${
            verificationResult?.wasteDetected === false || duplicateWarning?.isDuplicate
              ? 'bg-red-300 text-red-900 border border-red-400 cursor-not-allowed opacity-80'
              : 'bg-green-600 hover:bg-green-700'
          }`}
          disabled={isSubmitting || verificationStatus !== 'success' || duplicateWarning?.isDuplicate || verificationResult?.wasteDetected === false}
        >
          {isSubmitting ? (
            <><Loader className="animate-spin h-4 w-4" /> Submitting Report...</>
          ) : verificationResult?.wasteDetected === false ? (
            <>🚫 Submit Blocked: No Waste Detected</>
          ) : duplicateWarning?.isDuplicate ? (
            <>🚫 Submit Blocked: Duplicate Image</>
          ) : (
            <><MapPin className="h-4 w-4" /> Submit Waste Report (+20 Points)</>
          )}
        </Button>
      </form>

      {/* Recent Reports */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Reports</h2>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0 border-b border-gray-100">
              <tr>
                {['Reported Address', 'Type', 'AI Estimated Amount', 'Date', 'AI Confidence', 'Priority'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {reports.map(report => (
                <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-600">
                    <MapPin className="inline w-3 h-3 mr-1 text-green-500" />
                    {report.location}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{report.wasteType}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{report.amount}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{report.createdAt}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{report.confidence ? `${report.confidence}%` : 'N/A'}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                      report.priority === 'Critical' ? 'bg-rose-100 text-rose-800' :
                      report.priority === 'High' ? 'bg-red-100 text-red-800' :
                      report.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {report.priority || 'Medium'}
                    </span>
                  </td>
                </tr>
              ))}
              {reports.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400 text-sm">No reports yet. Be the first to report!</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}