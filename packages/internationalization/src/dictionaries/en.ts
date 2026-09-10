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
    placeholder: "Type a command or search...",
  },
  common: {
    actions: {
      cancel: "Cancel",
      clear: "Clear",
      close: "Close",
      copied: "Copied",
      copy: "Copy",
      refresh: "Refresh",
      refreshing: "Refreshing...",
      save: "Save",
      submit: "Submit",
    },
    languages: {
      en: "English",
      label: "Language",
      th: "ภาษาไทย",
    },
    loading: "Loading...",
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
    cards: {
      catalog: "Model Catalog",
      gateway: "Gateway Status",
    },
    description:
      "Health of the local gateway, what the session has left to spend, and what it can reach.",
    sessionGate: {
      action: "Go to Settings",
      description:
        "Connect your AI Pass session cookie in Settings to see your live quota balance, model catalog, and start making requests.",
      title: "No Session Cookie Found",
    },
    stats: {
      catalog: "Available Models",
      credits: "Credits Remaining",
      health: "Gateway Health",
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
