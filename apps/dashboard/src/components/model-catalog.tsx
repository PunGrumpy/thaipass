"use client";

import {
  CHAT_MODELS,
  IMAGE_MODELS,
  MUSIC_MODELS,
  VIDEO_MODELS,
} from "@thaipass/core/aipass/models";
import { Check, Copy, Layers, Play, Search } from "lucide-react";
import { useMemo, useState } from "react";
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

export interface ModelItem {
  category: "chat" | "free" | "image" | "music" | "video";
  description: string;
  id: string;
}

export type Category = "all" | "chat" | "free" | "image" | "music" | "video";

const CATEGORIES: readonly Category[] = [
  "all",
  "free",
  "chat",
  "image",
  "video",
  "music",
];

export interface ModelCatalogProps {
  onSelectModel: (modelId: string) => void;
  selectedModel: string;
}

const getChatModelDescription = (modelId: string): string => {
  if (modelId.includes("claude-sonnet-5")) {
    return "High-intelligence reasoning and coding model.";
  }
  if (modelId.includes("gpt-5.6")) {
    return "Flagship frontier reasoning and multimodal turn.";
  }
  if (modelId.includes("sonar")) {
    return "Real-time search and web-grounded research model.";
  }
  if (modelId.includes("DeepSeek")) {
    return "DeepSeek reasoning and open-weights instruction model.";
  }
  return "OpenAI & Anthropic compatible chat completion model.";
};

export const ModelCatalog = ({
  onSelectModel,
  selectedModel,
}: ModelCatalogProps) => {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const allModels: ModelItem[] = useMemo(() => {
    const list: ModelItem[] = [];

    list.push({
      category: "free",
      description:
        "Fast, zero-credit default model suitable for daily assistance.",
      id: "gemini-3.1-flash-lite",
    });

    for (const m of CHAT_MODELS) {
      if (m === "gemini-3.1-flash-lite") {
        continue;
      }
      list.push({
        category: "chat",
        description: getChatModelDescription(m),
        id: m,
      });
    }

    for (const m of IMAGE_MODELS) {
      list.push({
        category: "image",
        description: "Image generation model.",
        id: m,
      });
    }

    for (const m of VIDEO_MODELS) {
      list.push({
        category: "video",
        description: "Video generation model.",
        id: m,
      });
    }

    for (const m of MUSIC_MODELS) {
      list.push({
        category: "music",
        description: "Audio & music generation model.",
        id: m,
      });
    }

    return list;
  }, []);

  const filtered = useMemo(
    () =>
      allModels.filter((item) => {
        const matchSearch = item.id
          .toLowerCase()
          .includes(search.toLowerCase());
        if (!matchSearch) {
          return false;
        }
        if (category === "all") {
          return true;
        }
        if (category === "free") {
          return item.category === "free";
        }
        return item.category === category;
      }),
    [allModels, search, category]
  );

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success(`Copied "${id}" to clipboard`);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-cyan-400" />
              Model Directory & Capabilities
            </CardTitle>
            <CardDescription className="text-xs">
              {allModels.length} models available across Chat, Vision, Image,
              Video, and Audio.
            </CardDescription>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              placeholder="Search model id..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-background/50 h-8 pl-8 font-mono text-xs"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-2">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              variant={category === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setCategory(cat)}
              className={`h-7 text-xs capitalize ${
                category === cat
                  ? "bg-primary text-primary-foreground"
                  : "border-border/60 bg-background/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat === "free" ? "Free Tier" : cat}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid max-h-[460px] grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => {
            const isSelected = selectedModel === m.id;
            return (
              <div
                key={m.id}
                className={`group flex flex-col justify-between rounded-lg border p-3 transition-all ${
                  isSelected
                    ? "border-blue-500/80 bg-blue-500/5 shadow-sm"
                    : "border-border/60 bg-background/40 hover:border-border/90 hover:bg-background/70"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 pb-1.5">
                    <span
                      className="text-foreground truncate font-mono text-xs font-medium"
                      title={m.id}
                    >
                      {m.id}
                    </span>
                    <Badge
                      variant="outline"
                      className={`h-4 border px-1.5 py-0 font-mono text-[10px] uppercase ${
                        m.category === "free"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                          : "border-border/80 text-muted-foreground"
                      }`}
                    >
                      {m.category}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground line-clamp-2 min-h-[30px] text-[11px]">
                    {m.description}
                  </p>
                </div>

                <div className="border-border/40 mt-3 flex items-center justify-between border-t pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(m.id)}
                    className="text-muted-foreground hover:text-foreground h-6 gap-1 px-2 text-[11px]"
                  >
                    {copiedId === m.id ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    <span>Copy ID</span>
                  </Button>

                  {(m.category === "chat" || m.category === "free") && (
                    <Button
                      variant={isSelected ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => onSelectModel(m.id)}
                      className="border-border/60 h-6 gap-1 px-2 text-[11px]"
                    >
                      <Play className="h-2.5 w-2.5" />
                      <span>{isSelected ? "Active" : "Use in Test"}</span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-muted-foreground col-span-full py-12 text-center text-xs">
              No models match your search criteria.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
