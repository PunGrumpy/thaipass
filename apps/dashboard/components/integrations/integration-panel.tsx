"use client";

import { useMemo, useState } from "react";

import { SnippetBlock } from "@/components/integrations/snippet-block";
import { ModelSelect } from "@/components/playground/model-select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConnection } from "@/hooks/use-connection";
import { useCatalog } from "@/hooks/use-gateway";
import { DEFAULT_MODEL } from "@/lib/catalog";
import { COOKIE_PLACEHOLDER, SNIPPETS } from "@/lib/snippets";

export const IntegrationPanel = () => {
  const { cookie, hasSession, proxyUrl } = useConnection();
  const { models } = useCatalog();

  const [model, setModel] = useState(DEFAULT_MODEL);
  const [revealCookie, setRevealCookie] = useState(false);

  const chatModels = useMemo(
    () => models.filter((entry) => entry.kind === "chat"),
    [models]
  );

  const live = revealCookie && hasSession;
  const params = {
    cookie: live ? cookie : COOKIE_PLACEHOLDER,
    model,
    proxyUrl,
  };

  return (
    <div className="space-y-4">
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="integration-model">Model</Label>
        <ModelSelect
          id="integration-model"
          models={chatModels}
          onChange={setModel}
          value={model}
        />
      </div>

      <Tabs className="min-w-0" defaultValue={SNIPPETS[0]?.id}>
        <TabsList
          className="flex-wrap justify-start gap-y-1 group-data-horizontal/tabs:h-auto"
          variant="line"
        >
          {SNIPPETS.map((snippet) => (
            <TabsTrigger key={snippet.id} value={snippet.id}>
              {snippet.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {SNIPPETS.map((snippet) => (
          <TabsContent
            className="min-w-0 space-y-3"
            key={snippet.id}
            value={snippet.id}
          >
            <p className="text-muted-foreground max-w-[68ch] text-sm text-pretty">
              {snippet.hint}
            </p>
            <SnippetBlock
              canUseCookie={hasSession}
              code={snippet.code(params)}
              filename={snippet.filename}
              language={snippet.language}
              onToggleCookie={() => setRevealCookie((on) => !on)}
              usingCookie={live}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};
