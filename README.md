# Date Mirror

Keeps the date in a note's filename in sync with a date property.

- Change the date property, and the date in the filename updates to match.
- Rename the note to a different date, and the date property updates to match.

For example, with the date property set to `date` and the date format set to `YYYY-MM-DD`:

| You change… | Before | After |
| --- | --- | --- |
| The `date` property to `2026-10-02` | `2026-10-01 Standup.md` | `2026-10-02 Standup.md` |
| The filename to `2026-10-05 Standup.md` | `date: 2026-10-01` | `date: 2026-10-05` |

Only the date part of the filename changes; any other text is kept.

## Settings

- **Date property**: The date or date & time property to sync. Only notes that already have this property are changed. Nothing is synced until you pick a property.
- **Date format**: How the date is written in filenames, using [Moment.js format](https://momentjs.com/docs/#/displaying/format/) syntax. Defaults to `YYYY-MM-DD`.

Supported date format tokens are `YYYY`, `YY`, `MM`, `M`, `DD` and `D`. Literal text can be added in square brackets, such as `[Week of] YYYY-MM-DD`. Formats with other tokens, such as month or weekday names, aren't supported.

## Details

- The property is always stored in Obsidian's standard `YYYY-MM-DD` format, whatever the filename format is.
- For date & time properties, the time is kept when the filename changes.
- If a filename contains more than one date, only the first is synced.
- If renaming would overwrite an existing file, the note isn't renamed and a notice is shown.
- Only Markdown notes are changed.

## Installation

Install **Date Mirror** from **Settings → Community plugins → Browse**, then enable it and choose a date property in **Settings → Date Mirror**.

To install manually, copy `main.js` and `manifest.json` from the [latest release](https://github.com/alaycock/date-mirror/releases/latest) to `<Vault>/.obsidian/plugins/date-mirror/`.

## Development

```bash
npm install
npm run dev    # Rebuild main.js on change
npm test       # Run unit tests
npm run lint
npm run build  # Type check and production build
```
