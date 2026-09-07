"use client";

import { ExternalLink, Radio, Sparkles, Terminal } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export interface DashboardHeaderProps {
  proxyUrl: string;
}

const getStatusLabel = (checking: boolean, ok?: boolean): string => {
  if (checking) {
    return "Checking";
  }
  if (ok) {
    return "Online";
  }
  return "Offline";
};

const getStatusColor = (checking: boolean, ok?: boolean): string => {
  if (checking) {
    return "text-amber-400";
  }
  if (ok) {
    return "text-emerald-400";
  }
  return "text-rose-400";
};

export const DashboardHeader = ({ proxyUrl }: DashboardHeaderProps) => {
  const [health, setHealth] = useState<{
    models?: number;
    ok: boolean;
    origin?: string;
  } | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    const checkHealth = async () => {
      try {
        setChecking(true);
        const res = await fetch(`${proxyUrl}/health`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch health: HTTP ${res.status}`);
        }
        const data = await res.json();
        if (active) {
          setHealth(data);
        }
      } catch {
        if (active) {
          setHealth({ ok: false });
        }
      } finally {
        if (active) {
          setChecking(false);
        }
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [proxyUrl]);

  const cleanHost = proxyUrl.replace(/^https?:\/\//u, "");
  const statusColor = getStatusColor(checking, health?.ok);
  const statusLabel = getStatusLabel(checking, health?.ok);

  return (
    <header className="border-border/40 bg-background/80 sticky top-0 z-40 w-full border-b backdrop-blur-xl">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 shadow-lg shadow-blue-500/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-foreground text-base font-bold tracking-tight sm:text-lg">
                thaipass
              </span>
              <Badge
                variant="outline"
                className="hidden border-blue-500/30 bg-blue-500/10 font-mono text-[10px] text-blue-400 sm:inline-flex"
              >
                Dashboard
              </Badge>
            </div>
            <p className="text-muted-foreground hidden text-[11px] sm:block">
              AI Pass Gateway & Client Configurator
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="border-border/60 bg-secondary/40 flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
            <Radio
              className={`h-3 w-3 ${statusColor} ${health?.ok ? "animate-pulse" : ""}`}
            />
            <span className="text-muted-foreground font-mono text-[11px]">
              Proxy ({cleanHost}):
            </span>
            <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
          </div>

          <a
            href={`${proxyUrl}/`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open OpenAPI & Scalar Reference"
            className={buttonVariants({
              className:
                "h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground",
              size: "sm",
              variant: "ghost",
            })}
          >
            <Terminal className="h-3.5 w-3.5 text-cyan-400" />
            <span>Scalar Docs</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>

          <a
            href="https://github.com/PunGrumpy/thaipass"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({
              className: "h-8 gap-1.5 text-xs border-border/80",
              size: "sm",
              variant: "outline",
            })}
          >
            <span>GitHub</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
        </div>
      </div>
    </header>
  );
};
