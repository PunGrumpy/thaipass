import type { Dictionary, Locale } from "@thaipass/internationalization";
import { useI18n } from "@thaipass/internationalization";
import type { ComponentProps, ComponentType } from "react";
import { useMemo } from "react";

import {
  IntegrationsIcon,
  LearningIcon,
  ModelsIcon,
  OverviewIcon,
  PlaygroundIcon,
  SettingsIcon,
} from "@/components/icons/rune";

export type NavItemId =
  | "overview"
  | "playground"
  | "models"
  | "learning"
  | "integrations"
  | "settings";

export interface NavItem {
  description: string;
  href: string;
  icon: ComponentType<ComponentProps<"svg">>;
  id: NavItemId;
  title: string;
}

export interface NavSection {
  id: "gateway" | "configure";
  items: readonly NavItem[];
  label: string;
}

export const getNavSections = (
  locale: Locale,
  dictionary: Dictionary
): readonly NavSection[] => [
  {
    id: "gateway",
    items: [
      {
        description: dictionary.navigation.items.overview.description,
        href: `/${locale}`,
        icon: OverviewIcon,
        id: "overview",
        title: dictionary.navigation.items.overview.title,
      },
      {
        description: dictionary.navigation.items.playground.description,
        href: `/${locale}/playground`,
        icon: PlaygroundIcon,
        id: "playground",
        title: dictionary.navigation.items.playground.title,
      },
      {
        description: dictionary.navigation.items.models.description,
        href: `/${locale}/models`,
        icon: ModelsIcon,
        id: "models",
        title: dictionary.navigation.items.models.title,
      },
      {
        description: dictionary.navigation.items.learning.description,
        href: `/${locale}/learning`,
        icon: LearningIcon,
        id: "learning",
        title: dictionary.navigation.items.learning.title,
      },
    ],
    label: dictionary.navigation.sections.gateway,
  },
  {
    id: "configure",
    items: [
      {
        description: dictionary.navigation.items.integrations.description,
        href: `/${locale}/integrations`,
        icon: IntegrationsIcon,
        id: "integrations",
        title: dictionary.navigation.items.integrations.title,
      },
      {
        description: dictionary.navigation.items.settings.description,
        href: `/${locale}/settings`,
        icon: SettingsIcon,
        id: "settings",
        title: dictionary.navigation.items.settings.title,
      },
    ],
    label: dictionary.navigation.sections.configure,
  },
];

export const useNavSections = (): readonly NavSection[] => {
  const { locale, t } = useI18n();
  return useMemo(() => getNavSections(locale, t), [locale, t]);
};

export const useNavItems = (): readonly NavItem[] => {
  const sections = useNavSections();
  return useMemo(
    () => sections.flatMap((section) => section.items),
    [sections]
  );
};

export const GITHUB_URL = "https://github.com/PunGrumpy/thaipass";
