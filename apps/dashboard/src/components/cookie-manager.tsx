"use client";

import {
  CheckCircle2,
  Coins,
  KeyRound,
  Loader2,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface CreditBalanceData {
  available: number;
  limit: number;
  reset_at: string;
  used: number;
}

export interface CookieManagerProps {
  cookie: string;
  credits: CreditBalanceData | null;
  onCookieChange: (cookie: string) => void;
  onCreditsChange: (credits: CreditBalanceData | null) => void;
  proxyUrl: string;
}

export const CookieManager = ({
  cookie,
  credits,
  onCookieChange,
  onCreditsChange,
  proxyUrl,
}: CookieManagerProps) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("thaipass_cookie");
    if (saved && !cookie) {
      onCookieChange(saved);
    }
  }, [cookie, onCookieChange]);

  const handleCleanAndSetCookie = (raw: string) => {
    let val = raw.trim();
    if (val.toLowerCase().startsWith("cookie:")) {
      val = val.slice(7).trim();
    }
    if (val.toLowerCase().startsWith("authorization: bearer")) {
      val = val.slice(21).trim();
    }
    onCookieChange(val);
    if (val) {
      localStorage.setItem("thaipass_cookie", val);
    } else {
      localStorage.removeItem("thaipass_cookie");
      onCreditsChange(null);
    }
  };

  const handleVerify = async () => {
    if (!cookie) {
      toast.error("Please enter your AI Pass session cookie first.");
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);

      const res = await fetch(`${proxyUrl}/v1/usage`, {
        headers: {
          Authorization: `Bearer ${cookie}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const message =
          errorData.error?.message ||
          `HTTP ${res.status}: Failed to read usage balance`;
        throw new Error(message);
      }

      const data: CreditBalanceData = await res.json();
      onCreditsChange(data);
      toast.success("Cookie is valid! Balance updated.");
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to verify cookie";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    onCookieChange("");
    onCreditsChange(null);
    localStorage.removeItem("thaipass_cookie");
    setErrorMsg(null);
    toast.info("Cookie cleared from local storage.");
  };

  const percentageUsed =
    credits && credits.limit > 0
      ? Math.min(100, Math.round((credits.used / credits.limit) * 100))
      : 0;

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">
                AI Pass Session & Quota
              </CardTitle>
              <CardDescription className="text-xs">
                Stored in your browser only. Never shared with any third party.
              </CardDescription>
            </div>
          </div>
          {credits && (
            <Badge
              variant="outline"
              className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400"
            >
              <CheckCircle2 className="h-3 w-3" /> Valid Session
            </Badge>
          )}
          {errorMsg && (
            <Badge
              variant="outline"
              className="gap-1 border-rose-500/30 bg-rose-500/10 text-xs text-rose-400"
            >
              <XCircle className="h-3 w-3" /> Authentication Issue
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Input
              type="password"
              placeholder="Paste full Cookie header containing __Secure-ai_passport_auth.session_token..."
              value={cookie}
              onChange={(e) => handleCleanAndSetCookie(e.target.value)}
              className="bg-background/50 pr-10 font-mono text-xs"
            />
            {cookie && (
              <button
                type="button"
                onClick={handleClear}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
                title="Clear Cookie"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleVerify}
              disabled={loading || !cookie}
              size="sm"
              className="shrink-0 gap-1.5 bg-blue-600 text-white hover:bg-blue-500"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span>Verify & Check Quota</span>
            </Button>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        {credits && (
          <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
            <div className="border-border/50 bg-background/40 rounded-xl border p-3.5">
              <div className="flex items-center justify-between pb-1">
                <span className="text-muted-foreground text-[11px] font-medium">
                  Available Credits
                </span>
                <Coins className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="text-foreground text-xl font-bold tracking-tight">
                {credits.available.toLocaleString()}
              </div>
              <div className="bg-secondary mt-2 h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.max(5, 100 - percentageUsed)}%` }}
                />
              </div>
            </div>

            <div className="border-border/50 bg-background/40 rounded-xl border p-3.5">
              <div className="flex items-center justify-between pb-1">
                <span className="text-muted-foreground text-[11px] font-medium">
                  Used / Total Limit
                </span>
                <span className="text-muted-foreground font-mono text-xs">
                  {percentageUsed}%
                </span>
              </div>
              <div className="text-foreground text-xl font-bold tracking-tight">
                {credits.used.toLocaleString()}{" "}
                <span className="text-muted-foreground text-xs font-normal">
                  / {credits.limit.toLocaleString()}
                </span>
              </div>
              <div className="bg-secondary mt-2 h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${percentageUsed}%` }}
                />
              </div>
            </div>

            <div className="border-border/50 bg-background/40 rounded-xl border p-3.5">
              <div className="flex items-center justify-between pb-1">
                <span className="text-muted-foreground text-[11px] font-medium">
                  Period Resets
                </span>
              </div>
              <div className="text-foreground mt-0.5 text-sm font-semibold tracking-tight">
                {credits.reset_at
                  ? new Date(credits.reset_at).toLocaleString()
                  : "End of period"}
              </div>
              <p className="text-muted-foreground mt-1 text-[11px]">
                Quota automatically refreshes each cycle
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
