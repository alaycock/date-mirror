import { describe, expect, it } from "vitest";
import moment from "moment";
import {
  findDateInFilename,
  formatToPattern,
  parseFrontmatterDate,
  replaceDateInFilename,
  toFrontmatterValue,
} from "../src/date-format";

const date = (iso: string) => moment(iso, "YYYY-MM-DD", true);

describe("formatToPattern", () => {
  it.each([
    ["YYYY-MM-DD", "\\d{4}-\\d{2}-\\d{2}"],
    ["YYYYMMDD", "\\d{4}\\d{2}\\d{2}"],
    ["D.M.YY", "\\d{1,2}\\.\\d{1,2}\\.\\d{2}"],
    ["[Week of] YYYY-MM-DD", "Week of \\d{4}-\\d{2}-\\d{2}"],
    ["YYYY (MM)", "\\d{4} \\(\\d{2}\\)"],
  ])("converts %s", (format, expected) => {
    expect(formatToPattern(format)).toBe(expected);
  });

  it.each(["YYYY-MMM-DD", "dddd YYYY-MM-DD", "YYYY-MM-DD HH:mm", "Do MMMM YYYY", "", "[YYYY]"])(
    "rejects unsupported format %j",
    (format) => {
      expect(formatToPattern(format)).toBeNull();
    }
  );
});

describe("findDateInFilename", () => {
  it.each([
    ["2026-10-01", 0],
    ["2026-10-01 Standup", 0],
    ["Standup 2026-10-01", 8],
    ["Standup (2026-10-01) notes", 9],
  ])("finds the date in %j", (filename, index) => {
    const match = findDateInFilename(filename, "YYYY-MM-DD");
    expect(match?.text).toBe("2026-10-01");
    expect(match?.index).toBe(index);
    expect(match?.date.format("YYYY-MM-DD")).toBe("2026-10-01");
  });

  it("returns null when there's no date", () => {
    expect(findDateInFilename("Meeting notes", "YYYY-MM-DD")).toBeNull();
  });

  it("returns null for an unsupported format", () => {
    expect(findDateInFilename("2026-Oct-01", "YYYY-MMM-DD")).toBeNull();
  });

  it("skips impossible dates and uses the next valid one", () => {
    const match = findDateInFilename("2026-02-30 moved to 2026-03-02", "YYYY-MM-DD");
    expect(match?.text).toBe("2026-03-02");
    expect(match?.index).toBe(20);
  });

  it("ignores dates embedded in longer runs of digits", () => {
    expect(findDateInFilename("12026-10-01", "YYYY-MM-DD")).toBeNull();
    expect(findDateInFilename("2026-10-011", "YYYY-MM-DD")).toBeNull();
    expect(findDateInFilename("ID 202610011", "YYYYMMDD")).toBeNull();
  });

  it("handles single-digit day and month tokens", () => {
    const match = findDateInFilename("Trip 3.7.2026", "D.M.YYYY");
    expect(match?.date.format("YYYY-MM-DD")).toBe("2026-07-03");
  });

  it("matches escaped literal text in the format", () => {
    const match = findDateInFilename("Week of 2026-09-28", "[Week of] YYYY-MM-DD");
    expect(match?.text).toBe("Week of 2026-09-28");
    expect(match?.date.format("YYYY-MM-DD")).toBe("2026-09-28");
  });
});

describe("replaceDateInFilename", () => {
  it("replaces only the date and keeps surrounding text", () => {
    expect(
      replaceDateInFilename("Standup 2026-10-01 notes", "YYYY-MM-DD", date("2026-12-25"))
    ).toBe("Standup 2026-12-25 notes");
  });

  it("writes the date in the configured format", () => {
    expect(replaceDateInFilename("Log 20261001", "YYYYMMDD", date("2027-01-05"))).toBe(
      "Log 20270105"
    );
    expect(replaceDateInFilename("Trip 3.7.2026", "D.M.YYYY", date("2026-11-12"))).toBe(
      "Trip 12.11.2026"
    );
  });

  it("only replaces the first date", () => {
    expect(
      replaceDateInFilename("2026-10-01 to 2026-10-05", "YYYY-MM-DD", date("2026-10-02"))
    ).toBe("2026-10-02 to 2026-10-05");
  });

  it("returns null when there's no date", () => {
    expect(replaceDateInFilename("Notes", "YYYY-MM-DD", date("2026-10-01"))).toBeNull();
  });
});

describe("parseFrontmatterDate", () => {
  it.each(["2026-10-01", "2026-10-01T09:30", "2026-10-01T09:30:15"])("parses %j", (value) => {
    expect(parseFrontmatterDate(value)?.format("YYYY-MM-DD")).toBe("2026-10-01");
  });

  it.each([null, undefined, 20261001, "", "October 1st", "2026-02-30", ["2026-10-01"]])(
    "rejects %j",
    (value) => {
      expect(parseFrontmatterDate(value)).toBeNull();
    }
  );
});

describe("toFrontmatterValue", () => {
  it("writes an ISO date", () => {
    expect(toFrontmatterValue(date("2026-10-01"), "2025-01-01")).toBe("2026-10-01");
  });

  it("writes an ISO date regardless of the filename format", () => {
    const parsed = moment("01.10.2026", "DD.MM.YYYY", true);
    expect(toFrontmatterValue(parsed, null)).toBe("2026-10-01");
  });

  it("keeps the time of a datetime value", () => {
    expect(toFrontmatterValue(date("2026-10-01"), "2025-01-01T09:30")).toBe("2026-10-01T09:30");
    expect(toFrontmatterValue(date("2026-10-01"), "2025-01-01T09:30:15")).toBe(
      "2026-10-01T09:30:15"
    );
  });
});
