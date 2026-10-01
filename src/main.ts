import { Plugin, TFile } from "obsidian";
import {
  DEFAULT_SETTINGS,
  DateMirrorSettingTab,
  DateMirrorSettings,
} from "./settings";
import { DateSync } from "./sync";

export default class DateMirror extends Plugin {
  settings!: DateMirrorSettings;

  async onload() {
    await this.loadSettings();
    const sync = new DateSync(this.app, () => this.settings);

    // Property edited → rename the file
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        void sync.syncFilename(file);
      })
    );

    // File renamed → update the property
    this.registerEvent(
      this.app.vault.on("rename", (file) => {
        if (file instanceof TFile) {
          void sync.syncFrontmatter(file);
        }
      })
    );

    this.addSettingTab(new DateMirrorSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
