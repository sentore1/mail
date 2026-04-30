"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../supabase/client";

export default function DebugAIPage() {
  const [status, setStatus] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAI() {
      const supabase = createClient();
      const result: any = {};

      // 1. Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      result.user = user ? {
        id: user.id,
        email: user.email
      } : null;
      result.userError = userError?.message;

      // 2. Try to fetch AI provider
      const { data: aiProvider, error: aiError } = await supabase
        .from("ai_providers")
        .select("*")
        .eq("is_active", true)
        .single();

      result.aiProvider = aiProvider;
      result.aiError = aiError?.message;

      // 3. Try to fetch all AI providers (will fail if RLS blocks)
      const { data: allProviders, error: allError } = await supabase
        .from("ai_providers")
        .select("*");

      result.allProviders = allProviders;
      result.allError = allError?.message;

      setStatus(result);
      setLoading(false);
    }

    checkAI();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Checking AI Provider...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">AI Provider Debug Info</h1>

        <div className="space-y-6">
          {/* Current User */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-3">Current User</h2>
            {status.user ? (
              <div className="space-y-2">
                <p><strong>User ID:</strong> <code className="bg-gray-100 px-2 py-1 rounded">{status.user.id}</code></p>
                <p><strong>Email:</strong> {status.user.email}</p>
              </div>
            ) : (
              <p className="text-red-600">❌ No user logged in</p>
            )}
            {status.userError && (
              <p className="text-red-600 mt-2">Error: {status.userError}</p>
            )}
          </div>

          {/* AI Provider for Current User */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-3">AI Provider (Current User)</h2>
            {status.aiProvider ? (
              <div className="space-y-2">
                <p><strong>Provider:</strong> {status.aiProvider.provider}</p>
                <p><strong>Model:</strong> {status.aiProvider.model_name}</p>
                <p><strong>Active:</strong> {status.aiProvider.is_active ? '✅ Yes' : '❌ No'}</p>
                <p><strong>API Key:</strong> {status.aiProvider.api_key.substring(0, 10)}...</p>
                <p><strong>User ID:</strong> <code className="bg-gray-100 px-2 py-1 rounded">{status.aiProvider.user_id}</code></p>
              </div>
            ) : (
              <div>
                <p className="text-red-600">❌ No AI provider found for this user</p>
                {status.aiError && (
                  <p className="text-sm text-gray-600 mt-2">Error: {status.aiError}</p>
                )}
              </div>
            )}
          </div>

          {/* All AI Providers */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-3">All AI Providers (RLS Test)</h2>
            {status.allProviders && status.allProviders.length > 0 ? (
              <div className="space-y-4">
                {status.allProviders.map((p: any, i: number) => (
                  <div key={i} className="border-l-4 border-blue-500 pl-4">
                    <p><strong>Provider:</strong> {p.provider}</p>
                    <p><strong>User ID:</strong> <code className="bg-gray-100 px-2 py-1 rounded text-xs">{p.user_id}</code></p>
                    <p><strong>Active:</strong> {p.is_active ? '✅' : '❌'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <p className="text-yellow-600">⚠️ No providers visible (RLS is working)</p>
                {status.allError && (
                  <p className="text-sm text-gray-600 mt-2">Error: {status.allError}</p>
                )}
              </div>
            )}
          </div>

          {/* Diagnosis */}
          <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-3">Diagnosis</h2>
            {!status.user ? (
              <p className="text-red-600">❌ You need to log in first</p>
            ) : !status.aiProvider ? (
              <div className="space-y-2">
                <p className="text-red-600">❌ No AI provider configured for your user</p>
                <p className="text-sm mt-4">Run this SQL in Supabase:</p>
                <pre className="bg-gray-800 text-white p-4 rounded mt-2 overflow-x-auto text-xs">
{`INSERT INTO public.ai_providers (
  user_id, provider, api_key, model_name, is_active
) VALUES (
  '${status.user.id}'::uuid,
  'groq',
  'YOUR_GROQ_API_KEY_HERE',
  'llama-3.3-70b-versatile',
  true
)
ON CONFLICT (user_id, provider) DO UPDATE
SET is_active = true, api_key = EXCLUDED.api_key;`}
                </pre>
              </div>
            ) : (
              <p className="text-green-600">✅ Everything looks good! AI should work.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
