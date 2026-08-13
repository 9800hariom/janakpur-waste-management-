"use client";

import React, { useEffect, useState } from 'react';
import { Sparkles, BrainCircuit, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import { generatePredictiveSummary } from '@/utils/aiAnalyticsActions';

interface PredictiveAnalyticsProps {
  analyticsData: any;
}

export function PredictiveAnalytics({ analyticsData }: PredictiveAnalyticsProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSummary() {
      if (!analyticsData) return;
      setLoading(true);
      try {
        const result = await generatePredictiveSummary(analyticsData);
        setSummary(result);
      } catch (error) {
        console.error("Error fetching predictive summary:", error);
        setSummary("AI prediction models are currently calibrating. Please try again later.");
      } finally {
        setLoading(false);
      }
    }
    fetchSummary();
  }, [analyticsData]);

  // Quick markdown formatter for the bullet points
  const formatMarkdown = (text: string) => {
    return text.split('\n').map((line, idx) => {
      let content = line;
      let isBullet = false;
      
      if (content.trim().startsWith('- ') || content.trim().startsWith('* ')) {
        content = content.trim().substring(2);
        isBullet = true;
      }
      
      // Handle bold
      const parts = content.split(/(\*\*.*?\*\*)/g);
      const formattedContent = parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      });

      if (isBullet) {
        return (
          <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            <span>{formattedContent}</span>
          </li>
        );
      }
      
      if (content.trim() === '') return null;
      return <p key={idx} className="text-sm text-gray-700 mb-2">{formattedContent}</p>;
    });
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 via-white to-blue-50 rounded-2xl p-6 border border-indigo-100 shadow-sm relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 -mr-8 -mt-8 opacity-10">
        <BrainCircuit className="w-48 h-48 text-indigo-600" />
      </div>

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">AI Predictive Insights</h3>
            <p className="text-xs text-gray-500">Forecasting & automated analysis</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 text-indigo-600 bg-white/50 p-4 rounded-xl border border-indigo-50/50">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">Generating real-time forecast...</span>
          </div>
        ) : (
          <ul className="space-y-3 bg-white/60 p-4 rounded-xl border border-white backdrop-blur-sm">
            {summary ? formatMarkdown(summary) : (
              <li className="flex items-center gap-2 text-sm text-gray-500">
                <AlertCircle className="w-4 h-4" /> No data available for predictions.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
