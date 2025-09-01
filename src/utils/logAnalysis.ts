/**
 * SeraphC2 Log Analysis Utility
 * Provides log analysis, monitoring, and alerting capabilities
 */

import fs from 'fs';
import path from 'path';
import { log, LogCategory } from './logger';

export interface LogAnalysisResult {
  totalEntries: number;
  errorCount: number;
  warningCount: number;
  securityEvents: number;
  performanceIssues: number;
  topErrors: Array<{ message: string; count: number }>;
  topIPs: Array<{ ip: string; count: number }>;
  averageResponseTime: number;
  slowestRequests: Array<{ url: string; duration: number; timestamp: string }>;
}

export interface SecurityAlert {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  details: Record<string, any>;
}

export class LogAnalyzer {
  private logsDir: string;
  private alertThresholds: Record<string, number>;

  constructor(logsDir: string = path.join(process.cwd(), 'logs')) {
    this.logsDir = logsDir;
    this.alertThresholds = {
      failedLogins: parseInt(process.env['ALERT_FAILED_LOGINS_THRESHOLD'] || '10'),
      errorRate: parseFloat(process.env['ALERT_ERROR_RATE_THRESHOLD'] || '0.05'), // 5%
      responseTime: parseInt(process.env['ALERT_RESPONSE_TIME_THRESHOLD'] || '5000'), // 5 seconds
      securityEvents: parseInt(process.env['ALERT_SECURITY_EVENTS_THRESHOLD'] || '5'),
    };
  }

