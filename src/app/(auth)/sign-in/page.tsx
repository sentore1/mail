import { signInAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Zap } from "lucide-react";

interface LoginProps {
  searchParams: Promise<Message>;
}

export default async function SignInPage({ searchParams }: LoginProps) {
  const message = await searchParams;

  if ("message" in message) {
    return (
      <div className="flex h-screen w-full flex-1 items-center justify-center p-4 sm:max-w-md" style={{ background: "#0D0F14" }}>
        <FormMessage message={message} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "#0D0F14" }}
    >
      {/* Grid */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(26,29,36,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(26,29,36,0.5) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)" }}>
            <Zap size={17} style={{ color: "#00D4FF" }} />
          </div>
          <span className="text-lg font-bold tracking-wider" style={{ fontFamily: "Syne, sans-serif", color: "#00D4FF" }}>
            OUTREACH
          </span>
        </div>

        <div
          className="rounded-2xl p-6"
          style={{ background: "rgba(16,19,26,0.9)", border: "1px solid #2A2D35" }}
        >
          <form className="flex flex-col gap-5">
            <div className="text-center">
              <h1 className="text-xl font-bold mb-1" style={{ fontFamily: "Syne, sans-serif", color: "#e8eaed" }}>
                Welcome back
              </h1>
              <p className="text-xs" style={{ color: "#555", fontFamily: "Space Grotesk, sans-serif" }}>
                Don't have an account?{" "}
                <Link href="/sign-up" className="transition-colors" style={{ color: "#00D4FF" }}>
                  Sign up free
                </Link>
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <Label htmlFor="email" className="text-xs mb-1.5 block" style={{ color: "#777", fontFamily: "JetBrains Mono, monospace" }}>
                  EMAIL
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  className="w-full text-sm"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid #2A2D35",
                    color: "#ccc",
                  }}
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <Label htmlFor="password" className="text-xs" style={{ color: "#777", fontFamily: "JetBrains Mono, monospace" }}>
                    PASSWORD
                  </Label>
                  <Link href="/forgot-password" className="text-xs transition-colors" style={{ color: "#555" }}>
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  name="password"
                  placeholder="••••••••"
                  required
                  className="w-full text-sm"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid #2A2D35",
                    color: "#ccc",
                  }}
                />
              </div>
            </div>

            <SubmitButton
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
              pendingText="Signing in..."
              formAction={signInAction}
              style={{
                background: "rgba(0,212,255,0.12)",
                border: "1px solid rgba(0,212,255,0.4)",
                color: "#00D4FF",
                fontFamily: "Syne, sans-serif",
              } as React.CSSProperties}
            >
              Sign In
            </SubmitButton>

            <FormMessage message={message} />
          </form>
        </div>

        <p className="text-center mt-6 text-xs" style={{ color: "#333", fontFamily: "JetBrains Mono, monospace" }}>
          <Link href="/" style={{ color: "#444" }}>← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
