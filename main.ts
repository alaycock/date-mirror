import { App, MomentFormatComponent, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

interface CachedProperty {
	name: string;
	widget: string;
	occurrences: number;
}

interface DateMirrorSettings {
	dateProperty: string;
	dateFormat: string;
}

const DEFAULT_SETTINGS: DateMirrorSettings = {
	dateProperty: 'DEFAULT',
	dateFormat: "YYYY-MM-DD"
}

export default class DateMirror extends Plugin {
	settings: DateMirrorSettings;
	timer: { [key: string]: number } = {}
	debounceTimers: { [key: string]: number } = {}

	async onload() {
		await this.loadSettings();

		this.registerEvent(this.app.metadataCache.on('changed', (file,) => {
			if (file instanceof TFile) {
				this.updateFilename(file)
			}
		}));

		this.registerEvent(this.app.vault.on('rename', (file, newPath) => {
			if (file instanceof TFile) {
				this.updateFrontmatter(file)
			}
		}));

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {
		// Clear all debounce timers
		Object.values(this.debounceTimers).forEach(timer => clearTimeout(timer))
	}

	async updateFilename(file: TFile) {
		const cache = this.app.metadataCache.getFileCache(file)
		if (cache?.frontmatter?.[this.settings.dateProperty]) {
			const date = cache.frontmatter[this.settings.dateProperty]
			const formattedDate = window.moment(date).format(this.settings.dateFormat)

			// Find the date in the filename and replace it with the new date from the frontmatter
			const currentName = file.basename
			const extension = file.extension
			
			// Try to find and replace date patterns in the filename
			const newName = this.replaceDateInFilename(currentName, formattedDate)
			
			// If no name is unchanged, there's no date in the filename, exit early
			if (newName === currentName) {
				return
			}
			
			// Only rename if the name actually changed
			if (newName !== currentName) {
				const newFileName = extension ? `${newName}.${extension}` : newName
				const newPath = `${file.parent?.path}/${newFileName}`
				console.log('renaming file', file.path, '->', newPath)
				await this.app.fileManager.renameFile(file, newPath);
			}
		}
	}

	/**
	 * Attempts to find and replace date patterns in a filename
	 * Returns the original filename if no date pattern is found
	 */
	private replaceDateInFilename(filename: string, newDate: string): string {
		// Convert the dateFormat setting to a regex pattern
		const datePattern = this.createDatePatternFromFormat(this.settings.dateFormat)
		
		if (datePattern.test(filename)) {
			return filename.replace(datePattern, newDate)
		}

		// If no pattern matches, return original filename
		return filename
	}

	/**
	 * Converts a Moment.js date format string to a regex pattern
	 * that can match dates in that format within filenames
	 */
	private createDatePatternFromFormat(format: string): RegExp {
		// Escape special regex characters first
		let pattern = format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		
		// Replace Moment.js format tokens with regex patterns
		pattern = pattern
			.replace(/YYYY/g, '\\d{4}')           // 4-digit year
			.replace(/YY/g, '\\d{2}')             // 2-digit year
			.replace(/MM/g, '\\d{2}')             // 2-digit month
			.replace(/M/g, '\\d{1,2}')            // 1-2 digit month
			.replace(/DD/g, '\\d{2}')             // 2-digit day
			.replace(/D/g, '\\d{1,2}')            // 1-2 digit day
		
		return new RegExp(pattern)
	}

	async updateFrontmatter(file: TFile) {
		// Extract date from filename
		const dateFromFilename = this.extractDateFromFilename(file.basename)
		
		if (dateFromFilename) {
			// Update the frontmatter with the date from filename
			await this.app.fileManager.processFrontMatter(file, frontmatter => {
				const newDate = this.formatFrontmatterDate(dateFromFilename)
				
				// Only update frontmatter if it has changed
				if (frontmatter[this.settings.dateProperty] !== newDate) {
					console.log('updating frontmatter', frontmatter[this.settings.dateProperty], '->', newDate)
					frontmatter[this.settings.dateProperty] = newDate;
				}
			})
		}
	}

	/**
	 * Extracts a date from a filename using the configured date format
	 * Returns a Moment object if a valid date is found, null otherwise
	 */
	private extractDateFromFilename(filename: string): moment.Moment | null {
		// Convert the dateFormat setting to a regex pattern
		const datePattern = this.createDatePatternFromFormat(this.settings.dateFormat)
		
		const match = filename.match(datePattern)
		if (match) {
			const dateString = match[0]
			const parsedDate = window.moment(dateString, this.settings.dateFormat, true)
			
			// Return the moment object if it's valid
			if (parsedDate.isValid()) {
				return parsedDate
			}
		}
		
		return null
	}
	
	/**
	 * Outputs the date in the user's specified MomentJS format.
	 * If that format evalutes to an integer it will return an integer,
	 * otherwise a string.
	 */
	formatFrontmatterDate (date: moment.Moment): string | number {
		const output = date.format(this.settings.dateFormat)
		if (output.match(/^\d+$/)) {
			// The date is numeric/integer format
			return parseInt(output, 10)
		} else {
			return output
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: DateMirror;

	constructor(app: App, plugin: DateMirror) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private getAllFrontmatterProperties(): string[] {
		const properties = new Set<string>();
		// Not part of the official API
		const cachedProperties: Record<string, CachedProperty> = (this.app as any).metadataTypeManager.properties;

		// Add all frontmatter property keys to our set
		Object.entries(cachedProperties).forEach(([key, value]) => {
			if (value.widget === 'date' && value.occurrences > 0) {
				properties.add(key);
			}
		});

		// Convert set to sorted array
		return Array.from(properties).sort();
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		// Get all unique frontmatter properties from the vault
		const frontmatterProperties = this.getAllFrontmatterProperties();

		new Setting(containerEl)
			.setName('Date property')
			.setDesc('The date property that should be kept in-sync with the filename')
			.addDropdown(dropdown => {
				// Add all frontmatter properties as options
				frontmatterProperties.forEach(prop => {
					dropdown.addOption(prop, prop);
				});
				
				// Set current value or default to first property if available
				const currentValue = this.plugin.settings.dateProperty;
				const disabled = frontmatterProperties.length === 0;

				dropdown.setDisabled(disabled);
				dropdown.setValue(frontmatterProperties.includes(currentValue) ? currentValue : 'None selected');
				dropdown.onChange(async (value) => {
					this.plugin.settings.dateProperty = value;
					await this.plugin.saveSettings();
				});
			});
	
			// Date format setting
			let date_formatter: MomentFormatComponent;
			const settingDateFormat = new Setting(containerEl)
			.setName("Date format")
			.addMomentFormat((format: MomentFormatComponent) => {
				date_formatter = format
					.setDefaultFormat(DEFAULT_SETTINGS.dateFormat)
					.setPlaceholder(DEFAULT_SETTINGS.dateFormat)
					.setValue(this.plugin.settings.dateFormat)
					.onChange(async (value) => {
						this.plugin.settings.dateFormat = value;
						await this.plugin.saveSettings();
					});
			});
			const date_format_el = settingDateFormat.descEl.createEl("b", {
				cls: "u-pop",
				text: "test"
			});
			// @ts-ignore
			date_formatter.setSampleEl(date_format_el);
			settingDateFormat.descEl.append(
				"For syntax information, refer to the ",
				settingDateFormat.descEl.createEl("a", {
					href: "https://momentjs.com/docs/#/displaying/format/",
					text: "moment documentation"
				}),
				settingDateFormat.descEl.createEl("br"),
				"Today's note would look like this: ",
				date_format_el
			);
	
	}
}
