"use client";

import { ArrowUpRight, Cpu, ShieldCheck, Zap } from "lucide-react";
import { useState } from "react";

import { ConfigGenerator } from "@/components/config-generator";
import type { CreditBalanceData } from "@/components/cookie-manager";
import { CookieManager } from "@/components/cookie-manager";
import { DashboardHeader } from "@/components/dashboard-header";
import { LivePlayground } from "@/components/live-playground";
import { ModelCatalog } from "@/components/model-catalog";
import { Badge } from "@/components/ui/badge";
import FluidOrb from "@/components/ui/fluid-orb";

export default function Home() {
  const [proxyUrl, setProxyUrl] = useState("http://127.0.0.1:3789");
  const [cookie, setCookie] = useState("");
  const [credits, setCredits] = useState<CreditBalanceData | null>(null);
  const [selectedModel, setSelectedModel] = useState("claude-sonnet-5@default");

  return (
    <div className="bg-background text-foreground selection:bg-primary/20 selection:text-primary relative flex min-h-screen flex-col overflow-x-hidden">
      <div className="pointer-events-none absolute -top-40 right-10 z-0 opacity-40 blur-2xl">
        <FluidOrb size={480} color="#3B82F6" />
      </div>

      <div className="pointer-events-none absolute top-[500px] -left-40 z-0 opacity-25 blur-3xl">
        <FluidOrb size={440} color="#06B6D4" />
      </div>

      <DashboardHeader proxyUrl={proxyUrl} />

      <main className="relative z-10 container mx-auto max-w-7xl flex-1 space-y-8 px-4 py-8 sm:px-6">
        <div className="border-border/40 flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1 border-blue-500/30 bg-blue-500/10 text-[11px] font-medium text-blue-400"
              >
                <Zap className="h-3 w-3" /> Zero-Storage Proxy
              </Badge>
              <Badge
                variant="outline"
                className="border-border/60 text-muted-foreground gap-1 text-[11px] font-medium"
              >
                <ShieldCheck className="h-3 w-3 text-emerald-400" /> Client
                Authentication
              </Badge>
            </div>
            <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">
              Thaipass Control Center
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              Connect Claude Code, Cursor, Cline, and Vercel AI SDK to AI Pass
              with your own session token.
            </p>
          </div>

          <div className="bg-secondary/50 border-border/60 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs">
            <Cpu className="h-3.5 w-3.5 shrink-0 text-blue-400" />
            <span className="text-muted-foreground font-mono">Proxy Host:</span>
            <input
              type="text"
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              className="text-foreground w-44 bg-transparent font-mono text-xs focus:outline-none"
              placeholder="http://127.0.0.1:3789"
            />
          </div>
        </div>

        <div className="space-y-6">
          <CookieManager
            proxyUrl={proxyUrl}
            cookie={cookie}
            onCookieChange={setCookie}
            credits={credits}
            onCreditsChange={setCredits}
          />

          <ConfigGenerator
            proxyUrl={proxyUrl}
            cookie={cookie}
            selectedModel={selectedModel}
          />

          <LivePlayground
            proxyUrl={proxyUrl}
            cookie={cookie}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />

          <ModelCatalog
            onSelectModel={setSelectedModel}
            selectedModel={selectedModel}
          />
        </div>
      </main>

      <footer className="border-border/40 bg-background/60 relative z-10 mt-12 border-t py-6 backdrop-blur-sm">
        <div className="text-muted-foreground container mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-xs sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span className="text-foreground font-semibold">thaipass</span>
            <span>&bull;</span>
            <span>Personal AI Pass Gateway</span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href={`${proxyUrl}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
            >
              <span>Scalar OpenAPI</span>
              <ArrowUpRight className="h-3 w-3 opacity-60" />
            </a>
            <a
              href="https://github.com/PunGrumpy/thaipass"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
            >
              <span>GitHub</span>
              <ArrowUpRight className="h-3 w-3 opacity-60" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
