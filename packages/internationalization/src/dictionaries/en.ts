export const en = {
  authorize: {
    account: {
      none: "No AI Pass session is connected in this browser yet. Connect one, then come back to this screen.",
      signedIn: "Signed in as",
      unknown: "Could not read the account behind this session.",
    },
    action: {
      approve: "Allow %s",
      cancel: "Cancel",
      connect: "Connect a session",
      working: "Allowing…",
    },
    badge: "Login with thaipass",
    description:
      "%s is asking to use your AI Pass account through this gateway. It never sees your session cookie — it gets a key that this gateway can take back.",
    failed: "The gateway would not issue the code",
    invalid: {
      description:
        "The link is missing the app, the redirect, or the challenge it has to carry. Start the login again from the app itself.",
      title: "This login link is incomplete",
    },
    redirect: "The key goes to %s",
    scopes: {
      chat: "Send chat, message and response requests on your account",
      lms: "Open lessons and earn EXP, including spending quiz attempts",
      media: "Generate images, video and audio, which spend credits",
      models: "See the models your account can reach",
      title: "It will be able to",
      usage: "See your credit balance",
    },
    title: "Allow %s to use your account?",
    unverified:
      "thaipass does not check who publishes an app. Allow one only if you started this login yourself.",
  },
  brand: {
    name: "THAI passport",
    tagline: "Control center for the THAIpass gateway",
    titleTemplate: "%s ✦ AI Passport",
  },
  commandMenu: {
    copied: "Copied %s",
    copyFailed: "Could not copy %s. Copy it from the Models page instead.",
    empty: "No results found.",
    groups: {
      gateway: "Gateway",
      models: "Copy model id",
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
    gatewayStatus: "Gateway status: %s",
    languages: {
      en: "English",
      label: "Language",
      th: "ภาษาไทย",
    },
    loading: "Loading…",
    status: {
      checking: "Checking…",
      connected: "Connected",
      disconnected: "Disconnected",
      error: "Error",
      healthy: "Healthy",
      offline: "Offline",
      online: "Online",
      unknown: "Unknown",
      unreachable: "Unreachable",
    },
    theme: {
      dark: "Dark",
      label: "Theme",
      light: "Light",
      system: "System",
    },
  },
  integrations: {
    clients: {
      empty: "No client matches %s.",
      groups: {
        file: "In your code",
        settings: "In an editor's settings",
        terminal: "In a terminal",
      },
      label: "Client",
      model: "Model",
      search: "Search clients",
      setup: "Set up %s",
      viaGateway: "Through the gateway",
      viaUpstream: "Straight to AI Pass",
    },
    description:
      "Drop-in configuration for Claude Code, Cursor, AI SDKs, and cURL.",
    title: "Integrations",
  },
  learning: {
    breakdown: {
      empty: "The LMS reported no per-type breakdown for this account.",
      exp: "EXP",
      monthly: {
        footer: "The default target for a month is %s EXP",
        label: "EXP this month",
      },
      more: "Show %s more",
      source: "Source",
      standard: {
        footer: "Courses the list below does not break down",
        label: "From standard courses",
      },
      title: "Where the EXP came from",
      total: "Total",
      type: "Lesson type",
      types: {
        article: "Article",
        attachment: "Attachment",
        quiz: "Quiz",
        quiz_post_test: "Post-test",
        quiz_pre_test: "Pre-test",
        video: "Video",
      },
    },
    courses: {
      chosen: "%s chosen",
      done: "Done",
      every: "Every course, started ones first",
      full: "%s is the most a run takes",
      groups: {
        finished: "Finished",
        notStarted: "Not started",
        started: "Started",
      },
      label: "Courses",
      limit: "%s of %s chosen",
      loading: "Reading the catalogue…",
      noMatch: "No course matched.",
      open: "Choose courses",
      placeholder: "Search by code or title…",
      price: { bonus: "+%s on completion", exp: "%s EXP" },
      purpose:
        "Search the account's catalogue and pick the courses a run should cover.",
      remove: "Remove %s",
      state: {
        done: "Finished",
        notStarted: "Not started",
        progress: "%s% done",
        started: "Started",
      },
    },
    description: "How much EXP you have this month, and how to earn the rest.",
    error: "Could not read the LMS",
    feed: {
      active: {
        article: "Reading “%s”",
        attachment: "Reading “%s”",
        quiz: "Answering “%s”",
        video: "Watching “%s”",
      },
      courseBonus: "+%s EXP on completion",
      courseClosed: "closed",
      courseEmpty: "Nothing open in this course.",
      failed: "The run could not be followed",
      idle: "Nothing yet. Check what it would take, or start and earn.",
      lessons: { one: "%s lesson", other: "%s lessons" },
      paused:
        "The run used up its time budget mid-lesson. Start it again to pick up from the last stamp.",
      preview: "Preview",
      previewDone: "This is what a run would do. Nothing was changed.",
      previewRunning: "Working out what a run would do…",
      previewRunningLabel: "Preview in progress",
      previewSummary: "Would earn %s EXP across %s",
      previewUnchanged: "Nothing was changed. Start the run to do it for real.",
      reached: "The run reached its goal.",
      reading: "Reading what this account has left to learn…",
      runningLabel: "Run in progress",
      scope: {
        course: "A course was left unfinished",
        lesson: "A lesson was left unfinished",
        session: "The run stopped",
      },
      short: "The run stopped short of its goal.",
      stopped:
        "You stopped the run. Starting it again picks up from the last stamp.",
      summary: "+%s EXP in %s",
      title: "Activity",
      total: "Period total %s of %s · %s",
      unknown: "unknown",
      untitled: "Untitled course",
    },
    lesson: {
      aboutExp: "about %s EXP",
      earnedExp: "+%s EXP",
      kind: {
        article: "Article",
        attachment: "Attachment",
        quiz: "Quiz",
        video: "Video",
      },
      quiz: {
        answered: "answered %s of %s",
        failed: "failed",
        passed: "passed",
        score: "scored %s of %s",
      },
      status: {
        completed: "Done",
        paused: "Paused",
        planned: "Planned",
        skipped: "Skipped",
        started: "Learning",
      },
    },
    reload: "Reload progress",
    run: {
      account: "Each lesson is opened and marked done on your account",
      check: "See what it would take first",
      checkAgain: "Check again",
      confirm:
        "This also submits quiz answers, and a quiz attempt cannot be taken back. Turn quizzes off under Run settings to leave them alone.",
      estimate: "Last check: %s.",
      estimateVideo: "Last check: %s, about %s of video.",
      goal: {
        another: "Earn another %s EXP",
        confirm: "Yes, answer the quizzes",
        earn: "Earn %s more EXP",
        remaining: "Earn the remaining %s EXP",
        resume: "Carry on where it stopped",
        start: "Start learning",
      },
      headline: "%s EXP this month",
      invalid: {
        amount: "Give a whole number of EXP, 1 or more.",
        courses: "Name at most %s courses.",
        maxLessons: "Lessons per run goes from 1 to %s.",
      },
      limits: {
        articles: "no articles",
        attachments: "no attachments",
        chosen: { one: "%s chosen course", other: "%s chosen courses" },
        every: "every course",
        lessons: { one: "at most %s lesson", other: "at most %s lessons" },
        pace: "%s× speed",
        paceNormal: "normal speed",
        quiz: "answering quizzes",
      },
      met: "You have reached this month's target.",
      needsSession: "Needs a session cookie",
      ofTarget: "%s of %s EXP",
      settings: "Run settings",
      stop: "Stop",
      title: "Earn EXP",
      toGo: "%s to go",
    },
    session: {
      description:
        "Add a session cookie in Settings to read the LMS and to run lessons.",
      title: "No session connected",
    },
    settings: {
      amount: { earn: "EXP to earn", target: "Period total" },
      courses: "Courses",
      goal: {
        earn: "Earn in this run",
        label: "Goal",
        target: "Reach a period total",
      },
      hint: {
        earn: "This run stops once it has earned this much, whatever the period holds.",
        target:
          "A period that already holds this much ends the run after one read.",
      },
      lessons: {
        hint: "The run stops here even if the goal is not met.",
        label: "Lessons per run",
      },
      options: {
        articles: {
          description: "The same for article lessons.",
          label: "Read articles",
        },
        attachments: {
          description: "Marking an attachment read is what earns its EXP.",
          label: "Read attachments",
        },
        quiz: {
          description:
            "An attempt is spent for good, and the LMS rarely gives another. A model on your own session picks the answers.",
          label: "Answer quizzes",
        },
      },
      pace: {
        hint: "At 1× a ten-minute video takes ten minutes.",
        label: "Playback speed",
      },
      quizModel: "Model that answers",
    },
    title: "Learning",
  },
  models: {
    builtin: {
      description:
        "Connect a session in Settings to load the catalog your account can actually reach, with live availability.",
      title: "Showing the built-in model list",
    },
    capabilityFilter: {
      all: "All capabilities",
      label: "Capabilities",
    },
    capabilityNames: {
      provider: "Named provider",
      reasoning: "Reasoning",
      resolutions: "Resolution choices",
    },
    columns: {
      actions: "Actions",
      capabilities: "Capabilities",
      input: "Input / 1M",
      kind: "Kind",
      model: "Model",
      output: "Output / 1M",
    },
    copied: "Copied %s",
    copyFailed: "Could not copy %s. Select the id and copy it by hand.",
    count: "%s of %s",
    description: "Every model your current AI Pass session can reach.",
    empty: {
      filters: "No model matches these filters.",
      query: "No model matches %s.",
    },
    free: "Free ($0)",
    freeOnly: "Free only",
    kinds: { all: "All" },
    providers: {
      all: "All providers",
      empty: "No provider found.",
      label: "Providers",
      search: "Search providers…",
    },
    searchLabel: "Search models",
    searchPlaceholder: "Search model id…",
    sort: {
      input: "Lowest input price",
      label: "Sort",
      name: "Name",
      output: "Lowest output price",
      provider: "Provider",
    },
    title: "Models",
    unavailable: "Unavailable",
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
    session: {
      connect: "Connect session",
      connected: "Session connected",
      manage: "Manage session",
      none: "No session",
    },
    sidebar: "Sidebar",
    sidebarDescription: "Navigation for the dashboard.",
    skipToContent: "Skip to content",
    toggleSidebar: "Toggle sidebar",
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
    grid: {
      free: "Free ($0)",
      more: "Show %s more",
    },
    sections: {
      gateway: "Gateway",
      models: "Models",
      usage: "Usage",
    },
    sessionGate: {
      action: "Paste it in Settings",
      badge: "No session connected",
      clipboard: {
        action: "Paste from clipboard",
        blocked:
          "This browser would not share the clipboard. Paste into the field in Settings instead.",
        busy: "Reading clipboard…",
        done: "Session connected",
        empty: "Nothing in the clipboard yet",
        invalid: "That copy holds no AI Pass session",
      },
      description:
        "The gateway forwards your own AI Pass credentials and stores nothing. Copying the session takes four steps and no code — the pictures show where to click, and the paste lands anywhere on this page.",
      player: {
        pause: "Pause",
        play: "Play",
        replay: "Replay",
        step: "Step %s",
      },
      step: "Step %s of %s",
      steps: {
        copy: {
          body: "In that panel, click Application, then Cookies, then de.aipass.net. Click the row named __Secure-ai_passport_auth.session_token and copy its Value with Ctrl+C.",
          label: "Copy the one long row",
        },
        open: {
          body: "Press F12 — on a Mac, ⌥⌘I. A panel opens beside the page. Nothing you do in it changes anything.",
          label: "Open the browser panel",
        },
        paste: {
          body: "Press Paste from clipboard, or just hit Ctrl+V anywhere on this page. Whatever you copied, the token is pulled out of it.",
          label: "Paste it here",
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
    usage: {
      credits: "Credits",
      creditsNote: "Resets %s",
      free: "Free models",
      freeNote: "Answer without spending credits",
      heading: "This session",
      models: "Models reachable",
      modelsNoteBuiltin: "Built-in list. Connect a session for yours",
      modelsNoteLive: "Live from your account catalog",
      noSession: "No session connected",
    },
  },
  playground: {
    card: {
      capabilities: "Capabilities",
      input: "Input pricing",
      kind: "Endpoint",
      link: "Browse models",
      none: "No pricing reported",
      output: "Output pricing",
      perMillion: "%s / million tokens",
      unavailable: "This model is not answering right now.",
    },
    composer: {
      needsSession: "Connect a session to send",
      placeholder: "Type your message…",
      send: "Send",
      stop: "Stop",
    },
    description:
      "Stream a prompt through the proxy and measure response latency.",
    emptyPrompt: "The message is empty.",
    metrics: {
      cost: "Cost (est.)",
      costHint: "Estimated market value based on OpenRouter pricing",
      credits: "Credits",
      firstToken: "First token",
      throughput: "Throughput",
      tokens: "Tokens",
      total: "Total",
    },
    needsSession: "Add a session cookie in Settings first.",
    picker: {
      empty: "No model found.",
      label: "Model",
      preview: "Highlight a model to see what it costs",
      search: "Search models…",
    },
    reset: "Clear the conversation",
    settings: {
      label: "Run settings",
      system: "System prompt",
      systemHint: "Sent before your message on every run.",
    },
    title: "Playground",
    you: "You",
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
