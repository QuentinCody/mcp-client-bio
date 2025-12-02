import type { Metadata } from "next";
import { ChatSidebar } from "@/components/chat-sidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Menu } from "lucide-react";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { BotIdClient } from "botid/client";
import { Inter } from 'next/font/google';

// Optimize font loading with Next.js font optimization
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  preload: true,
  adjustFontFallback: true,
});

const bodyClassName = `${inter.variable} font-sans antialiased`;

export const metadata: Metadata = {
  metadataBase: new URL("https://mcp-client-bio.vercel.app"),
  title: "Bio MCP Chat",
  description:
    "Bio MCP Chat is a minimalistic MCP client with a good feature set.",
  openGraph: {
    siteName: "Bio MCP Chat",
    url: "https://mcp-client-bio.vercel.app",
    images: [
      {
        url: "https://mcpchat.scira.ai/opengraph-image.png",
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bio MCP Chat",
    description:
      "Bio MCP Chat is a minimalistic MCP client with a good feature set.",
    images: ["https://mcpchat.scira.ai/twitter-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <BotIdClient
          protect={[
            {
              path: "/api/chat",
              method: "POST",
            }
          ]}
        />
      </head>
      <body
        className={`${bodyClassName} bg-[#f7f7f8] text-[#2f2f2f] dark:bg-[#0d0d0d] dark:text-[#ececec]`}
      >
        <Providers>
          <div className="flex h-[100dvh] w-full overflow-hidden bg-transparent">
            <ChatSidebar />
            <main className="flex flex-1 min-h-0 flex-col overflow-hidden">
              <div className="relative z-20 flex flex-1 min-h-0 flex-col bg-[#ffffff] shadow-[0_-1px_0_#e3e3e3] dark:bg-[#111111]">
                <div className="absolute left-4 top-4 z-30 md:hidden">
                  <SidebarTrigger>
                    <button className="flex h-10 w-10 items-center justify-center rounded-full border border-[#dcdcdc] bg-white text-[#2f2f2f] shadow-sm transition hover:bg-[#f7f7f8] dark:border-[#2f2f2f] dark:bg-[#1a1a1a] dark:text-[#ececec] dark:hover:bg-[#252525]">
                      <Menu className="h-4 w-4" />
                    </button>
                  </SidebarTrigger>
                </div>
                <div className="flex flex-1 min-h-0 flex-col overflow-hidden" id="chat-root">
                  {children}
                </div>
              </div>
            </main>
          </div>
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
