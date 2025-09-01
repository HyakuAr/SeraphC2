/**
 * Cron Parser Utility for SeraphC2 Task Scheduler
 * Handles parsing and calculating next execution times for cron expressions
 */

export interface CronExpression {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

export interface CronField {
  type: 'wildcard' | 'specific' | 'range' | 'step' | 'list';
  values: number[];
  step?: number;
}

export class CronParser {
  private static readonly MINUTE_RANGE: [number, number] = [0, 59];
  private static readonly HOUR_RANGE: [number, number] = [0, 23];
  private static readonly DAY_OF_MONTH_RANGE: [number, number] = [1, 31];
  private static readonly MONTH_RANGE: [number, number] = [1, 12];
  private static readonly DAY_OF_WEEK_RANGE: [number, number] = [0, 6]; // 0 = Sunday

  private static readonly MONTH_NAMES: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };

  private static readonly DAY_NAMES: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };

  /**
   * Parse a cron expression string into a structured format
   */
  static parse(expression: string): CronExpression {
    const parts = expression.trim().split(/\s+/);

    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression: expected 5 fields, got ${parts.length}`);
    }

    return {
      minute: this.parseField(parts[0]!, this.MINUTE_RANGE),
      hour: this.parseField(parts[1]!, this.HOUR_RANGE),
      dayOfMonth: this.parseField(parts[2]!, this.DAY_OF_MONTH_RANGE),
      month: this.parseField(parts[3]!, this.MONTH_RANGE, this.MONTH_NAMES),
      dayOfWeek: this.parseField(parts[4]!, this.DAY_OF_WEEK_RANGE, this.DAY_NAMES),
    };
  }

  /**
   * Calculate the next execution time for a cron expression
   */
  static getNextExecution(expression: string, fromTime: Date = new Date()): Date {
    const cron = this.parse(expression);
    let nextTime = new Date(fromTime);

    // Start from the next minute to avoid immediate execution
    nextTime.setSeconds(0);
    nextTime.setMilliseconds(0);
    nextTime.setMinutes(nextTime.getMinutes() + 1);

    // Find the next valid time (with a reasonable limit to prevent infinite loops)
    let attempts = 0;
    const maxAttempts = 366 * 24 * 60; // One year worth of minutes

    while (attempts < maxAttempts) {
      if (this.isTimeValid(nextTime, cron)) {
        return nextTime;
      }

      // Increment by one minute and try again
      nextTime.setMinutes(nextTime.getMinutes() + 1);
      attempts++;
    }

    throw new Error('Could not find next execution time within reasonable timeframe');
  }

  /**
   * Check if a given time matches the cron expression
   */
  static isTimeValid(time: Date, cron: CronExpression): boolean {
    const minute = time.getMinutes();
    const hour = time.getHours();
    const dayOfMonth = time.getDate();
    const month = time.getMonth() + 1; // JavaScript months are 0-based
    const dayOfWeek = time.getDay();

    return (
      this.isFieldMatch(minute, cron.minute) &&
      this.isFieldMatch(hour, cron.hour) &&
      this.isFieldMatch(dayOfMonth, cron.dayOfMonth) &&
      this.isFieldMatch(month, cron.month) &&
      this.isFieldMatch(dayOfWeek, cron.dayOfWeek)
    );
  }

  /**
   * Validate a cron expression
   */
  static validate(expression: string): { valid: boolean; error?: string } {
    try {
      this.parse(expression);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid cron expression',
      };
    }
  }

  /**
   * Get human-readable description of a cron expression
   */
  static describe(expression: string): string {
    try {
      const cron = this.parse(expression);
      const parts: string[] = [];

      // Minute description
      if (cron.minute.type === 'wildcard') {
        parts.push('every minute');
      } else if (cron.minute.type === 'specific' && cron.minute.values.length === 1) {
        parts.push(`at minute ${cron.minute.values[0]}`);
      } else if (cron.minute.type === 'step') {
        parts.push(`every ${cron.minute.step} minutes`);
      } else {
        parts.push(`at minutes ${cron.minute.values.join(', ')}`);
      }

      // Hour description
      if (cron.hour.type !== 'wildcard') {
        if (cron.hour.type === 'specific' && cron.hour.values.length === 1) {
          const hour = cron.hour.values[0]!;
          const ampm =
            hour === 0
              ? '12 AM'
              : hour < 12
                ? `${hour} AM`
                : hour === 12
                  ? '12 PM'
                  : `${hour - 12} PM`;
          parts.push(`at ${ampm}`);
        } else {
          parts.push(`at hours ${cron.hour.values.join(', ')}`);
        }
      }

      // Day description
      if (cron.dayOfMonth.type !== 'wildcard' || cron.dayOfWeek.type !== 'wildcard') {
        if (cron.dayOfMonth.type !== 'wildcard') {
          parts.push(`on day(s) ${cron.dayOfMonth.values.join(', ')} of the month`);
        }
        if (cron.dayOfWeek.type !== 'wildcard') {
          const dayNames = [
            'Sunday',
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday',
          ];
          const days = cron.dayOfWeek.values.map(d => dayNames[d]).join(', ');
          parts.push(`on ${days}`);
        }
      }

      // Month description
      if (cron.month.type !== 'wildcard') {
        const monthNames = [
          '',
          'January',
          'February',
          'March',
          'April',
          'May',
          'June',
          'July',
          'August',
          'September',
          'October',
          'November',
          'December',
        ];
        const months = cron.month.values.map(m => monthNames[m]).join(', ');
        parts.push(`in ${months}`);
      }

      return parts.join(' ');
    } catch (error) {
      return 'Invalid cron expression';
    }
  }

  /**
   * Parse a single cron field
   */
  private static parseField(
    field: string,
    range: [number, number],
    nameMap?: Record<string, number>
  ): CronField {
    // Handle wildcards
    if (field === '*') {
      return {
        type: 'wildcard',
        values: this.generateRange(range[0], range[1]),
      };
    }

    // Handle step values (*/n or range/n)
    if (field.includes('/')) {
      const [baseField, stepStr] = field.split('/');
      const step = parseInt(stepStr!);

      if (isNaN(step) || step <= 0) {
        throw new Error(`Invalid step value: ${stepStr}`);
      }

      let baseValues: number[];
      if (baseField === '*') {
        baseValues = this.generateRange(range[0], range[1]);
      } else {
        const baseFieldParsed = this.parseField(baseField!, range, nameMap);
        baseValues = baseFieldParsed.values;
      }

      const stepValues = baseValues.filter((_, index) => index % step === 0);

      return {
        type: 'step',
        values: stepValues,
        step,
      };
    }

    // Handle ranges (n-m)
    if (field.includes('-')) {
      const [startStr, endStr] = field.split('-');
      const start = this.parseValue(startStr!, nameMap);
      const end = this.parseValue(endStr!, nameMap);

      if (start > end) {
        throw new Error(`Invalid range: ${field}`);
      }

      this.validateValue(start, range);
      this.validateValue(end, range);

      return {
        type: 'range',
        values: this.generateRange(start, end),
      };
    }

    // Handle lists (n,m,o)
    if (field.includes(',')) {
      const values = field.split(',').map(v => {
        const parsed = this.parseValue(v.trim(), nameMap);
        this.validateValue(parsed, range);
        return parsed;
      });

      return {
        type: 'list',
        values: values.sort((a, b) => a - b),
      };
    }

    // Handle specific values
    const value = this.parseValue(field, nameMap);
    this.validateValue(value, range);

    return {
      type: 'specific',
      values: [value],
    };
  }

  /**
   * Parse a single value (handling named values)
   */
  private static parseValue(value: string, nameMap?: Record<string, number>): number {
    const lowerValue = value.toLowerCase();

    if (nameMap && nameMap[lowerValue] !== undefined) {
      return nameMap[lowerValue];
    }

    const numValue = parseInt(value);
    if (isNaN(numValue)) {
      throw new Error(`Invalid value: ${value}`);
    }

    return numValue;
  }

  /**
   * Validate a value is within the allowed range
   */
  private static validateValue(value: number, range: [number, number]): void {
    if (value < range[0] || value > range[1]) {
      throw new Error(`Value ${value} is outside valid range ${range[0]}-${range[1]}`);
    }
  }

  /**
   * Generate a range of numbers
   */
  private static generateRange(start: number, end: number): number[] {
    const result: number[] = [];
    for (let i = start; i <= end; i++) {
      result.push(i);
    }
    return result;
  }

  /**
   * Check if a field value matches the cron field specification
   */
  private static isFieldMatch(value: number, field: CronField): boolean {
    return field.values.includes(value);
  }
}

/**
 * Common cron expression presets
 */
export const CronPresets = {
  EVERY_MINUTE: '* * * * *',
  EVERY_5_MINUTES: '*/5 * * * *',
  EVERY_15_MINUTES: '*/15 * * * *',
  EVERY_30_MINUTES: '*/30 * * * *',
  EVERY_HOUR: '0 * * * *',
  EVERY_2_HOURS: '0 */2 * * *',
  EVERY_6_HOURS: '0 */6 * * *',
  EVERY_12_HOURS: '0 */12 * * *',
  DAILY_AT_MIDNIGHT: '0 0 * * *',
  DAILY_AT_NOON: '0 12 * * *',
  WEEKLY_SUNDAY_MIDNIGHT: '0 0 * * 0',
  WEEKLY_MONDAY_9AM: '0 9 * * 1',
  MONTHLY_FIRST_DAY: '0 0 1 * *',
  YEARLY_JAN_FIRST: '0 0 1 1 *',
} as const;
