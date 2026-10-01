import { App, MomentFormatComponent, PluginSettingTab, Setting } from "obsidian";
import { SUPPORTED_TOKENS, formatToPattern } from "./date-format";
import type DateMirror from "./main";

export interface DateMirrorSettings {
  /** Frontmatter property to sync. Empty until the user picks one. */
  dateProperty: string;
  /** Moment.js format of the date in filenames. */
  dateFormat: string;
}

export const DEFAULT_SETTINGS: DateMirrorSettings = {
  dateProperty: "",
  dateFormat: "YYYY-MM-DD",
};

/** Placeholder stored by early versions before a property was chosen. */
const LEGACY_UNSET_PROPERTY = "DEFAULT";

export function isConfigured(settings: DateMirrorSettings): boolean {
  return (
    settings.dateProperty !== "" &&
    settings.dateProperty !== LEGACY_UNSET_PROPERTY &&
    formatToPattern(settings.dateFormat) !== null
  );
}

interface PropertyInfo {
  name: string;
  widget?: string;
  type?: string;
  occurrences?: number;
}

/**
 * Lists date and datetime properties used in the vault. This relies on
 * `metadataTypeManager`, which isn't part of the public API, so it fails soft.
 */
function getDateProperties(app: App): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, PropertyInfo> | undefined = (app as any)
    .metadataTypeManager?.properties;
  if (!properties) {
    return [];
  }

  return Object.entries(properties)
    .filter(([, info]) => {
      const widget = info.widget ?? info.type;
      const used = info.occurrences === undefined || info.occurrences > 0;
      return used && (widget === "date" || widget === "datetime");
    })
    .map(([key, info]) => info.name ?? key)
    .sort();
}

export class DateMirrorSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: DateMirror) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const settings = this.plugin.settings;
    const properties = getDateProperties(this.app);
    const current = isConfigured(settings) ? settings.dateProperty : "";

    new Setting(containerEl)
      .setName("Date property")
      .setDesc(
        "The date property to keep in sync with the date in the filename. Only notes that have this property are changed."
      )
      .addDropdown((dropdown) => {
        dropdown.addOption(
          "",
          properties.length > 0 ? "Select a property" : "No date properties found"
        );
        // Keep the saved choice visible even if no note currently uses it
        if (current && !properties.includes(current)) {
          dropdown.addOption(current, current);
        }
        properties.forEach((property) => dropdown.addOption(property, property));

        dropdown.setValue(current).onChange(async (value) => {
          settings.dateProperty = value;
          await this.plugin.saveSettings();
        });
      });

    const formatSetting = new Setting(containerEl).setName("Date format");
    const sampleEl = createEl("b", { cls: "u-pop" });
    const warningEl = createDiv({ cls: "mod-warning" });
    formatSetting.descEl.append(
      "The format of the date in filenames. Supported tokens: ",
      SUPPORTED_TOKENS.join(", "),
      ". For syntax, refer to the ",
      createEl("a", {
        href: "https://momentjs.com/docs/#/displaying/format/",
        text: "moment documentation",
      }),
      ".",
      createEl("br"),
      "Today's date looks like this: ",
      sampleEl,
      warningEl
    );

    const updateWarning = (format: string) => {
      warningEl.setText(
        formatToPattern(format) === null
          ? "This format isn't supported, so nothing will be synced."
          : ""
      );
    };
    updateWarning(settings.dateFormat);

    formatSetting.addMomentFormat((format: MomentFormatComponent) => {
      format
        .setDefaultFormat(DEFAULT_SETTINGS.dateFormat)
        .setPlaceholder(DEFAULT_SETTINGS.dateFormat)
        .setValue(settings.dateFormat)
        .setSampleEl(sampleEl)
        .onChange(async (value) => {
          settings.dateFormat = value || DEFAULT_SETTINGS.dateFormat;
          updateWarning(settings.dateFormat);
          await this.plugin.saveSettings();
        });
    });
  }
}
