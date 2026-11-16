/**
 * Form Field Extractor (Phase 9.0).
 *
 * Extracts form fields from a Playwright page using accessible labels
 * and semantic HTML first. Avoids fragile CSS-class-based selectors.
 */

import type { Page, Locator } from 'playwright';

export type FieldType = 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'file' | 'date' | 'unknown';

export interface ExtractedField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  currentValue?: string;
  placeholder?: string;
  helpText?: string;
  locator: string; // stable CSS selector or aria-based locator
  confidence: number; // 0-1
}

export interface ExtractedForm {
  url: string;
  title: string;
  fields: ExtractedField[];
  requiredCount: number;
  totalCount: number;
}

export class FormFieldExtractor {
  async extractForm(page: Page): Promise<ExtractedForm> {
    const fields: ExtractedField[] = [];

    // Get all form elements using accessible/semantic selectors
    const inputs = await page.locator('input, textarea, select').all();

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const field = await this.extractField(input, i);
      if (field) {
        fields.push(field);
      }
    }

    // Also detect radio groups
    const radioGroups = await this.extractRadioGroups(page);
    fields.push(...radioGroups);

    // Deduplicate by id
    const uniqueFields = fields.reduce((acc, field) => {
      if (!acc.find((f) => f.id === field.id)) {
        acc.push(field);
      }
      return acc;
    }, [] as ExtractedField[]);

    return {
      url: page.url(),
      title: await page.title(),
      fields: uniqueFields,
      requiredCount: uniqueFields.filter((f) => f.required).length,
      totalCount: uniqueFields.length,
    };
  }

  private async extractField(input: Locator, index: number): Promise<ExtractedField | null> {
    try {
      const tagName = await input.evaluate((el) => el.tagName.toLowerCase());
      const type = await input.getAttribute('type') || tagName;
      const id = await input.getAttribute('id') || await input.getAttribute('name') || `field_${index}`;
      const required = await input.getAttribute('required') !== null || await input.getAttribute('aria-required') === 'true';
      const placeholder = await input.getAttribute('placeholder') || undefined;
      const currentValue = await input.inputValue().catch(() => '') || undefined;

      // Get label using accessible methods
      const label = await this.getFieldLabel(input);

      // Determine field type
      const fieldType = this.determineFieldType(type, tagName);

      // Get help text
      const helpText = await this.getHelpText(input);

      // Get options for select
      const options = tagName === 'select' ? await this.getSelectOptions(input) : undefined;

      // Calculate confidence
      const confidence = label ? 0.9 : 0.5;

      return {
        id,
        label: label || id,
        type: fieldType,
        required,
        options,
        currentValue: currentValue || undefined,
        placeholder,
        helpText,
        locator: `[id="${id}"]`,
        confidence,
      };
    } catch {
      return null;
    }
  }

  private async extractRadioGroups(page: Page): Promise<ExtractedField[]> {
    const groups: ExtractedField[] = [];
    const radioInputs = await page.locator('input[type="radio"]').all();
    const groupNames = new Set<string>();

    for (const radio of radioInputs) {
      const name = await radio.getAttribute('name');
      if (name && !groupNames.has(name)) {
        groupNames.add(name);
        const required = await radio.getAttribute('required') !== null || await radio.getAttribute('aria-required') === 'true';
        const label = await this.getRadioGroupLabel(radio, name);

        const options: string[] = [];
        const radios = await page.locator(`input[type="radio"][name="${name}"]`).all();
        for (const r of radios) {
          const value = await r.getAttribute('value');
          const radioLabel = await this.getRadioLabel(r);
          options.push(radioLabel || value || '');
        }

        groups.push({
          id: name,
          label: label || name,
          type: 'radio',
          required,
          options,
          locator: `input[type="radio"][name="${name}"]`,
          confidence: label ? 0.9 : 0.5,
        });
      }
    }

    return groups;
  }

  private async getFieldLabel(input: Locator): Promise<string> {
    try {
      // Try aria-label first
      const ariaLabel = await input.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel;

      // Try associated label element
      const id = await input.getAttribute('id');
      if (id) {
        const label = await input.page().locator(`label[for="${id}"]`).first().textContent();
        if (label) return label.trim();
      }

      // Try parent label
      const parentLabel = await input.evaluate((el) => {
        const parent = el.closest('label');
        return parent ? parent.textContent?.trim() : null;
      });
      if (parentLabel) return parentLabel;

      // Try placeholder as last resort
      const placeholder = await input.getAttribute('placeholder');
      if (placeholder) return placeholder;

      return '';
    } catch {
      return '';
    }
  }

  private async getRadioGroupLabel(radio: Locator, name: string): Promise<string> {
    try {
      const ariaLabel = await radio.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel;
      const fieldset = await radio.evaluate((el) => {
        const fs = el.closest('fieldset');
        const legend = fs?.querySelector('legend');
        return legend?.textContent?.trim() || null;
      });
      if (fieldset) return fieldset;
      return name;
    } catch {
      return name;
    }
  }

  private async getRadioLabel(radio: Locator): Promise<string> {
    try {
      const id = await radio.getAttribute('id');
      if (id) {
        const label = await radio.page().locator(`label[for="${id}"]`).first().textContent();
        if (label) return label.trim();
      }
      const parentLabel = await radio.evaluate((el) => {
        const parent = el.closest('label');
        return parent ? parent.textContent?.trim() : null;
      });
      return parentLabel || '';
    } catch {
      return '';
    }
  }

  private async getHelpText(input: Locator): Promise<string | undefined> {
    try {
      const ariaDescribedBy = await input.getAttribute('aria-describedby');
      if (ariaDescribedBy) {
        const helpEl = await input.page().locator(`#${ariaDescribedBy}`).first().textContent();
        if (helpEl) return helpEl.trim();
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private async getSelectOptions(input: Locator): Promise<string[]> {
    try {
      const options = await input.locator('option').allTextContents();
      return options.map((o) => o.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  private determineFieldType(type: string, tagName: string): FieldType {
    if (tagName === 'textarea') return 'textarea';
    if (tagName === 'select') return 'select';
    switch (type.toLowerCase()) {
      case 'text': return 'text';
      case 'email': return 'email';
      case 'tel': return 'tel';
      case 'number': return 'number';
      case 'file': return 'file';
      case 'date': return 'date';
      case 'radio': return 'radio';
      case 'checkbox': return 'checkbox';
      default: return 'unknown';
    }
  }
}