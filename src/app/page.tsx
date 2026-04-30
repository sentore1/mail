import { redirect } from "next/navigation";
import { createClient } from "../../supabase/server";
import Link from "next/link";
import { Radio, Mail, Layout, Settings, Zap, ArrowRight } from "lucide-react";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-3xl mx-auto">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-12">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
            <Zap size={20} className="text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">
            OUTREACH
          </span>
        </div>

        {/* Hero */}
        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
          Cold Outreach,
          <br />
          <span className="text-blue-600">Automated & Sharp</span>
        </h1>
        
        <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
          Scrape leads, write AI-powered cold emails, and manage your pipeline — all in one platform built for operators who move fast.
        </p>

        {/* Feature pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
          {[
            { icon: Radio, label: "Lead Scraper" },
            { icon: Mail, label: "AI Email Writer" },
            { icon: Layout, label: "CRM Pipeline" },
            { icon: Settings, label: "AI Settings" },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.label}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100"
              >
                <Icon size={14} className="text-blue-600" />
                <span className="text-sm text-gray-700">
                  {f.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/sign-up"
            className="flex items-center gap-2 px-8 py-3.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
          >
            Get Started Free
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/sign-in"
            className="flex items-center gap-2 px-8 py-3.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Sign In
          </Link>
        </div>

        {/* Built on strip */}
        <p className="mt-16 text-xs text-gray-400 tracking-wider">
          POWERED BY SUPABASE · GROQ · AI-NATIVE
        </p>
      </div>
    </div>
  );
}
