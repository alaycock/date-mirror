import { App, Notice, TFile, normalizePath } from "obsidian";
import {
  findDateInFilename,
  parseFrontmatterDate,
  replaceDateInFilename,
  toFrontmatterValue,
} from "./date-format";
import { DateMirrorSettings, isConfigured } from "./settings";

/**
 * Returns the basename the file should have so that its date matches the
 * frontmatter, or null if no rename is needed.
 */
export function getSyncedBasename(
  basename: string,
  frontmatterValue: unknown,
  settings: DateMirrorSettings
): string | null {
  const date = parseFrontmatterDate(frontmatterValue);
  if (!date) {
    return null;
  }

  const newName = replaceDateInFilename(basename, settings.dateFormat, date);
  return newName !== null && newName !== basename ? newName : null;
}

/**
 * Returns the frontmatter value that matches the date in the filename, or null
 * if no update is needed.
 */
export function getSyncedFrontmatterValue(
  basename: string,
  frontmatterValue: unknown,
  settings: DateMirrorSettings
): string | null {
  const match = findDateInFilename(basename, settings.dateFormat);
  if (!match) {
    return null;
  }

  const existing = parseFrontmatterDate(frontmatterValue);
  if (existing?.isSame(match.date, "day")) {
    return null;
  }

  return toFrontmatterValue(match.date, frontmatterValue);
}

export class DateSync {
  /** Paths with a rename in progress, so repeated events don't race. */
  private pendingRenames = new Set<string>();
  /** The last conflicting path a notice was shown for, to avoid repeats. */
  private lastConflict: string | null = null;

  constructor(
    private app: App,
    private getSettings: () => DateMirrorSettings
  ) {}

  /** Renames the file so its date matches the date property. */
  async syncFilename(file: TFile): Promise<void> {
    const settings = this.getSettings();
    const value = this.getPropertyValue(file, settings);
    if (value === undefined || this.pendingRenames.has(file.path)) {
      return;
    }

    const newBasename = getSyncedBasename(file.basename, value, settings);
    if (!newBasename) {
      return;
    }

    const parentPath = file.parent?.path ?? "/";
    const newPath = normalizePath(
      `${parentPath}/${newBasename}.${file.extension}`
    );

    if (this.app.vault.getAbstractFileByPath(newPath)) {
      if (this.lastConflict !== newPath) {
        this.lastConflict = newPath;
        new Notice(
          `Date Mirror: couldn't rename "${file.basename}" because "${newPath}" already exists.`
        );
      }
      return;
    }

    this.pendingRenames.add(file.path);
    try {
      await this.app.fileManager.renameFile(file, newPath);
      this.lastConflict = null;
    } catch (error) {
      console.error(`Date Mirror: failed to rename ${file.path}`, error);
    } finally {
      this.pendingRenames.delete(file.path);
    }
  }

  /** Updates the date property so it matches the date in the filename. */
  async syncFrontmatter(file: TFile): Promise<void> {
    const settings = this.getSettings();
    const value = this.getPropertyValue(file, settings);
    if (value === undefined) {
      return;
    }

    const newValue = getSyncedFrontmatterValue(file.basename, value, settings);
    if (newValue === null) {
      return;
    }

    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter[settings.dateProperty] = newValue;
      });
    } catch (error) {
      console.error(`Date Mirror: failed to update ${file.path}`, error);
    }
  }

  /**
   * Returns the date property's value, or undefined if the file shouldn't be
   * synced: the plugin isn't configured, it isn't a note, or the note doesn't
   * have the property.
   */
  private getPropertyValue(
    file: TFile,
    settings: DateMirrorSettings
  ): unknown {
    if (!isConfigured(settings) || file.extension !== "md") {
      return undefined;
    }
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter || !(settings.dateProperty in frontmatter)) {
      return undefined;
    }
    return frontmatter[settings.dateProperty] ?? null;
  }
}
