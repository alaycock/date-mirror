import { moment } from "obsidian";

/** The format Obsidian uses to store `date` properties. */
export const FRONTMATTER_DATE_FORMAT = "YYYY-MM-DD";

/** Moment.js tokens that can be located in a filename. */
const TOKEN_PATTERNS: [string, string][] = [
  ["YYYY", "\\d{4}"],
  ["YY", "\\d{2}"],
  ["MM", "\\d{2}"],
  ["M", "\\d{1,2}"],
  ["DD", "\\d{2}"],
  ["D", "\\d{1,2}"],
];

export const SUPPORTED_TOKENS = TOKEN_PATTERNS.map(([token]) => token);

export interface DateMatch {
  /** Index of the first character of the date within the filename. */
  index: number;
  /** The date text exactly as it appears in the filename. */
  text: string;
  date: moment.Moment;
}

/**
 * Converts a Moment.js format string into a regex source that matches dates in
 * that format. Returns null if the format contains tokens that can't be
 * matched (such as month names), or no date tokens at all.
 */
export function formatToPattern(format: string): string | null {
  let pattern = "";
  let hasToken = false;
  let rest = format;

  while (rest.length > 0) {
    // [escaped text] is output literally by moment
    const escaped = rest.match(/^\[([^\]]*)\]/);
    if (escaped) {
      pattern += escapeRegex(escaped[1]);
      rest = rest.slice(escaped[0].length);
      continue;
    }

    // Moment reads a run of the same letter as one token, e.g. MMM
    const run = rest.match(/^([a-zA-Z])\1*/);
    if (run) {
      const token = TOKEN_PATTERNS.find(([t]) => t === run[0]);
      // Other tokens, like month names, can't be matched reliably
      if (!token) {
        return null;
      }
      pattern += token[1];
      hasToken = true;
      rest = rest.slice(run[0].length);
      continue;
    }

    pattern += escapeRegex(rest[0]);
    rest = rest.slice(1);
  }

  return hasToken ? pattern : null;
}

/**
 * Finds the first date in `filename` that matches `format` and is a real
 * calendar date. Dates embedded in a longer run of digits are ignored.
 */
export function findDateInFilename(
  filename: string,
  format: string
): DateMatch | null {
  const pattern = formatToPattern(format);
  if (!pattern) {
    return null;
  }

  // Lookbehind isn't supported on older iOS, so capture the preceding
  // character instead.
  const regex = new RegExp(`(^|\\D)(${pattern})(?!\\d)`, "g");
  for (const match of filename.matchAll(regex)) {
    const text = match[2];
    const date = moment(text, format, true);
    if (date.isValid()) {
      return { index: (match.index ?? 0) + match[1].length, text, date };
    }
  }

  return null;
}

/**
 * Returns `filename` with its date replaced by `date` in the given format, or
 * null if the filename doesn't contain a date.
 */
export function replaceDateInFilename(
  filename: string,
  format: string,
  date: moment.Moment
): string | null {
  const match = findDateInFilename(filename, format);
  if (!match) {
    return null;
  }

  return (
    filename.slice(0, match.index) +
    date.format(format) +
    filename.slice(match.index + match.text.length)
  );
}

/**
 * Parses a frontmatter date or datetime property value. Obsidian stores these
 * as ISO 8601 strings.
 */
export function parseFrontmatterDate(value: unknown): moment.Moment | null {
  if (typeof value !== "string") {
    return null;
  }
  const date = moment(value, moment.ISO_8601, true);
  return date.isValid() ? date : null;
}

/**
 * Builds the frontmatter value for `date`. If the existing value is a datetime,
 * its time is kept and only the date part is changed.
 */
export function toFrontmatterValue(
  date: moment.Moment,
  existing: unknown
): string {
  const datePart = date.format(FRONTMATTER_DATE_FORMAT);
  if (typeof existing === "string" && /^\d{4}-\d{2}-\d{2}T/.test(existing)) {
    return datePart + existing.slice(FRONTMATTER_DATE_FORMAT.length);
  }
  return datePart;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
