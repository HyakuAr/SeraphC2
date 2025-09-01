#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface ChangelogEntry {
  type: 'feature' | 'bugfix' | 'security' | 'performance' | 'documentation' | 'breaking' | 'other';
  description: string;
  hash: string;
  author: string;
  date: string;
  issueNumber?: string;
}

interface ReleaseSection {
  added: ChangelogEntry[];
  changed: ChangelogEntry[];
  deprecated: ChangelogEntry[];
  removed: ChangelogEntry[];
  fixed: ChangelogEntry[];
  security: ChangelogEntry[];
}

class ChangelogGenerator {
  private projectRoot: string;
  private changelogPath: string;

  constructor() {
    this.projectRoot = process.cwd();
    this.changelogPath = join(this.projectRoot, 'CHANGELOG.md');
  }

  /**
   * Generate changelog for a specific version
   */
  async generateChangelog(version: string, fromTag?: string): Promise<void> {
    console.log(`🔄 Generating changelog for version ${version}...`);

    try {
      const commits = this.getCommitsSinceTag(fromTag);
      const categorizedCommits = this.categorizeCommits(commits);
      const changelogContent = this.formatChangelog(version, categorizedCommits);

      this.updateChangelogFile(changelogContent);

      console.log(`✅ Changelog generated successfully for version ${version}`);
      console.log(`📝 Updated ${this.changelogPath}`);
    } catch (error) {
      console.error('❌ Error generating changelog:', error);
      process.exit(1);
    }
  }

  /**
   * Get commits since a specific tag or from the beginning
   */
  private getCommitsSinceTag(fromTag?: string): string[] {
    try {
      let gitCommand: string;

      if (fromTag) {
        // Verify tag exists
        try {
          execSync(`git rev-parse ${fromTag}`, { stdio: 'pipe' });
        } catch {
          console.warn(`⚠️  Tag ${fromTag} not found, using all commits`);
          fromTag = undefined;
        }
      }

      if (fromTag) {
        gitCommand = `git log ${fromTag}..HEAD --pretty=format:"%H|%s|%an|%ad" --date=short`;
      } else {
        gitCommand = `git log --pretty=format:"%H|%s|%an|%ad" --date=short`;
      }

      const output = execSync(gitCommand, {
        encoding: 'utf-8',
        cwd: this.projectRoot,
      });

      return output
        .trim()
        .split('\n')
        .filter(line => line.length > 0);
    } catch (error) {
      console.error('Error getting git commits:', error);
      return [];
    }
  }

