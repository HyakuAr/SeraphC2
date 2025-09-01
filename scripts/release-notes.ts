#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  type: 'feature' | 'bugfix' | 'security' | 'performance' | 'documentation' | 'breaking' | 'other';
  scope?: string;
  issueNumber?: string;
}

interface ReleaseNotes {
  version: string;
  date: string;
  isPrerelease: boolean;
  summary: string;
  highlights: string[];
  features: CommitInfo[];
  bugfixes: CommitInfo[];
  security: CommitInfo[];
  breaking: CommitInfo[];
  other: CommitInfo[];
  contributors: string[];
  statistics: {
    totalCommits: number;
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
  };
}

class ReleaseNotesGenerator {
  private projectRoot: string;

  constructor() {
    this.projectRoot = process.cwd();
  }

  /**
   * Generate comprehensive release notes for a version
   */
  async generateReleaseNotes(
    version: string,
    fromTag?: string,
    outputFile?: string
  ): Promise<ReleaseNotes> {
    console.log(`🔄 Generating release notes for version ${version}...`);

    try {
      const commits = this.getCommitsSinceTag(fromTag);
      const releaseNotes = this.buildReleaseNotes(version, commits, fromTag);

      if (outputFile) {
        const formattedNotes = this.formatReleaseNotes(releaseNotes);
        writeFileSync(outputFile, formattedNotes, 'utf-8');
        console.log(`📝 Release notes written to ${outputFile}`);
      }

      console.log(`✅ Release notes generated successfully for version ${version}`);
      return releaseNotes;
    } catch (error) {
      console.error('❌ Error generating release notes:', error);
      throw error;
    }
  }

  /**
   * Get commits since a specific tag
   */
  private getCommitsSinceTag(fromTag?: string): CommitInfo[] {
    try {
      let gitCommand: string;

      if (fromTag) {
        try {
          execSync(`git rev-parse ${fromTag}`, { stdio: 'pipe' });
        } catch {
          console.warn(`⚠️  Tag ${fromTag} not found, using all commits`);
          fromTag = undefined;
        }
      }

      if (fromTag) {
        gitCommand = `git log ${fromTag}..HEAD --pretty=format:"%H|%h|%s|%an|%ad" --date=short`;
      } else {
        gitCommand = `git log --pretty=format:"%H|%h|%s|%an|%ad" --date=short`;
      }

      const output = execSync(gitCommand, {
        encoding: 'utf-8',
        cwd: this.projectRoot,
      });

      const commitLines = output
        .trim()
        .split('\n')
        .filter(line => line.length > 0);

      return commitLines.map(line => {
        const [hash, shortHash, message, author, date] = line.split('|');
        return this.parseCommit(hash, shortHash, message, author, date);
      });
    } catch (error) {
      console.error('Error getting git commits:', error);
      return [];
    }
  }

  /**
   * Parse commit information and categorize
   */
  private parseCommit(
    hash: string,
    shortHash: string,
    message: string,
    author: string,
    date: string
  ): CommitInfo {
    const commit: CommitInfo = {
      hash: hash.trim(),
      shortHash: shortHash.trim(),
      message: message.trim(),
      author: author.trim(),
      date: date.trim(),
      type: 'other',
    };

    // Extract issue number
    const issueMatch = message.match(/#(\d+)/);
    if (issueMatch) {
      commit.issueNumber = issueMatch[1];
    }

    // Parse conventional commit format
    const conventionalMatch = message.match(/^(\w+)(\(([^)]+)\))?(!)?:\s*(.+)$/);
    if (conventionalMatch) {
      const [, type, , scope, breaking, description] = conventionalMatch;
      commit.scope = scope;
      commit.message = description;

      if (breaking || message.includes('BREAKING CHANGE')) {
        commit.type = 'breaking';
      } else {
        switch (type.toLowerCase()) {
          case 'feat':
          case 'feature':
            commit.type = 'feature';
            break;
          case 'fix':
          case 'bugfix':
            commit.type = 'bugfix';
            break;
          case 'security':
          case 'sec':
            commit.type = 'security';
            break;
          case 'perf':
          case 'performance':
            commit.type = 'performance';
            break;
          case 'docs':
          case 'doc':
            commit.type = 'documentation';
            break;
          default:
            commit.type = 'other';
        }
      }
    } else {
      // Fallback to keyword matching
      const lowerMessage = message.toLowerCase();

      if (this.matchesKeywords(lowerMessage, ['feat:', 'feature:', 'add:', 'new:', 'implement'])) {
        commit.type = 'feature';
      } else if (
        this.matchesKeywords(lowerMessage, ['fix:', 'bug:', 'bugfix:', 'patch:', 'resolve'])
      ) {
        commit.type = 'bugfix';
      } else if (
        this.matchesKeywords(lowerMessage, [
          'security:',
          'sec:',
          'vulnerability:',
          'cve:',
          'exploit',
        ])
      ) {
        commit.type = 'security';
      } else if (
        this.matchesKeywords(lowerMessage, ['breaking:', 'break:', 'major:']) ||
        message.includes('BREAKING CHANGE')
      ) {
        commit.type = 'breaking';
      } else if (
        this.matchesKeywords(lowerMessage, ['perf:', 'performance:', 'optimize:', 'speed:'])
      ) {
        commit.type = 'performance';
      } else if (
        this.matchesKeywords(lowerMessage, ['docs:', 'doc:', 'documentation:', 'readme:'])
      ) {
        commit.type = 'documentation';
      }
    }

    return commit;
  }

