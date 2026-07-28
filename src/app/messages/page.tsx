'use client'
import { useState, useEffect, useRef } from 'react'
import { callGemini } from '@/utils/geminiHelper'
import { Send, Loader2, Bot, User, Sparkles, MessageSquare, ArrowRight, Trash2 } from 'lucide-react'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  "Where should I dispose of batteries?",
  "How can I earn rewards for waste collection?",
  "Which plastic types are recyclable?",
  "What is the environmental impact of 15kg of plastic?"
]

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello! I am your Smart Janakpur Waste Management AI Assistant. Ask me anything about waste management, recycling suggestions, or how to dispose of specific items safely!"
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return

    setIsLoading(true)
    setError('')

    const newMessage: Message = { role: 'user', content: textToSend.trim() }
    setMessages(prev => [...prev, newMessage])
    setInput('')

    try {
      const systemPrefix = "You are Smart Janakpur Waste Management AI, a friendly and encouraging waste management and recycling expert. Answer waste disposal questions, give recyclability advice, and explain the positive environmental impacts of recycling. Keep responses concise, clear, and action-oriented.\n\nUser question: "

      const responseText = await callGemini(systemPrefix + textToSend.trim())

      const assistantMessage: Message = { role: 'assistant', content: responseText }
      setMessages(prev => [...prev, assistantMessage])
    } catch (err) {
      console.error('Error:', err)
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSendMessage(input)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-50">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-700 text-white p-4 shadow-md flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-white bg-opacity-20 rounded-xl">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight flex items-center">
              Smart Janakpur Waste Management AI Assistant
              <Sparkles className="w-4 h-4 ml-1.5 text-yellow-300 fill-yellow-300 animate-pulse" />
            </h1>
            <p className="text-xs text-green-100">Your recycling & waste management companion</p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex items-start space-x-2.5 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                <div className={`p-2 rounded-full flex-shrink-0 ${
                  msg.role === 'user' ? 'bg-green-600 text-white' : 'bg-white border border-gray-200 text-green-600 shadow-sm'
                }`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                
                <div className={`rounded-2xl p-4 shadow-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-green-600 text-white font-medium rounded-tr-none' 
                    : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                }`}>
                  <p className="text-sm whitespace-pre-line">{msg.content}</p>
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-start space-x-2.5 max-w-[85%]">
                <div className="p-2 rounded-full bg-white border border-gray-200 text-green-600 shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center space-x-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin text-green-500" />
                  <span className="text-sm">Smart Janakpur Waste Management AI is thinking...</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl text-center max-w-xl mx-auto shadow-sm">
              <p className="font-semibold">Oops! Something went wrong</p>
              <p className="text-xs mt-1">{error}</p>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Suggestion Chips */}
      {messages.length === 1 && (
        <div className="px-4 py-2 bg-gray-50">
          <div className="max-w-3xl mx-auto">
            <p className="text-xs text-gray-400 mb-2 font-medium">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(s)}
                  className="bg-white hover:bg-green-50 hover:text-green-700 text-gray-600 text-xs px-3.5 py-2 rounded-full border border-gray-200 transition-all duration-200 font-medium flex items-center shadow-sm"
                >
                  {s}
                  <ArrowRight className="w-3.5 h-3.5 ml-1 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-200">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex items-center space-x-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about recycling or disposal..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 text-sm shadow-sm bg-gray-50 focus:bg-white"
            disabled={isLoading}
          />
          <button 
            type="submit" 
            className="px-5 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-200 disabled:opacity-50 shadow-md font-semibold flex items-center justify-center space-x-1.5"
            disabled={isLoading || !input.trim()}
          >
            <span>Send</span>
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  )
}