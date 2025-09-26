import type { Metadata } from "next";
import { ChatSidebar } from "@/components/chat-sidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Menu } from "lucide-react";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { BotIdClient } from "botid/client";
import { BackgroundScene } from "@/components/backgrounds/background-scene";

const bodyClassName = "font-sans antialiased";

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
      <body className={`${bodyClassName} bg-background text-foreground`}>
        <Providers>
          <BackgroundScene />
          <div className="relative flex min-h-[100dvh] w-full overflow-hidden">
            <ChatSidebar />
            <main className="relative flex flex-1 flex-col h-full min-h-0">
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-background via-background/70 to-transparent" />
              <div className="absolute top-6 left-6 z-40">
                <SidebarTrigger>
                  <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background/80 shadow-sm transition-all hover:translate-y-0.5 hover:border-border/80 hover:bg-background/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                    <Menu className="h-4 w-4" />
                  </button>
                </SidebarTrigger>
              </div>
              <div className="relative z-30 flex flex-1 justify-center px-2 sm:px-4 lg:px-6 min-h-0">
                <div className="flex w-full max-w-6xl flex-1">{children}</div>
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
