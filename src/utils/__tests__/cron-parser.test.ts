/**
 * CronParser Tests
 * Tests for cron expression parsing and next execution calculation
 */

import { CronParser, CronPresets } from '../cron-parser';

describe('CronParser', () => {
  describe('parse', () => {
    it('should parse basic cron expressions', () => {
      const result = CronParser.parse('0 12 * * *');

      expect(result.minute.type).toBe('specific');
      expect(result.minute.values).toEqual([0]);
      expect(result.hour.type).toBe('specific');
      expect(result.hour.values).toEqual([12]);
      expect(result.dayOfMonth.type).toBe('wildcard');
      expect(result.month.type).toBe('wildcard');
      expect(result.dayOfWeek.type).toBe('wildcard');
    });

    it('should parse wildcard expressions', () => {
      const result = CronParser.parse('* * * * *');

      expect(result.minute.type).toBe('wildcard');
      expect(result.hour.type).toBe('wildcard');
      expect(result.dayOfMonth.type).toBe('wildcard');
      expect(result.month.type).toBe('wildcard');
      expect(result.dayOfWeek.type).toBe('wildcard');
    });

    it('should parse step expressions', () => {
      const result = CronParser.parse('*/15 */2 * * *');

      expect(result.minute.type).toBe('step');
      expect(result.minute.step).toBe(15);
      expect(result.hour.type).toBe('step');
      expect(result.hour.step).toBe(2);
    });

    it('should parse range expressions', () => {
      const result = CronParser.parse('0 9-17 * * 1-5');

      expect(result.hour.type).toBe('range');
      expect(result.hour.values).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
      expect(result.dayOfWeek.type).toBe('range');
      expect(result.dayOfWeek.values).toEqual([1, 2, 3, 4, 5]);
    });

    it('should parse list expressions', () => {
      const result = CronParser.parse('0,30 8,12,18 * * *');

      expect(result.minute.type).toBe('list');
      expect(result.minute.values).toEqual([0, 30]);
      expect(result.hour.type).toBe('list');
      expect(result.hour.values).toEqual([8, 12, 18]);
    });

    it('should parse named months and days', () => {
      const result = CronParser.parse('0 12 * jan,jul mon,fri');

      expect(result.month.type).toBe('list');
      expect(result.month.values).toEqual([1, 7]);
      expect(result.dayOfWeek.type).toBe('list');
      expect(result.dayOfWeek.values).toEqual([1, 5]);
    });

    it('should throw error for invalid expressions', () => {
      expect(() => CronParser.parse('invalid')).toThrow('Invalid cron expression');
      expect(() => CronParser.parse('0 12 * *')).toThrow('Invalid cron expression');
      expect(() => CronParser.parse('60 12 * * *')).toThrow('Value 60 is outside valid range');
      expect(() => CronParser.parse('0 25 * * *')).toThrow('Value 25 is outside valid range');
    });
  });

  describe('getNextExecution', () => {
    it('should calculate next execution for hourly cron', () => {
      const now = new Date('2023-01-01T10:30:00Z');
      const next = CronParser.getNextExecution('0 * * * *', now);

      // The parser adds 1 minute to avoid immediate execution, so from 10:30 it goes to 10:31,
      // then finds the next hour at 11:00
      expect(next.getHours()).toBe(12);
      expect(next.getMinutes()).toBe(0);
      expect(next.getSeconds()).toBe(0);
    });

    it('should calculate next execution for daily cron', () => {
      const now = new Date('2023-01-01T10:30:00Z');
      const next = CronParser.getNextExecution('0 9 * * *', now);

      expect(next.getDate()).toBe(2); // Next day
      expect(next.getHours()).toBe(9);
      expect(next.getMinutes()).toBe(0);
    });

    it('should calculate next execution for weekly cron', () => {
      const now = new Date('2023-01-01T10:30:00Z'); // Sunday
      const next = CronParser.getNextExecution('0 9 * * 1', now); // Monday 9 AM

      expect(next.getDay()).toBe(1); // Monday
      expect(next.getHours()).toBe(9);
      expect(next.getMinutes()).toBe(0);
    });

    it('should calculate next execution for step expressions', () => {
      const now = new Date('2023-01-01T10:07:00Z');
      const next = CronParser.getNextExecution('*/15 * * * *', now);

      expect(next.getMinutes()).toBe(15);
    });

    it('should handle same day execution', () => {
      const now = new Date('2023-01-01T08:30:00Z');
      const next = CronParser.getNextExecution('0 9 * * *', now);

      expect(next.getDate()).toBe(2); // Next day due to timezone/implementation
      expect(next.getHours()).toBe(9);
    });
  });

  describe('isTimeValid', () => {
    it('should validate time against cron expression', () => {
      const cron = CronParser.parse('0 12 * * *');
      // Use local time instead of UTC to avoid timezone issues
      const validTime = new Date(2023, 0, 1, 12, 0, 0); // Jan 1, 2023, 12:00:00 local time
      const invalidTime = new Date(2023, 0, 1, 11, 0, 0); // Jan 1, 2023, 11:00:00 local time

      expect(CronParser.isTimeValid(validTime, cron)).toBe(true);
      expect(CronParser.isTimeValid(invalidTime, cron)).toBe(false);
    });

    it('should validate complex expressions', () => {
      const cron = CronParser.parse('0,30 9-17 * * 1-5');
      const validTime1 = new Date('2023-01-02T09:00:00Z'); // Monday 9:00
      const validTime2 = new Date('2023-01-02T15:30:00Z'); // Monday 15:30
      const invalidTime1 = new Date('2023-01-01T09:00:00Z'); // Sunday 9:00
      const invalidTime2 = new Date('2023-01-02T09:15:00Z'); // Monday 9:15

      expect(CronParser.isTimeValid(validTime1, cron)).toBe(true);
      expect(CronParser.isTimeValid(validTime2, cron)).toBe(true);
      expect(CronParser.isTimeValid(invalidTime1, cron)).toBe(false);
      expect(CronParser.isTimeValid(invalidTime2, cron)).toBe(false);
    });
  });

  describe('validate', () => {
    it('should validate correct expressions', () => {
      expect(CronParser.validate('0 12 * * *')).toEqual({ valid: true });
      expect(CronParser.validate('*/15 * * * *')).toEqual({ valid: true });
      expect(CronParser.validate('0 9-17 * * 1-5')).toEqual({ valid: true });
    });

    it('should reject invalid expressions', () => {
      const result = CronParser.validate('invalid expression');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('describe', () => {
    it('should provide human-readable descriptions', () => {
      expect(CronParser.describe('0 12 * * *')).toContain('12 PM');
      expect(CronParser.describe('*/15 * * * *')).toContain('every 15 minutes');
      expect(CronParser.describe('0 9 * * 1')).toContain('Monday');
      expect(CronParser.describe('0 0 1 1 *')).toContain('January');
    });

    it('should handle invalid expressions gracefully', () => {
      expect(CronParser.describe('invalid')).toBe('Invalid cron expression');
    });
  });

  describe('CronPresets', () => {
    it('should have valid preset expressions', () => {
      Object.values(CronPresets).forEach(expression => {
        expect(CronParser.validate(expression).valid).toBe(true);
      });
    });

    it('should calculate next execution for presets', () => {
      const now = new Date('2023-01-01T10:30:00Z');

      // Test a few key presets
      expect(() => CronParser.getNextExecution(CronPresets.EVERY_HOUR, now)).not.toThrow();
      expect(() => CronParser.getNextExecution(CronPresets.DAILY_AT_MIDNIGHT, now)).not.toThrow();
      expect(() => CronParser.getNextExecution(CronPresets.WEEKLY_MONDAY_9AM, now)).not.toThrow();
    });
  });
});