  /**
   * Check if message matches keywords
   */
  private matchesKeywords(message: string, keywords: string[]): boolean {
    return keywords.some(keyword => message.includes(keyword));
  }

  /**
   * Build comprehensive release notes
   */
  private buildReleaseNotes(
    version: string,
    commits: CommitInfo[],
    fromTag?: string
  ): ReleaseNotes {
    const isPrerelease = version.includes('-');
    const date = new Date().toISOString().split('T')[0];

    // Categorize commits
    const features = commits.filter(c => c.type === 'feature');
    const bugfixes = commits.filter(c => c.type === 'bugfix');
    const security = commits.filter(c => c.type === 'security');
    const breaking = commits.filter(c => c.type === 'breaking');
    const other = commits.filter(
      c => !['feature', 'bugfix', 'security', 'breaking'].includes(c.type)
    );

    // Get unique contributors
    const contributors = [...new Set(commits.map(c => c.author))].sort();

    // Generate statistics
    const statistics = this.getStatistics(fromTag);

    // Generate highlights
    const highlights = this.generateHighlights(features, bugfixes, security, breaking);

    // Generate summary
    const summary = this.generateSummary(
      version,
      commits.length,
      features.length,
      bugfixes.length,
      security.length,
      breaking.length
    );

    return {
      version,
      date,
      isPrerelease,
      summary,
      highlights,
      features,
      bugfixes,
      security,
      breaking,
      other,
      contributors,
      statistics: {
        totalCommits: commits.length,
        ...statistics,
      },
    };
  }

  /**
   * Generate release highlights
   */
  private generateHighlights(
    features: CommitInfo[],
    bugfixes: CommitInfo[],
    security: CommitInfo[],
    breaking: CommitInfo[]
  ): string[] {
    const highlights: string[] = [];

    // Add breaking changes first
    if (breaking.length > 0) {
      highlights.push(
        `⚠️ **${breaking.length} breaking change${breaking.length > 1 ? 's' : ''}** - please review migration guide`
      );
    }

    // Add security fixes
    if (security.length > 0) {
      highlights.push(
        `🔒 **${security.length} security fix${security.length > 1 ? 'es' : ''}** - recommended upgrade`
      );
    }

    // Add major features (limit to top 3)
    const majorFeatures = features.slice(0, 3);
    majorFeatures.forEach(feature => {
      const scope = feature.scope ? `**${feature.scope}**: ` : '';
      highlights.push(`✨ ${scope}${feature.message}`);
    });

    // Add critical bug fixes (limit to top 2)
    const criticalBugfixes = bugfixes.slice(0, 2);
    criticalBugfixes.forEach(bugfix => {
      const scope = bugfix.scope ? `**${bugfix.scope}**: ` : '';
      highlights.push(`🐛 ${scope}${bugfix.message}`);
    });

    return highlights;
  }

