import { beforeEach, describe, expect, it, vi } from "vitest";
import type { App, TFile as ObsidianTFile } from "obsidian";
import { TFile, notices } from "./obsidian-stub";
import { DateMirrorSettings } from "../src/settings";
import { DateSync, getSyncedBasename, getSyncedFrontmatterValue } from "../src/sync";

const settings: DateMirrorSettings = { dateProperty: "date", dateFormat: "YYYY-MM-DD" };

describe("getSyncedBasename", () => {
  it("returns the renamed basename when the dates differ", () => {
    expect(getSyncedBasename("2026-10-01 Standup", "2026-10-02", settings)).toBe(
      "2026-10-02 Standup"
    );
  });

  it("uses only the date part of a datetime", () => {
    expect(getSyncedBasename("2026-10-01 Standup", "2026-10-02T09:30", settings)).toBe(
      "2026-10-02 Standup"
    );
  });

  it.each([
    ["dates already match", "2026-10-01 Standup", "2026-10-01"],
    ["filename has no date", "Standup", "2026-10-02"],
    ["property is empty", "2026-10-01 Standup", null],
    ["property isn't a date", "2026-10-01 Standup", "soon"],
  ])("returns null when the %s", (_, basename, value) => {
    expect(getSyncedBasename(basename, value, settings)).toBeNull();
  });
});

describe("getSyncedFrontmatterValue", () => {
  it("returns the filename's date in ISO format", () => {
    const ddmm = { ...settings, dateFormat: "DD.MM.YYYY" };
    expect(getSyncedFrontmatterValue("Trip 03.07.2026", "2026-01-01", ddmm)).toBe("2026-07-03");
  });

  it("fills in an empty property", () => {
    expect(getSyncedFrontmatterValue("2026-10-01", null, settings)).toBe("2026-10-01");
  });

  it("keeps the time of a datetime property", () => {
    expect(getSyncedFrontmatterValue("2026-10-02", "2026-10-01T09:30", settings)).toBe(
      "2026-10-02T09:30"
    );
  });

  it.each([
    ["dates already match", "2026-10-01", "2026-10-01"],
    ["datetime is on the same day", "2026-10-01", "2026-10-01T09:30"],
    ["filename has no date", "Standup", "2026-10-01"],
  ])("returns null when the %s", (_, basename, value) => {
    expect(getSyncedFrontmatterValue(basename, value, settings)).toBeNull();
  });
});

