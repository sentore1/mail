import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import { TempoInit } from "@/components/tempo-init";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Outreach — Cold Email Platform",
  description: "AI-powered cold email outreach platform with lead scraping, CRM, and AI email generation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#161920",
                border: "1px solid #2A2D35",
                color: "#e8eaed",
                fontFamily: "Space Grotesk, sans-serif",
              },
            }}
          />
        </ThemeProvider>
        <TempoInit />
      </body>
    </html>
  );
}