  /**
   * Generate release summary
   */
  private generateSummary(
    version: string,
    totalCommits: number,
    features: number,
    bugfixes: number,
    security: number,
    breaking: number
  ): string {
    const isPrerelease = version.includes('-');
    let summary = `This ${isPrerelease ? 'pre-release' : 'release'} includes ${totalCommits} commit${totalCommits > 1 ? 's' : ''} with `;

    const changes: string[] = [];
    if (features > 0) changes.push(`${features} new feature${features > 1 ? 's' : ''}`);
    if (bugfixes > 0) changes.push(`${bugfixes} bug fix${bugfixes > 1 ? 'es' : ''}`);
    if (security > 0) changes.push(`${security} security fix${security > 1 ? 'es' : ''}`);
    if (breaking > 0) changes.push(`${breaking} breaking change${breaking > 1 ? 's' : ''}`);

    if (changes.length === 0) {
      summary += 'maintenance updates and improvements.';
    } else if (changes.length === 1) {
      summary += `${changes[0]}.`;
    } else if (changes.length === 2) {
      summary += `${changes[0]} and ${changes[1]}.`;
    } else {
      const lastChange = changes.pop();
      summary += `${changes.join(', ')}, and ${lastChange}.`;
    }

    return summary;
  }

  /**
   * Get git statistics
   */
  private getStatistics(fromTag?: string): {
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
  } {
    try {
      let gitCommand: string;

      if (fromTag) {
        gitCommand = `git diff --stat ${fromTag}..HEAD`;
      } else {
        gitCommand = `git diff --stat $(git rev-list --max-parents=0 HEAD)..HEAD`;
      }

      const output = execSync(gitCommand, {
        encoding: 'utf-8',
        cwd: this.projectRoot,
        stdio: 'pipe',
      });

      const lines = output.trim().split('\n');
      const summaryLine = lines[lines.length - 1];

      // Parse summary line like: "42 files changed, 1337 insertions(+), 420 deletions(-)"
      const match = summaryLine.match(
        /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/
      );

      if (match) {
        return {
          filesChanged: parseInt(match[1]) || 0,
          linesAdded: parseInt(match[2]) || 0,
          linesRemoved: parseInt(match[3]) || 0,
        };
      }
    } catch (error) {
      console.warn('Could not get git statistics:', error);
    }

    return { filesChanged: 0, linesAdded: 0, linesRemoved: 0 };
  }

  /**
   * Format release notes as markdown
   */
  private formatReleaseNotes(notes: ReleaseNotes): string {
    let content = `# SeraphC2 Release ${notes.version}\n\n`;

    if (notes.isPrerelease) {
      content += `⚠️ **This is a pre-release version**\n\n`;
    }

    content += `**Release Date:** ${notes.date}\n\n`;

    // Summary
    content += `## Summary\n\n${notes.summary}\n\n`;

    // Highlights
    if (notes.highlights.length > 0) {
      content += `## Highlights\n\n`;
      notes.highlights.forEach(highlight => {
        content += `${highlight}\n`;
      });
      content += '\n';
    }

    // Breaking Changes
    if (notes.breaking.length > 0) {
      content += `## ⚠️ Breaking Changes\n\n`;
      notes.breaking.forEach(commit => {
        content += this.formatCommitEntry(commit);
      });
      content += '\n';
    }

    // Security Fixes
    if (notes.security.length > 0) {
      content += `## 🔒 Security Fixes\n\n`;
      notes.security.forEach(commit => {
        content += this.formatCommitEntry(commit);
      });
      content += '\n';
    }

    // New Features
    if (notes.features.length > 0) {
      content += `## ✨ New Features\n\n`;
      notes.features.forEach(commit => {
        content += this.formatCommitEntry(commit);
      });
      content += '\n';
    }

    // Bug Fixes
    if (notes.bugfixes.length > 0) {
      content += `## 🐛 Bug Fixes\n\n`;
      notes.bugfixes.forEach(commit => {
        content += this.formatCommitEntry(commit);
      });
      content += '\n';
    }

    // Other Changes
    if (notes.other.length > 0) {
      content += `## 🔧 Other Changes\n\n`;
      notes.other.forEach(commit => {
        content += this.formatCommitEntry(commit);
      });
      content += '\n';
    }

    // Installation
    content += this.getInstallationSection(notes.version);

    // Statistics
    content += this.getStatisticsSection(notes);

    // Contributors
    if (notes.contributors.length > 0) {
      content += `## 👥 Contributors\n\n`;
      content += `Thank you to all contributors who made this release possible:\n\n`;
      notes.contributors.forEach(contributor => {
        content += `- ${contributor}\n`;
      });
      content += '\n';
    }

    // Footer
    content += this.getFooterSection();

    return content;
  }

