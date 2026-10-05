import type { SettingsSection } from "../SettingsTab";
import { aiSection } from "./ai";
import { generalSection } from "./general";
import { learnerSection } from "./learner";
import { srsSection } from "./srs";
import { wordlistsSection } from "./wordlists";

// Order = order on the settings page. New sections (SRS, export…) go here.
export const SETTINGS_SECTIONS: SettingsSection[] = [generalSection, wordlistsSection, srsSection, aiSection, learnerSection];
