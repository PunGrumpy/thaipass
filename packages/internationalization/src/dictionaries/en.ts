export const en = {
  brand: {
    name: "THAI passport",
    tagline: "Control center for the THAIpass gateway",
    titleTemplate: "%s ✦ AI Passport",
  },
  commandMenu: {
    empty: "No results found.",
    groups: {
      gateway: "Gateway",
      navigation: "Navigation",
      theme: "Theme",
    },
    placeholder: "Type a command or search…",
  },
  common: {
    actions: {
      cancel: "Cancel",
      clear: "Clear",
      close: "Close",
      copied: "Copied",
      copy: "Copy",
      refresh: "Refresh",
      refreshing: "Refreshing…",
      save: "Save",
      submit: "Submit",
    },
    languages: {
      en: "English",
      label: "Language",
      th: "ภาษาไทย",
    },
    loading: "Loading…",
    status: {
      connected: "Connected",
      disconnected: "Disconnected",
      error: "Error",
      healthy: "Healthy",
      offline: "Offline",
      online: "Online",
      unknown: "Unknown",
    },
    theme: {
      dark: "Dark",
      label: "Theme",
      light: "Light",
      system: "System",
    },
  },
  integrations: {
    description:
      "Drop-in configuration for Claude Code, Cursor, AI SDKs, and cURL.",
    title: "Integrations",
  },
  learning: {
    description: "EXP the LMS has recorded, and the runs that earn more.",
    title: "Learning",
  },
  models: {
    description: "Every model your current AI Pass session can reach.",
    searchPlaceholder: "Search models...",
    title: "Models",
  },
  navigation: {
    apiReference: "API reference",
    github: "GitHub",
    items: {
      integrations: {
        description: "Drop-in config for Claude Code, Cursor, SDKs, and cURL",
        title: "Integrations",
      },
      learning: {
        description: "EXP the LMS has recorded, and the runs that earn more",
        title: "Learning",
      },
      models: {
        description: "Every model your session can reach",
        title: "Models",
      },
      overview: {
        description: "Gateway health, quota, and catalog at a glance",
        title: "Overview",
      },
      playground: {
        description: "Stream a prompt through the proxy and time it",
        title: "Playground",
      },
      settings: {
        description: "Proxy origin, session cookie, and appearance",
        title: "Settings",
      },
    },
    search: "Search",
    sections: {
      configure: "Configure",
      gateway: "Gateway",
    },
    skipToContent: "Skip to content",
  },
  overview: {
    balanceError: "Could not read the balance",
    balanceErrorHint:
      "Check that the gateway is reachable and the session cookie is current, then refresh.",
    catalog: {
      action: "Browse models",
      description: "%s models across chat and media endpoints.",
      priced: "%s of %s priced",
      pricedLabel: "Market pricing",
      title: "Catalog mix",
    },
    description:
      "Health of the local gateway, what the session has left to spend, and what it can reach.",
    gateway: {
      actionLabel: "Open the API reference",
      costLive: "OpenRouter (live)",
      costOff: "Disabled",
      offline: "Waiting for the gateway to answer.",
      online: "Reachable and forwarding to AI Pass.",
      rows: {
        cost: "Cost estimation",
        models: "Built-in chat models",
        origin: "Proxy origin",
        upstream: "Upstream",
      },
      title: "Gateway",
    },
    sessionGate: {
      action: "Add session cookie",
      badge: "No session connected",
      description:
        "The gateway forwards your own AI Pass credentials and stores nothing. Add the session cookie once to enable quota, catalog, and the playground.",
      step: "Step %s of %s",
      steps: {
        copy: {
          body: "In DevTools → Network, right-click any request and choose Copy as cURL (or copy the Cookie header).",
          label: "Copy as cURL or Cookie",
        },
        paste: {
          body: "Paste into Settings. The dashboard automatically parses and extracts your session cookie.",
          label: "Paste into Settings",
        },
        signIn: {
          body: "Open de.aipass.net and sign in, so the browser holds a live session.",
          label: "Sign in to AI Pass",
        },
      },
      title: "Connect your AI Pass session",
    },
    stats: {
      catalog: {
        builtin: "Built-in list. Connect a session for yours",
        label: "Models reachable",
        live: "Live from your account catalog",
      },
      credits: {
        label: "Credits available",
        resets: "Resets %s",
      },
      free: {
        chat: "%s of them answer chat requests",
        label: "Free models",
        priced: "%s models priced via OpenRouter",
      },
      noSession: "No session",
      used: {
        label: "Credits used",
        share: "%s% of the period used",
      },
    },
    title: "Overview",
  },
  playground: {
    description:
      "Stream a prompt through the proxy and measure response latency.",
    title: "Playground",
  },
  settings: {
    appearance: {
      description: "System follows whatever your operating system is set to.",
      title: "Appearance",
    },
    description:
      "Everything here lives in this browser. The gateway itself keeps no state and no credentials.",
    language: {
      description: "Select your preferred interface language.",
      title: "Language",
    },
    proxy: {
      description:
        "Where the dashboard looks for the running gateway instance.",
      title: "Proxy Origin",
    },
    session: {
      description:
        "Your upstream AI Pass session cookie. Kept only in browser storage.",
      title: "Session Cookie",
    },
    title: "Settings",
  },
};

export type Dictionary = typeof en;
