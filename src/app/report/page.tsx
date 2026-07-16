'use client'
import { useState, useCallback, useEffect } from 'react'
import { MapPin, Upload, CheckCircle, Loader, Sparkles, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GoogleGenerativeAI } from "@google/generative-ai";
import { StandaloneSearchBox, useJsApiLoader } from '@react-google-maps/api'
import { Libraries } from '@react-google-maps/api';
import { createUser, getUserByEmail, createReport, getRecentReports } from '@/utils/db/actions';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast'
import { useSession } from "next-auth/react"

const geminiApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const libraries: Libraries = ['places'];

export default function ReportPage() {
  const [user, setUser] = useState<{ id: number; email: string; name: string } | null>(null);
  const router = useRouter();

  const [reports, setReports] = useState<Array<{
    id: number;
    location: string;
    wasteType: string;
    amount: string;
    createdAt: string;
  }>>([]);

  const [newReport, setNewReport] = useState({
    location: '',
    type: '',
    amount: '',
  })

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'failure'>('idle')
  const [verificationResult, setVerificationResult] = useState<{
    wasteType: string;
    estimatedWeight: string;
    estimatedQuantity: string;
    recyclable: boolean;
    recyclingSuggestions: string;
    wasteDescription: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    confidence: number;
  } | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{
    isDuplicate: boolean;
    duplicateOfId: number | null;
    confidence: number;
    reason: string;
  } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [searchBox, setSearchBox] = useState<google.maps.places.SearchBox | null>(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: googleMapsApiKey!,
    libraries: libraries
  });

  const onLoad = useCallback((ref: google.maps.places.SearchBox) => {
    setSearchBox(ref);
  }, []);

  const onPlacesChanged = () => {
    if (searchBox) {
      const places = searchBox.getPlaces();
      if (places && places.length > 0) {
        const place = places[0];
        setNewReport(prev => ({
          ...prev,
          location: place.formatted_address || '',
        }));
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setNewReport({ ...newReport, [name]: value })
  }

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

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const checkDuplicateReport = async (newImageBase64: string, newLocation: string) => {
    try {
      if (!geminiApiKey) {
        return {
          isDuplicate: false,
          duplicateOfId: null,
          confidence: 0,
          reason: "Gemini API key is missing. Duplicate check bypassed."
        };
      }

      const recentReports = await getRecentReports();
      const candidateReports = recentReports
        .filter(r => r.imageUrl && r.location && (r.status === 'pending' || r.status === 'in_progress'))
        .slice(0, 3);

      if (candidateReports.length === 0) return null;

      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

      const newImagePart = {
        inlineData: {
          data: newImageBase64,
          mimeType: "image/jpeg"
        }
      };

      const imageParts = [newImagePart];
      const candidatesInfo = [];

      for (let i = 0; i < candidateReports.length; i++) {
        const report = candidateReports[i];
        if (report.imageUrl && report.imageUrl.startsWith('data:image')) {
          const base64Data = report.imageUrl.split(',')[1];
          const mimeType = report.imageUrl.split(';')[0].split(':')[1];
          imageParts.push({
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          });
          candidatesInfo.push({
            index: candidatesInfo.length + 1,
            id: report.id,
            location: report.location,
            wasteType: report.wasteType,
            amount: report.amount
          });
        }
      }

      if (imageParts.length <= 1) return null;

      const prompt = `You are a waste management AI. You are comparing a newly uploaded waste report (Image 1) with existing reports to check if it's a duplicate of the same pile of waste.

New Report Location: "${newLocation}"

Here are the existing reports:
${candidatesInfo.map(c => `Image ${c.index + 1}: Report #${c.id} - Location: "${c.location}", Type: ${c.wasteType}, Quantity: ${c.amount}`).join('\n')}

Compare Image 1 (new report) with the other images. Determine if the new report is a duplicate of any existing report. A duplicate means it is the exact same pile/location of waste, potentially from a slightly different angle or distance.
Note that the locations do not have to be letter-for-letter identical if they refer to the same physical spot or landmark.

Respond in JSON format like this:
{
  "isDuplicate": true/false,
  "duplicateOfId": number or null,
  "confidence": number between 0 and 1,
  "reason": "brief explanation of why it is or isn't a duplicate"
}`;

      const result = await model.generateContent([prompt, ...imageParts]);
      const response = await result.response;
      const text = response.text();
      const jsonText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonText);
      return parsed;
    } catch (error) {
      console.error("Error in duplicate detection:", error);
      return null;
    }
  };

  const handleVerify = async () => {
    if (!file) return

    setVerificationStatus('verifying')

    try {
      if (!geminiApiKey) {
        console.error("Gemini API key is missing.");
        setVerificationStatus('failure');
        toast.error("No data fetched or no result returned from the AI API. Missing API key.");
        return;
      }

      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

      const base64Data = await readFileAsBase64(file);

      const imageParts = [
        {
          inlineData: {
            data: base64Data.split(',')[1],
            mimeType: file.type,
          },
        },
      ];

      const prompt = `You are an expert in waste management and recycling. Analyze this image and provide:
        1. Waste classification: Identify the category (e.g., Plastic, Paper, Glass, Organic, Metal, E-waste, Hazardous, Medical Waste)
        2. Weight estimation: Estimate the weight of the waste in KG (e.g., "3.4 kg")
        3. Quantity estimation: Estimate the quantity (e.g., "25 Plastic Bottles", "3 Cardboard Boxes")
        4. Recyclability detection: Is it recyclable? (true or false)
        5. Recycling suggestions: Give advice on how to recycle or dispose of it.
        6. Waste description: Generate a detailed, creative description of the waste (e.g. "A pile of plastic bottles and food packaging is scattered near the roadside. Approximately 3 kilograms of recyclable waste.")
        7. Report Priority: Determine the priority based on waste hazard or obstruction (LOW, MEDIUM, HIGH)
        8. Confidence level: Your confidence level (as a float between 0 and 1)
        
        Respond in JSON format like this:
        {
          "wasteType": "Waste classification category",
          "estimatedWeight": "weight estimate with unit",
          "estimatedQuantity": "quantity estimate",
          "recyclable": true/false,
          "recyclingSuggestions": "how to recycle/dispose",
          "wasteDescription": "detailed generated description",
          "priority": "LOW" | "MEDIUM" | "HIGH",
          "confidence": confidence as a number between 0 and 1
        }`;

      const result = await model.generateContent([prompt, ...imageParts]);
      const response = await result.response;
      const text = response.text();

      try {
        const jsonText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedResult = JSON.parse(jsonText);
        
        if (parsedResult.wasteType && parsedResult.confidence) {
          const formattedResult = {
            wasteType: parsedResult.wasteType,
            estimatedWeight: parsedResult.estimatedWeight || "1.0 kg",
            estimatedQuantity: parsedResult.estimatedQuantity || "multiple items",
            recyclable: parsedResult.recyclable !== undefined ? parsedResult.recyclable : true,
            recyclingSuggestions: parsedResult.recyclingSuggestions || "Dispose properly.",
            wasteDescription: parsedResult.wasteDescription || "Waste detected.",
            priority: (parsedResult.priority || "LOW") as 'LOW' | 'MEDIUM' | 'HIGH',
            confidence: parsedResult.confidence
          };
          
          setVerificationResult(formattedResult);
          
          setNewReport({
            ...newReport,
            type: formattedResult.wasteType,
            amount: formattedResult.estimatedWeight
          });

          // Run duplicate detection
          try {
            const rawBase64 = base64Data.split(',')[1];
            const duplicateResult = await checkDuplicateReport(rawBase64, newReport.location);
            if (duplicateResult && duplicateResult.isDuplicate && duplicateResult.confidence > 0.8) {
              setDuplicateWarning(duplicateResult);
              toast.error(`Potential duplicate report detected (Confidence: ${(duplicateResult.confidence * 100).toFixed(0)}%)!`);
            } else {
              setDuplicateWarning(null);
            }
          } catch (dupError) {
            console.error("Duplicate check failed:", dupError);
          }

          setVerificationStatus('success');
        } else {
          console.error('Invalid verification result:', parsedResult);
          setVerificationStatus('failure');
        }
      } catch (error) {
        console.error('Failed to parse JSON response:', text);
        setVerificationStatus('failure');
      }
    } catch (error) {
      console.error('Error verifying waste:', error);
      setVerificationStatus('failure');
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationStatus !== 'success' || !user) {
      toast.error('Please verify the waste before submitting or log in.');
      return;
    }

    setIsSubmitting(true);
    try {
      const report = await createReport(
        user.id,
        newReport.location,
        newReport.type,
        newReport.amount,
        preview || undefined,
        verificationResult || undefined
      ) as any;

      const formattedReport = {
        id: report.id,
        location: report.location,
        wasteType: report.wasteType,
        amount: report.amount,
        createdAt: report.createdAt.toISOString().split('T')[0]
      };

      setReports([formattedReport, ...reports]);
      setNewReport({ location: '', type: '', amount: '' });
      setFile(null);
      setPreview(null);
      setVerificationStatus('idle');
      setVerificationResult(null);
      setDuplicateWarning(null);

      toast.success(`Report submitted successfully! You've earned points for reporting waste.`);
    } catch (error) {
      console.error('Error submitting report:', error);
      toast.error('Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const { data: session, status } = useSession();

  useEffect(() => {
    const checkUser = async () => {
      if (status === "authenticated" && session?.user?.email) {
        let user = await getUserByEmail(session.user.email);
        if (!user) {
          user = await createUser(session.user.email, session.user.name || 'Anonymous User');
        }
        setUser(user);

        const recentReports = await getRecentReports();
        const formattedReports = recentReports.map(report => ({
          ...report,
          createdAt: report.createdAt.toISOString().split('T')[0]
        }));
        setReports(formattedReports);
      } else if (status === "unauthenticated") {
        router.push('/login');
      }
    };
    checkUser();
  }, [status, session, router]);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold mb-6 text-gray-800">Report waste</h1>

      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-lg mb-12">
        <div className="mb-8">
          <label htmlFor="waste-image" className="block text-lg font-medium text-gray-700 mb-2">
            Upload Waste Image
          </label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:border-green-500 transition-colors duration-300">
            <div className="space-y-1 text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <div className="flex text-sm text-gray-600">
                <label
                  htmlFor="waste-image"
                  className="relative cursor-pointer bg-white rounded-md font-medium text-green-600 hover:text-green-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-green-500"
                >
                  <span>Upload a file</span>
                  <input id="waste-image" name="waste-image" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
            </div>
          </div>
        </div>

        {preview && (
          <div className="mt-4 mb-8">
            <img src={preview} alt="Waste preview" className="max-w-full h-auto rounded-xl shadow-md" />
          </div>
        )}

        <Button
          type="button"
          onClick={handleVerify}
          className="w-full mb-8 bg-blue-600 hover:bg-blue-700 text-white py-3 text-lg rounded-xl transition-colors duration-300"
          disabled={!file || verificationStatus === 'verifying'}
        >
          {verificationStatus === 'verifying' ? (
            <>
              <Loader className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
              Verifying...
            </>
          ) : 'Verify Waste'}
        </Button>

        {verificationStatus === 'failure' && (
          <div className="mt-4 mb-8 bg-red-50 border border-red-200 p-4 rounded-xl text-red-800">
            <p className="text-sm font-bold">Verification Failed</p>
            <p className="text-xs mt-1">No data fetched or no result returned from the AI API. Please configure a valid Gemini API key and try again.</p>
          </div>
        )}

        {verificationStatus === 'success' && verificationResult && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 p-6 mb-8 rounded-2xl shadow-md transition-all duration-300">
            <div className="flex items-center mb-4">
              <CheckCircle className="h-6 w-6 text-green-600 mr-3 animate-pulse" />
              <h3 className="text-xl font-semibold text-green-900">AI Analysis Report</h3>
            </div>
            
            {duplicateWarning && duplicateWarning.isDuplicate && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start text-amber-800">
                <AlertTriangle className="h-6 w-6 text-amber-600 mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-amber-900">Potential Duplicate Detected</h4>
                  <p className="text-sm mt-1">This report is highly similar to <strong>Report #{duplicateWarning.duplicateOfId}</strong> (Similarity: {(duplicateWarning.confidence * 100).toFixed(0)}%).</p>
                  <p className="text-xs text-amber-700 mt-1 italic">Reason: {duplicateWarning.reason}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Waste Category</p>
                <p className="text-lg font-bold text-gray-800 mt-1 flex items-center">
                  <span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-2"></span>
                  {verificationResult.wasteType}
                </p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Confidence Level</p>
                <p className="text-lg font-bold text-gray-800 mt-1">
                  {(verificationResult.confidence * 100).toFixed(1)}%
                </p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Estimated Weight</p>
                <p className="text-lg font-bold text-gray-800 mt-1">{verificationResult.estimatedWeight}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Estimated Quantity</p>
                <p className="text-lg font-bold text-gray-800 mt-1">{verificationResult.estimatedQuantity}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm col-span-1 md:col-span-2">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Generated Description</p>
                <p className="text-sm text-gray-700 mt-2 italic leading-relaxed">"{verificationResult.wasteDescription}"</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Recyclable</p>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold mt-2 ${
                  verificationResult.recyclable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {verificationResult.recyclable ? '✔ Yes, Recyclable' : '✘ No, Hazardous / Trash'}
                </span>
              </div>
              <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Priority Level</p>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold mt-2 ${
                  verificationResult.priority === 'HIGH' ? 'bg-red-100 text-red-800' : 
                  verificationResult.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {verificationResult.priority}
                </span>
              </div>
              <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm col-span-1 md:col-span-2">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Recycling Recommendations</p>
                <p className="text-sm text-gray-700 mt-2 leading-relaxed">{verificationResult.recyclingSuggestions}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            {isLoaded ? (
              <StandaloneSearchBox
                onLoad={onLoad}
                onPlacesChanged={onPlacesChanged}
              >
                <input
                  type="text"
                  id="location"
                  name="location"
                  value={newReport.location}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300"
                  placeholder="Enter waste location"
                />
              </StandaloneSearchBox>
            ) : (
              <input
                type="text"
                id="location"
                name="location"
                value={newReport.location}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300"
                placeholder="Enter waste location"
              />
            )}
          </div>
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">Waste Type</label>
            <input
              type="text"
              id="type"
              name="type"
              value={newReport.type}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300 bg-gray-100"
              placeholder="Verified waste type"
              readOnly
            />
          </div>
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">Estimated Amount</label>
            <input
              type="text"
              id="amount"
              name="amount"
              value={newReport.amount}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300 bg-gray-100"
              placeholder="Verified amount"
              readOnly
            />
          </div>
        </div>
        <Button
          type="submit"
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 text-lg rounded-xl transition-colors duration-300 flex items-center justify-center"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
              Submitting...
            </>
          ) : 'Submit Report'}
        </Button>
      </form>

      <h2 className="text-3xl font-semibold mb-6 text-gray-800">Recent Reports</h2>
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-gray-50 transition-colors duration-200">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <MapPin className="inline-block w-4 h-4 mr-2 text-green-500" />
                    {report.location}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.wasteType}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.amount}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}