describe("DateSync", () => {
  let frontmatter: Record<string, Record<string, unknown>>;
  let existingPaths: Set<string>;
  let app: {
    metadataCache: { getFileCache: ReturnType<typeof vi.fn> };
    vault: { getAbstractFileByPath: ReturnType<typeof vi.fn> };
    fileManager: {
      renameFile: ReturnType<typeof vi.fn>;
      processFrontMatter: ReturnType<typeof vi.fn>;
    };
  };
  let currentSettings: DateMirrorSettings;
  let sync: DateSync;

  const file = (path: string, fm?: Record<string, unknown>) => {
    if (fm) frontmatter[path] = fm;
    return new TFile(path) as unknown as ObsidianTFile;
  };

  beforeEach(() => {
    frontmatter = {};
    existingPaths = new Set();
    notices.length = 0;
    currentSettings = { ...settings };
    app = {
      metadataCache: {
        getFileCache: vi.fn((f: TFile) =>
          frontmatter[f.path] ? { frontmatter: frontmatter[f.path] } : null
        ),
      },
      vault: { getAbstractFileByPath: vi.fn((p: string) => (existingPaths.has(p) ? {} : null)) },
      fileManager: {
        renameFile: vi.fn(async () => {}),
        processFrontMatter: vi.fn(async (f: TFile, fn: (fm: Record<string, unknown>) => void) =>
          fn(frontmatter[f.path])
        ),
      },
    };
    sync = new DateSync(app as unknown as App, () => currentSettings);
  });

  describe("syncFilename", () => {
    it("renames a note in a folder", async () => {
      await sync.syncFilename(file("Daily/2026-10-01 Standup.md", { date: "2026-10-02" }));
      expect(app.fileManager.renameFile).toHaveBeenCalledWith(
        expect.anything(),
        "Daily/2026-10-02 Standup.md"
      );
    });

    it("renames a note at the vault root without a leading slash", async () => {
      await sync.syncFilename(file("2026-10-01.md", { date: "2026-10-02" }));
      expect(app.fileManager.renameFile).toHaveBeenCalledWith(expect.anything(), "2026-10-02.md");
    });

    it("doesn't rename when the dates match", async () => {
      await sync.syncFilename(file("2026-10-01.md", { date: "2026-10-01" }));
      expect(app.fileManager.renameFile).not.toHaveBeenCalled();
    });

    it("doesn't rename notes without the property", async () => {
      await sync.syncFilename(file("2026-10-01.md", { created: "2026-10-02" }));
      await sync.syncFilename(file("2026-10-03.md"));
      expect(app.fileManager.renameFile).not.toHaveBeenCalled();
    });

    it("doesn't rename files that aren't notes", async () => {
      await sync.syncFilename(file("2026-10-01.canvas", { date: "2026-10-02" }));
      expect(app.fileManager.renameFile).not.toHaveBeenCalled();
    });

    it.each(["", "DEFAULT"])("does nothing when the property is %j", async (dateProperty) => {
      currentSettings.dateProperty = dateProperty;
      await sync.syncFilename(file("2026-10-01.md", { [dateProperty]: "2026-10-02" }));
      expect(app.fileManager.renameFile).not.toHaveBeenCalled();
    });

    it("shows one notice and skips the rename when the target exists", async () => {
      existingPaths.add("2026-10-02.md");
      const note = file("2026-10-01.md", { date: "2026-10-02" });
      await sync.syncFilename(note);
      await sync.syncFilename(note);
      expect(app.fileManager.renameFile).not.toHaveBeenCalled();
      expect(notices).toHaveLength(1);
      expect(notices[0]).toContain("2026-10-02.md");
    });

    it("ignores repeat events while a rename is in progress", async () => {
      let finish: () => void = () => {};
      app.fileManager.renameFile.mockImplementation(() => new Promise<void>((r) => (finish = r)));
      const note = file("2026-10-01.md", { date: "2026-10-02" });
      const first = sync.syncFilename(note);
      await sync.syncFilename(note);
      finish();
      await first;
      expect(app.fileManager.renameFile).toHaveBeenCalledTimes(1);
    });

    it("logs rename failures instead of throwing", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      app.fileManager.renameFile.mockRejectedValue(new Error("nope"));
      await expect(
        sync.syncFilename(file("2026-10-01.md", { date: "2026-10-02" }))
      ).resolves.toBeUndefined();
      expect(error).toHaveBeenCalled();
      error.mockRestore();
    });
  });

  describe("syncFrontmatter", () => {
    it("updates the property from the filename", async () => {
      const note = file("2026-10-05 Standup.md", { date: "2026-10-01", title: "x" });
      await sync.syncFrontmatter(note);
      expect(frontmatter["2026-10-05 Standup.md"]).toEqual({ date: "2026-10-05", title: "x" });
    });

    it("doesn't write when the dates match", async () => {
      await sync.syncFrontmatter(file("2026-10-01.md", { date: "2026-10-01" }));
      expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    });

    it("doesn't add the property to notes that don't have it", async () => {
      await sync.syncFrontmatter(file("2026-10-01.md", { title: "x" }));
      await sync.syncFrontmatter(file("2026-10-02.md"));
      expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    });

    it("doesn't touch files that aren't notes", async () => {
      await sync.syncFrontmatter(file("2026-10-01.pdf", { date: "2026-01-01" }));
      expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    });

    it("logs write failures instead of throwing", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      app.fileManager.processFrontMatter.mockRejectedValue(new Error("nope"));
      await expect(
        sync.syncFrontmatter(file("2026-10-05.md", { date: "2026-10-01" }))
      ).resolves.toBeUndefined();
      expect(error).toHaveBeenCalled();
      error.mockRestore();
    });
  });

  it("converges after a round trip", async () => {
    // Property edited → file renamed → rename event → no further write
    const note = file("2026-10-01 Standup.md", { date: "2026-10-02" });
    await sync.syncFilename(note);
    const renamed = file("2026-10-02 Standup.md", { date: "2026-10-02" });
    await sync.syncFrontmatter(renamed);
    expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
  });
});