  /**
   * Analyze logs from the last specified hours
   */
  public async analyzeLogs(hours: number = 24): Promise<LogAnalysisResult> {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const logEntries = await this.readLogEntries(cutoffTime);

    const result: LogAnalysisResult = {
      totalEntries: logEntries.length,
      errorCount: 0,
      warningCount: 0,
      securityEvents: 0,
      performanceIssues: 0,
      topErrors: [],
      topIPs: [],
      averageResponseTime: 0,
      slowestRequests: [],
    };

    const errorMessages = new Map<string, number>();
    const ipCounts = new Map<string, number>();
    const responseTimes: number[] = [];
    const slowRequests: Array<{ url: string; duration: number; timestamp: string }> = [];

    for (const entry of logEntries) {
      // Count log levels
      if (entry.level === 'ERROR') {
        result.errorCount++;
        const message = entry.message || 'Unknown error';
        errorMessages.set(message, (errorMessages.get(message) || 0) + 1);
      } else if (entry.level === 'WARN') {
        result.warningCount++;
      }

      // Count security events
      if (entry.metadata?.category === LogCategory.SECURITY) {
        result.securityEvents++;
      }

      // Track IP addresses
      if (entry.metadata?.ip) {
        const ip = entry.metadata.ip as string;
        ipCounts.set(ip, (ipCounts.get(ip) || 0) + 1);
      }

      // Track response times
      if (entry.metadata?.duration_ms) {
        const duration = entry.metadata.duration_ms as number;
        responseTimes.push(duration);

        if (duration > this.alertThresholds.responseTime) {
          result.performanceIssues++;
          slowRequests.push({
            url: (entry.metadata.http_path as string) || 'unknown',
            duration,
            timestamp: entry['@timestamp'] || entry.timestamp,
          });
        }
      }
    }

    // Calculate top errors
    result.topErrors = Array.from(errorMessages.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([message, count]) => ({ message, count }));

    // Calculate top IPs
    result.topIPs = Array.from(ipCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }));

    // Calculate average response time
    if (responseTimes.length > 0) {
      result.averageResponseTime =
        responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    }

    // Get slowest requests
    result.slowestRequests = slowRequests.sort((a, b) => b.duration - a.duration).slice(0, 10);

    return result;
  }

  /**
   * Generate security alerts based on log analysis
   */
  public async generateSecurityAlerts(hours: number = 1): Promise<SecurityAlert[]> {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const logEntries = await this.readLogEntries(cutoffTime);
    const alerts: SecurityAlert[] = [];

    // Track security events
    const securityEvents = new Map<
      string,
      {
        count: number;
        firstSeen: Date;
        lastSeen: Date;
        details: any[];
      }
    >();

    const failedLogins = new Map<string, number>();
    const suspiciousIPs = new Map<string, number>();

    for (const entry of logEntries) {
      const timestamp = new Date(entry['@timestamp'] || entry.timestamp);

      // Track failed login attempts
      if (
        entry.metadata?.auth_event === 'login_failure' ||
        entry.message?.includes('failed_login_attempt')
      ) {
        const ip = (entry.metadata?.ip as string) || 'unknown';
        failedLogins.set(ip, (failedLogins.get(ip) || 0) + 1);
      }

      // Track security events
      if (entry.metadata?.category === LogCategory.SECURITY) {
        const eventType = (entry.metadata.event_type as string) || 'unknown_security_event';
        const existing = securityEvents.get(eventType);

        if (existing) {
          existing.count++;
          existing.lastSeen = timestamp;
          existing.details.push(entry.metadata);
        } else {
          securityEvents.set(eventType, {
            count: 1,
            firstSeen: timestamp,
            lastSeen: timestamp,
            details: [entry.metadata],
          });
        }
      }

      // Track suspicious activity
      if (
        entry.metadata?.event_type === 'suspicious_activity' ||
        entry.message?.includes('suspicious')
      ) {
        const ip = (entry.metadata?.ip as string) || 'unknown';
        suspiciousIPs.set(ip, (suspiciousIPs.get(ip) || 0) + 1);
      }
    }

    // Generate alerts for failed logins
    for (const [ip, count] of failedLogins.entries()) {
      if (count >= this.alertThresholds.failedLogins) {
        alerts.push({
          type: 'failed_login_attempts',
          severity: count >= this.alertThresholds.failedLogins * 2 ? 'high' : 'medium',
          message: `High number of failed login attempts from IP ${ip}`,
          count,
          firstSeen: cutoffTime,
          lastSeen: new Date(),
          details: { ip, threshold: this.alertThresholds.failedLogins },
        });
      }
    }

    // Generate alerts for security events
    for (const [eventType, data] of securityEvents.entries()) {
      if (data.count >= this.alertThresholds.securityEvents) {
        alerts.push({
          type: eventType,
          severity: this.getSecurityEventSeverity(eventType, data.count),
          message: `Multiple security events detected: ${eventType}`,
          count: data.count,
          firstSeen: data.firstSeen,
          lastSeen: data.lastSeen,
          details: { eventType, samples: data.details.slice(0, 5) },
        });
      }
    }

    // Generate alerts for suspicious IPs
    for (const [ip, count] of suspiciousIPs.entries()) {
      if (count >= 5) {
        alerts.push({
          type: 'suspicious_activity',
          severity: count >= 20 ? 'critical' : 'high',
          message: `Suspicious activity detected from IP ${ip}`,
          count,
          firstSeen: cutoffTime,
          lastSeen: new Date(),
          details: { ip },
        });
      }
    }

    return alerts;
  }

  /**
   * Monitor logs in real-time and trigger alerts
   */
  public startRealTimeMonitoring(): void {
    const combinedLogFile = path.join(this.logsDir, 'combined.log');

    if (!fs.existsSync(combinedLogFile)) {
      log.warn('Combined log file not found, real-time monitoring disabled', {
        file: combinedLogFile,
      });
      return;
    }

    // Watch for file changes
    fs.watchFile(combinedLogFile, { interval: 1000 }, async () => {
      try {
        const alerts = await this.generateSecurityAlerts(0.1); // Check last 6 minutes

        for (const alert of alerts) {
          this.triggerAlert(alert);
        }
      } catch (error) {
        log.error(
          'Error in real-time log monitoring',
          error instanceof Error ? error : new Error('Unknown error')
        );
      }
    });

    log.info('Real-time log monitoring started', {
      file: combinedLogFile,
      category: LogCategory.SYSTEM,
    });
  }

  /**
   * Generate log summary report
   */
  public async generateReport(hours: number = 24): Promise<string> {
    const analysis = await this.analyzeLogs(hours);
    const alerts = await this.generateSecurityAlerts(hours);

    const report = `
# SeraphC2 Log Analysis Report
Generated: ${new Date().toISOString()}
Analysis Period: Last ${hours} hours

## Summary
- Total Log Entries: ${analysis.totalEntries}
- Error Count: ${analysis.errorCount}
- Warning Count: ${analysis.warningCount}
- Security Events: ${analysis.securityEvents}
- Performance Issues: ${analysis.performanceIssues}
- Average Response Time: ${Math.round(analysis.averageResponseTime)}ms

## Top Errors
${analysis.topErrors.map(error => `- ${error.message}: ${error.count} occurrences`).join('\n')}

## Top IP Addresses
${analysis.topIPs.map(ip => `- ${ip.ip}: ${ip.count} requests`).join('\n')}

## Slowest Requests
${analysis.slowestRequests.map(req => `- ${req.url}: ${req.duration}ms at ${req.timestamp}`).join('\n')}

## Security Alerts
${
  alerts.length === 0
    ? 'No security alerts'
    : alerts
        .map(
          alert =>
            `- [${alert.severity.toUpperCase()}] ${alert.message} (${alert.count} occurrences)`
        )
        .join('\n')
}

## Recommendations
${this.generateRecommendations(analysis, alerts).join('\n')}
`;

    return report;
  }

  /**
   * Read log entries from files
   */
  private async readLogEntries(cutoffTime: Date): Promise<any[]> {
    const entries: any[] = [];

    try {
      const files = fs
        .readdirSync(this.logsDir)
        .filter(file => file.endsWith('.log') && !file.includes('audit'))
        .map(file => path.join(this.logsDir, file));

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            const entryTime = new Date(entry['@timestamp'] || entry.timestamp);

            if (entryTime >= cutoffTime) {
              entries.push(entry);
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    } catch (error) {
      log.error(
        'Error reading log files',
        error instanceof Error ? error : new Error('Unknown error')
      );
    }

    return entries.sort(
      (a, b) =>
        new Date(a['@timestamp'] || a.timestamp).getTime() -
        new Date(b['@timestamp'] || b.timestamp).getTime()
    );
  }

  /**
   * Determine severity of security events
   */
  private getSecurityEventSeverity(
    eventType: string,
    count: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    const criticalEvents = ['privilege_escalation', 'data_access_violation', 'brute_force_attempt'];
    const highEvents = ['authentication_failure', 'authorization_failure', 'suspicious_activity'];

    if (criticalEvents.includes(eventType) || count >= 50) {
      return 'critical';
    } else if (highEvents.includes(eventType) || count >= 20) {
      return 'high';
    } else if (count >= 10) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Trigger alert notification
   */
  private triggerAlert(alert: SecurityAlert): void {
    log.security(`ALERT_TRIGGERED: ${alert.type}`, {
      severity: alert.severity,
      message: alert.message,
      count: alert.count,
      details: alert.details,
    });

    // Here you could integrate with external alerting systems
    // such as email, Slack, PagerDuty, etc.
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(analysis: LogAnalysisResult, alerts: SecurityAlert[]): string[] {
    const recommendations: string[] = [];

    if (analysis.errorCount > analysis.totalEntries * 0.05) {
      recommendations.push(
        '- High error rate detected. Review application stability and error handling.'
      );
    }

    if (analysis.averageResponseTime > 2000) {
      recommendations.push('- Average response time is high. Consider performance optimization.');
    }

    if (analysis.securityEvents > 10) {
      recommendations.push(
        '- Multiple security events detected. Review security policies and access controls.'
      );
    }

    if (alerts.some(alert => alert.severity === 'critical')) {
      recommendations.push(
        '- Critical security alerts detected. Immediate investigation required.'
      );
    }

    if (analysis.topIPs.some(ip => ip.count > 1000)) {
      recommendations.push(
        '- High request volume from specific IPs. Consider rate limiting or IP blocking.'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('- No immediate issues detected. Continue monitoring.');
    }

    return recommendations;
  }
}
