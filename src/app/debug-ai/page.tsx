"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../supabase/client";

export default function DebugAIPage() {
  const [status, setStatus] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

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

      // 2. Try to fetch AI provider from ai_settings
      const { data: aiProvider, error: aiError } = await supabase
        .from("ai_settings")
        .select("*")
        .eq("is_active", true)
        .single();

      result.aiProvider = aiProvider;
      result.aiError = aiError?.message;

      // 3. Try to fetch all AI providers (will fail if RLS blocks)
      const { data: allProviders, error: allError } = await supabase
        .from("ai_settings")
        .select("*");

      result.allProviders = allProviders;
      result.allError = allError?.message;

      setStatus(result);
      setLoading(false);
    }

    checkAI();
  }, []);

  async function testGroqAPI() {
    setTesting(true);
    setTestResult(null);
    
    try {
      if (!status.user?.id) {
        setTestResult({ error: "No user logged in" });
        return;
      }

      // Fetch AI provider via API route
      const providerResponse = await fetch(`/api/ai-provider?userId=${status.user.id}`);
      
      if (!providerResponse.ok) {
        const error = await providerResponse.json();
        setTestResult({ error: "Failed to fetch AI provider", details: error });
        return;
      }
      
      const aiProvider = await providerResponse.json();
      
      // Test Groq API directly
      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${aiProvider.api_key}`
        },
        body: JSON.stringify({
          model: aiProvider.active_model || "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: "Say 'Hello! API is working!' in one sentence." }
          ],
          temperature: 0.7,
          max_tokens: 50
        })
      });
      
      if (!groqResponse.ok) {
        let errorText = '';
        let errorJson = null;
        
        try {
          errorText = await groqResponse.text();
          errorJson = JSON.parse(errorText);
        } catch (e) {
          // If parsing fails, use the text as-is
        }
        
        setTestResult({
          error: "Groq API Error",
          status: groqResponse.status,
          statusText: groqResponse.statusText,
          errorText,
          errorJson,
          headers: Object.fromEntries(groqResponse.headers.entries())
        });
        return;
      }
      
      const data = await groqResponse.json();
      setTestResult({
        success: true,
        response: data.choices[0].message.content,
        model: data.model,
        usage: data.usage
      });
      
    } catch (error: any) {
      setTestResult({ error: "Unexpected error", message: error.message });
    } finally {
      setTesting(false);
    }
  }

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
                <p><strong>Model:</strong> {status.aiProvider.active_model}</p>
                <p><strong>Active:</strong> {status.aiProvider.is_active ? '✅ Yes' : '❌ No'}</p>
                <p><strong>API Key:</strong> {status.aiProvider.api_key ? `${status.aiProvider.api_key.substring(0, 10)}...` : '❌ Missing'}</p>
                <p><strong>User ID:</strong> <code className="bg-gray-100 px-2 py-1 rounded">{status.aiProvider.user_id}</code></p>
                
                <div className="mt-4">
                  <button
                    onClick={testGroqAPI}
                    disabled={testing}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {testing ? 'Testing...' : 'Test Groq API'}
                  </button>
                </div>
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

          {/* Test Result */}
          {testResult && (
            <div className={`p-6 rounded-lg shadow ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <h2 className="text-xl font-semibold mb-3">API Test Result</h2>
              {testResult.success ? (
                <div className="space-y-2">
                  <p className="text-green-600 font-semibold">✅ Success!</p>
                  <p><strong>Response:</strong> {testResult.response}</p>
                  <p><strong>Model:</strong> {testResult.model}</p>
                  <p><strong>Tokens Used:</strong> {testResult.usage?.total_tokens}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-red-600 font-semibold">❌ Error</p>
                  {testResult.status && <p><strong>Status:</strong> {testResult.status} {testResult.statusText}</p>}
                  {testResult.errorJson && (
                    <div>
                      <p><strong>Error Message:</strong></p>
                      <pre className="bg-gray-800 text-white p-4 rounded mt-2 overflow-x-auto text-xs">
                        {JSON.stringify(testResult.errorJson, null, 2)}
                      </pre>
                    </div>
                  )}
                  {testResult.errorText && !testResult.errorJson && (
                    <div>
                      <p><strong>Error Text:</strong></p>
                      <pre className="bg-gray-800 text-white p-4 rounded mt-2 overflow-x-auto text-xs">
                        {testResult.errorText}
                      </pre>
                    </div>
                  )}
                  {testResult.message && <p><strong>Message:</strong> {testResult.message}</p>}
                  {testResult.details && (
                    <div>
                      <p><strong>Details:</strong></p>
                      <pre className="bg-gray-800 text-white p-4 rounded mt-2 overflow-x-auto text-xs">
                        {JSON.stringify(testResult.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

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
{`INSERT INTO public.ai_settings (
  user_id, provider, api_key, active_model, is_active
) VALUES (
  '${status.user.id}'::uuid,
  'groq',
  'YOUR_GROQ_API_KEY_HERE',
  'llama-3.3-70b-versatile',
  true
)
ON CONFLICT (user_id, provider) DO UPDATE
SET is_active = true, api_key = EXCLUDED.api_key, active_model = EXCLUDED.active_model;`}
                </pre>
                <p className="text-sm mt-4 text-gray-600">
                  Get your Groq API key from: <a href="https://console.groq.com/keys" target="_blank" className="text-blue-600 underline">https://console.groq.com/keys</a>
                </p>
              </div>
            ) : !status.aiProvider.api_key ? (
              <p className="text-red-600">❌ API key is missing in your AI settings</p>
            ) : (
              <div className="space-y-2">
                <p className="text-green-600">✅ Configuration looks good!</p>
                <p className="text-sm text-gray-600">Click "Test Groq API" above to verify the API key works.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