  /**
   * Categorize commits based on conventional commit format and keywords
   */
  private categorizeCommits(commits: string[]): ReleaseSection {
    const sections: ReleaseSection = {
      added: [],
      changed: [],
      deprecated: [],
      removed: [],
      fixed: [],
      security: [],
    };

    commits.forEach(commitLine => {
      const [hash, message, author, date] = commitLine.split('|');

      if (!hash || !message) return;

      const entry: ChangelogEntry = {
        type: 'other',
        description: message.trim(),
        hash: hash.substring(0, 7),
        author: author.trim(),
        date: date.trim(),
      };

      // Extract issue number if present
      const issueMatch = message.match(/#(\d+)/);
      if (issueMatch) {
        entry.issueNumber = issueMatch[1];
      }

      // Categorize based on conventional commits and keywords
      const lowerMessage = message.toLowerCase();

      if (this.matchesPattern(lowerMessage, ['feat:', 'feature:', 'add:', 'new:'])) {
        entry.type = 'feature';
        sections.added.push(entry);
      } else if (this.matchesPattern(lowerMessage, ['fix:', 'bug:', 'bugfix:', 'patch:'])) {
        entry.type = 'bugfix';
        sections.fixed.push(entry);
      } else if (
        this.matchesPattern(lowerMessage, ['security:', 'sec:', 'vulnerability:', 'cve:'])
      ) {
        entry.type = 'security';
        sections.security.push(entry);
      } else if (
        this.matchesPattern(lowerMessage, ['perf:', 'performance:', 'optimize:', 'speed:'])
      ) {
        entry.type = 'performance';
        sections.changed.push(entry);
      } else if (
        this.matchesPattern(lowerMessage, ['docs:', 'doc:', 'documentation:', 'readme:'])
      ) {
        entry.type = 'documentation';
        sections.changed.push(entry);
      } else if (
        this.matchesPattern(lowerMessage, ['breaking:', 'break:', 'major:']) ||
        message.includes('BREAKING CHANGE')
      ) {
        entry.type = 'breaking';
        sections.changed.push(entry);
      } else if (
        this.matchesPattern(lowerMessage, [
          'refactor:',
          'refact:',
          'restructure:',
          'change:',
          'update:',
          'modify:',
        ])
      ) {
        entry.type = 'other';
        sections.changed.push(entry);
      } else if (this.matchesPattern(lowerMessage, ['remove:', 'delete:', 'drop:'])) {
        entry.type = 'other';
        sections.removed.push(entry);
      } else if (this.matchesPattern(lowerMessage, ['deprecate:', 'deprecated:'])) {
        entry.type = 'other';
        sections.deprecated.push(entry);
      } else {
        // Default to changed for other commits
        sections.changed.push(entry);
      }
    });

    return sections;
  }

  /**
   * Check if message matches any of the patterns
   */
  private matchesPattern(message: string, patterns: string[]): boolean {
    return patterns.some(pattern => message.startsWith(pattern) || message.includes(pattern));
  }

  /**
   * Format changelog content
   */
  private formatChangelog(version: string, sections: ReleaseSection): string {
    const date = new Date().toISOString().split('T')[0];
    let content = `## [${version}] - ${date}\n\n`;

    // Add sections with content
    if (sections.added.length > 0) {
      content += '### Added\n\n';
      sections.added.forEach(entry => {
        content += this.formatChangelogEntry(entry);
      });
      content += '\n';
    }

    if (sections.changed.length > 0) {
      content += '### Changed\n\n';
      sections.changed.forEach(entry => {
        content += this.formatChangelogEntry(entry);
      });
      content += '\n';
    }

    if (sections.deprecated.length > 0) {
      content += '### Deprecated\n\n';
      sections.deprecated.forEach(entry => {
        content += this.formatChangelogEntry(entry);
      });
      content += '\n';
    }

    if (sections.removed.length > 0) {
      content += '### Removed\n\n';
      sections.removed.forEach(entry => {
        content += this.formatChangelogEntry(entry);
      });
      content += '\n';
    }

    if (sections.fixed.length > 0) {
      content += '### Fixed\n\n';
      sections.fixed.forEach(entry => {
        content += this.formatChangelogEntry(entry);
      });
      content += '\n';
    }

    if (sections.security.length > 0) {
      content += '### Security\n\n';
      sections.security.forEach(entry => {
        content += this.formatChangelogEntry(entry);
      });
      content += '\n';
    }

    return content;
  }

  /**
   * Format individual changelog entry
   */
  private formatChangelogEntry(entry: ChangelogEntry): string {
    let line = `- ${entry.description}`;

    if (entry.issueNumber) {
      line += ` (#${entry.issueNumber})`;
    }

    line += ` ([${entry.hash}](../../commit/${entry.hash.padEnd(40, '0')}))`;
    line += '\n';

    return line;
  }

  /**
   * Update the CHANGELOG.md file
   */
  private updateChangelogFile(newContent: string): void {
    let existingContent = '';

    if (existsSync(this.changelogPath)) {
      existingContent = readFileSync(this.changelogPath, 'utf-8');
    } else {
      // Create new changelog with header
      existingContent = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`;
    }

    // Find where to insert new content (after header, before first version)
    const lines = existingContent.split('\n');
    const insertIndex = lines.findIndex(line => line.startsWith('## [')) || lines.length;

    // Insert new content
    lines.splice(insertIndex, 0, newContent);

    const updatedContent = lines.join('\n');
    writeFileSync(this.changelogPath, updatedContent, 'utf-8');
  }

  /**
   * Get the latest tag from git
   */
  private getLatestTag(): string | undefined {
    try {
      const output = execSync('git describe --tags --abbrev=0', {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      return output.trim();
    } catch {
      return undefined;
    }
  }

  /**
   * Validate version format
   */
  private validateVersion(version: string): boolean {
    const semverRegex = /^(\d+)\.(\d+)\.(\d+)(-[a-zA-Z0-9]+(\.[0-9]+)?)?$/;
    return semverRegex.test(version);
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: ts-node scripts/generate-changelog.ts <version> [from-tag]

Examples:
  ts-node scripts/generate-changelog.ts 1.2.0
  ts-node scripts/generate-changelog.ts 1.2.0 v1.1.0
  ts-node scripts/generate-changelog.ts 2.0.0-beta.1

Options:
  version     The version to generate changelog for (required)
  from-tag    Generate changelog from this tag (optional, defaults to latest tag)
`);
    process.exit(1);
  }

  const version = args[0];
  const fromTag = args[1];

  const generator = new ChangelogGenerator();

  // Validate version format
  if (!generator['validateVersion'](version)) {
    console.error(`❌ Invalid version format: ${version}`);
    console.error('Expected format: X.Y.Z or X.Y.Z-prerelease');
    process.exit(1);
  }

  await generator.generateChangelog(version, fromTag);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

export { ChangelogGenerator };