  /**
   * Format individual commit entry
   */
  private formatCommitEntry(commit: CommitInfo): string {
    let entry = `- `;

    if (commit.scope) {
      entry += `**${commit.scope}**: `;
    }

    entry += commit.message;

    if (commit.issueNumber) {
      entry += ` (#${commit.issueNumber})`;
    }

    entry += ` ([${commit.shortHash}](../../commit/${commit.hash}))\n`;

    return entry;
  }

  /**
   * Get installation section
   */
  private getInstallationSection(version: string): string {
    return `## 📦 Installation

### Docker (Recommended)
\`\`\`bash
docker pull ghcr.io/seraphc2/seraphc2:${version}
\`\`\`

### From Source
\`\`\`bash
git clone https://github.com/YourOrg/SeraphC2.git
cd SeraphC2
git checkout v${version}
npm install
npm run build
\`\`\`

### Using npm
\`\`\`bash
npm install seraphc2@${version}
\`\`\`

`;
  }

  /**
   * Get statistics section
   */
  private getStatisticsSection(notes: ReleaseNotes): string {
    return `## 📊 Release Statistics

- **Total commits:** ${notes.statistics.totalCommits}
- **Files changed:** ${notes.statistics.filesChanged}
- **Lines added:** ${notes.statistics.linesAdded}
- **Lines removed:** ${notes.statistics.linesRemoved}
- **Contributors:** ${notes.contributors.length}

`;
  }

  /**
   * Get footer section
   */
  private getFooterSection(): string {
    return `## 🔗 Links

- [Full Changelog](../../compare/v1.0.0...HEAD)
- [Documentation](../../docs/)
- [Installation Guide](../../docs/installation/)
- [Configuration Guide](../../docs/configuration/)
- [API Documentation](../../docs/api/)
- [Security Policy](../../SECURITY.md)

## ⚠️ Security Notice

SeraphC2 is a security research tool intended for authorized testing only. Ensure you have proper authorization before using this tool in any environment. Review our [Security Policy](../../SECURITY.md) for vulnerability reporting procedures.

## 🆘 Support

If you encounter any issues:

1. Check our [troubleshooting guide](../../docs/troubleshooting/)
2. Search existing [issues](../../issues)
3. Create a new issue with detailed information

For security-related issues, please follow our [responsible disclosure policy](../../SECURITY.md).
`;
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
Usage: ts-node scripts/release-notes.ts <version> [from-tag] [output-file]

Examples:
  ts-node scripts/release-notes.ts 1.2.0
  ts-node scripts/release-notes.ts 1.2.0 v1.1.0
  ts-node scripts/release-notes.ts 1.2.0 v1.1.0 RELEASE_NOTES.md
  ts-node scripts/release-notes.ts 2.0.0-beta.1

Options:
  version       The version to generate release notes for (required)
  from-tag      Generate notes from this tag (optional, defaults to latest tag)
  output-file   Write formatted notes to this file (optional)
`);
    process.exit(1);
  }

  const version = args[0];
  const fromTag = args[1];
  const outputFile = args[2];

  const generator = new ReleaseNotesGenerator();

  // Validate version format
  if (!generator['validateVersion'](version)) {
    console.error(`❌ Invalid version format: ${version}`);
    console.error('Expected format: X.Y.Z or X.Y.Z-prerelease');
    process.exit(1);
  }

  try {
    const releaseNotes = await generator.generateReleaseNotes(version, fromTag, outputFile);

    if (!outputFile) {
      // Output to console if no file specified
      const formatted = generator['formatReleaseNotes'](releaseNotes);
      console.log('\n' + formatted);
    }
  } catch (error) {
    console.error('❌ Failed to generate release notes:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

export { ReleaseNotesGenerator, ReleaseNotes, CommitInfo };
