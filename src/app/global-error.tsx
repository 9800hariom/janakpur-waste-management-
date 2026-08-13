'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Error</h2>
        <p className="text-sm text-gray-500 mb-6">
          {error.message || 'A critical error occurred.'}
        </p>
        <button
          onClick={() => reset()}
          className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-2 rounded-xl"
        >
          Reset Application
        </button>
      </body>
    </html>
  )
}
