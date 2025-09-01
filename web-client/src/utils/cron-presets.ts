/**
 * Cron expression presets for common scheduling patterns
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
  DAILY_AT_6AM: '0 6 * * *',
  DAILY_AT_6PM: '0 18 * * *',
  WEEKLY_SUNDAY_MIDNIGHT: '0 0 * * 0',
  WEEKLY_MONDAY_9AM: '0 9 * * 1',
  WEEKLY_FRIDAY_5PM: '0 17 * * 5',
  MONTHLY_FIRST_DAY: '0 0 1 * *',
  MONTHLY_LAST_DAY: '0 0 L * *',
  YEARLY_JAN_FIRST: '0 0 1 1 *',
  WORKDAYS_9AM: '0 9 * * 1-5',
  WORKDAYS_5PM: '0 17 * * 1-5',
  WEEKEND_10AM: '0 10 * * 0,6',
} as const;
