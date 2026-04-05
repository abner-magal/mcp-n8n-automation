/**
 * Keyword Mapper Service
 * Maps natural language keywords to n8n node types for AI-powered workflow creation.
 */

import { z } from 'zod';

export interface KeywordMapping {
  keywords: string[];
  nodeType: string;
  category: string;
  priority: number;
}

export interface MappedNode {
  nodeType: string;
  nodeName: string;
  category: string;
  confidence: number;
  suggestedParams?: Record<string, unknown>;
}

const KeywordMappingSchema = z.object({
  keywords: z.array(z.string().min(1)),
  nodeType: z.string().min(1),
  category: z.string().min(1),
  priority: z.number().int().min(1).max(10),
});

const MappedNodeSchema = z.object({
  nodeType: z.string().min(1),
  nodeName: z.string().min(1),
  category: z.string().min(1),
  confidence: z.number().min(0).max(1),
  suggestedParams: z.record(z.unknown()).optional(),
});

export class KeywordMapper {
  private mappings: KeywordMapping[];

  constructor() {
    this.mappings = this.initializeMappings();
  }

  private initializeMappings(): KeywordMapping[] {
    const raw: Omit<KeywordMapping, 'priority'>[] = [
      // Triggers
      { keywords: ['webhook', 'http trigger', 'api trigger'], nodeType: 'n8n-nodes-base.webhook', category: 'Trigger' },
      { keywords: ['schedule', 'cron', 'timer', 'periodic'], nodeType: 'n8n-nodes-base.scheduleTrigger', category: 'Trigger' },
      { keywords: ['email received', 'receive email', 'email trigger'], nodeType: 'n8n-nodes-base.emailRead', category: 'Trigger' },

      // Core
      { keywords: ['http request', 'api call', 'fetch url', 'rest api', 'http get', 'http post'], nodeType: 'n8n-nodes-base.httpRequest', category: 'Core' },
      { keywords: ['code', 'javascript', 'python', 'script', 'run code'], nodeType: 'n8n-nodes-base.code', category: 'Core' },
      { keywords: ['rss', 'feed', 'rss feed'], nodeType: 'n8n-nodes-base.rssFeedRead', category: 'Core' },
      { keywords: ['chat', 'message', 'respond', 'chat response'], nodeType: 'n8n-nodes-base.respondToWebhook', category: 'Core' },
      { keywords: ['file', 'read file', 'write file', 'local file'], nodeType: 'n8n-nodes-base.readWriteFile', category: 'Core' },
      { keywords: ['date', 'time', 'format date', 'date time'], nodeType: 'n8n-nodes-base.dateTime', category: 'Core' },
      { keywords: ['mqtt', 'iot message', 'mqtt publish', 'mqtt subscribe'], nodeType: 'n8n-nodes-base.mqtt', category: 'Core' },

      // Flow
      { keywords: ['if', 'condition', 'branch', 'switch', 'decision'], nodeType: 'n8n-nodes-base.if', category: 'Flow' },
      { keywords: ['merge', 'join', 'combine'], nodeType: 'n8n-nodes-base.merge', category: 'Flow' },
      { keywords: ['wait', 'delay', 'sleep', 'pause'], nodeType: 'n8n-nodes-base.wait', category: 'Flow' },
      { keywords: ['error', 'catch', 'handle error', 'on error'], nodeType: 'n8n-nodes-base.stopAndError', category: 'Flow' },

      // Communication
      { keywords: ['email', 'send email', 'notify', 'send mail'], nodeType: 'n8n-nodes-base.emailSend', category: 'Communication' },
      { keywords: ['slack', 'message slack', 'slack message'], nodeType: 'n8n-nodes-base.slack', category: 'Communication' },
      { keywords: ['discord', 'send discord', 'discord message'], nodeType: 'n8n-nodes-base.discord', category: 'Communication' },
      { keywords: ['telegram', 'send telegram', 'telegram message'], nodeType: 'n8n-nodes-base.telegram', category: 'Communication' },

      // Database
      { keywords: ['database', 'query sql', 'postgres', 'postgresql', 'sql query'], nodeType: 'n8n-nodes-base.postgres', category: 'Database' },
      { keywords: ['mysql', 'mysql query', 'mysql database'], nodeType: 'n8n-nodes-base.mySql', category: 'Database' },
      { keywords: ['mongodb', 'mongo query', 'mongo database'], nodeType: 'n8n-nodes-base.mongoDb', category: 'Database' },

      // Apps
      { keywords: ['google sheets', 'spreadsheet', 'sheets', 'google sheet'], nodeType: 'n8n-nodes-base.googleSheets', category: 'Apps' },
      { keywords: ['github', 'create issue', 'github issue', 'github repo'], nodeType: 'n8n-nodes-base.github', category: 'Apps' },
      { keywords: ['notion', 'notion database', 'notion page'], nodeType: 'n8n-nodes-base.notion', category: 'Apps' },
      { keywords: ['airtable', 'airtable record', 'airtable base'], nodeType: 'n8n-nodes-base.airtable', category: 'Apps' },
      { keywords: ['google drive', 'drive upload', 'drive file'], nodeType: 'n8n-nodes-base.googleDrive', category: 'Apps' },

      // Transform
      { keywords: ['set', 'edit fields', 'transform', 'set fields', 'update fields'], nodeType: 'n8n-nodes-base.set', category: 'Transform' },
      { keywords: ['aggregate', 'summarize', 'sum', 'aggregate data'], nodeType: 'n8n-nodes-base.aggregate', category: 'Transform' },
      { keywords: ['json', 'parse json', 'json parse'], nodeType: 'n8n-nodes-base.json', category: 'Transform' },
      { keywords: ['html', 'extract html', 'html extract', 'scrape'], nodeType: 'n8n-nodes-base.html', category: 'Transform' },
      { keywords: ['xml', 'parse xml', 'xml parse'], nodeType: 'n8n-nodes-base.xml', category: 'Transform' },
      { keywords: ['csv', 'parse csv', 'csv parse'], nodeType: 'n8n-nodes-base.csv', category: 'Transform' },

      // Utility
      { keywords: ['zip', 'compress', 'compress file', 'gzip'], nodeType: 'n8n-nodes-base.compress', category: 'Utility' },
      { keywords: ['decrypt', 'encrypt', 'crypto', 'encryption'], nodeType: 'n8n-nodes-base.crypto', category: 'Utility' },
    ];

    const mappings: KeywordMapping[] = raw.map((item, index) => {
      const priority = this.calculatePriority(item);
      return KeywordMappingSchema.parse({
        ...item,
        priority,
      });
    });

    return mappings;
  }

  private calculatePriority(item: { keywords: string[]; category: string }): number {
    let priority = 5;

    if (item.category === 'Trigger') priority = 8;
    else if (item.category === 'Core') priority = 6;
    else if (item.category === 'Flow') priority = 7;
    else if (item.category === 'Communication') priority = 5;
    else if (item.category === 'Database') priority = 6;
    else if (item.category === 'Apps') priority = 4;
    else if (item.category === 'Transform') priority = 5;
    else if (item.category === 'Utility') priority = 3;

    if (item.keywords.length >= 4) priority += 1;

    return Math.max(1, Math.min(priority, 10));
  }

  mapKeywordsToNodes(taskDescription: string): MappedNode[] {
    const normalizedInput = taskDescription.toLowerCase().trim();

    if (!normalizedInput) {
      return [];
    }

    const scoredMappings = this.mappings
      .map((mapping) => {
        const { matchScore, matchedKeywords } = this.calculateMatchScore(normalizedInput, mapping);
        return { mapping, matchScore, matchedKeywords };
      })
      .filter((result) => result.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore);

    const uniqueNodes = new Map<string, MappedNode>();

    for (const { mapping, matchScore, matchedKeywords } of scoredMappings) {
      if (uniqueNodes.has(mapping.nodeType)) {
        const existing = uniqueNodes.get(mapping.nodeType)!;
        if (matchScore > existing.confidence) {
          uniqueNodes.set(mapping.nodeType, this.createMappedNode(mapping, matchScore, matchedKeywords));
        }
        continue;
      }
      uniqueNodes.set(mapping.nodeType, this.createMappedNode(mapping, matchScore, matchedKeywords));
    }

    return Array.from(uniqueNodes.values());
  }

  private calculateMatchScore(input: string, mapping: KeywordMapping): { matchScore: number; matchedKeywords: string[] } {
    const matchedKeywords: string[] = [];
    let totalScore = 0;

    for (const keyword of mapping.keywords) {
      const normalizedKeyword = keyword.toLowerCase();
      if (input.includes(normalizedKeyword)) {
        matchedKeywords.push(keyword);
        const wordCount = normalizedKeyword.split(/\s+/).length;
        totalScore += wordCount * 10;
      }
    }

    if (matchedKeywords.length === 0) {
      return { matchScore: 0, matchedKeywords: [] };
    }

    const keywordCoverage = matchedKeywords.length / mapping.keywords.length;
    const normalizedScore = Math.min(totalScore / 100, 1);

    const finalScore = normalizedScore * 0.6 + keywordCoverage * 0.4;

    return { matchScore: Math.min(finalScore, 1), matchedKeywords };
  }

  private createMappedNode(
    mapping: KeywordMapping,
    confidence: number,
    matchedKeywords: string[],
  ): MappedNode {
    const nodeName = this.generateNodeName(mapping, matchedKeywords);
    const suggestedParams = this.generateSuggestedParams(mapping, matchedKeywords);

    return MappedNodeSchema.parse({
      nodeType: mapping.nodeType,
      nodeName,
      category: mapping.category,
      confidence: Math.round(confidence * 100) / 100,
      suggestedParams,
    });
  }

  private generateNodeName(mapping: KeywordMapping, matchedKeywords: string[]): string {
    const categoryPrefix: Record<string, string> = {
      Trigger: 'Trigger',
      Core: 'Action',
      Flow: 'Flow',
      Communication: 'Send',
      Database: 'Query',
      Apps: 'Use',
      Transform: 'Transform',
      Utility: 'Utility',
    };

    const prefix = categoryPrefix[mapping.category] || 'Node';
    const shortType = mapping.nodeType.replace('n8n-nodes-base.', '');

    if (matchedKeywords.length > 0) {
      const primary = matchedKeywords[0];
      const words = primary.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1));
      return `${prefix} ${words.join(' ')}`;
    }

    return `${prefix} ${shortType}`;
  }

  private generateSuggestedParams(
    mapping: KeywordMapping,
    matchedKeywords: string[],
  ): Record<string, unknown> | undefined {
    const params: Record<string, unknown> = {};

    if (mapping.nodeType === 'n8n-nodes-base.webhook') {
      params.httpMethod = 'POST';
      params.path = 'webhook-path';
    } else if (mapping.nodeType === 'n8n-nodes-base.scheduleTrigger') {
      params.triggerTimes = { item: [{ mode: 'everyMinute' }] };
    } else if (mapping.nodeType === 'n8n-nodes-base.httpRequest') {
      params.method = 'GET';
      params.url = 'https://api.example.com';
    } else if (mapping.nodeType === 'n8n-nodes-base.emailSend') {
      params.toEmail = 'recipient@example.com';
      params.subject = 'Email Subject';
    } else if (mapping.nodeType === 'n8n-nodes-base.slack') {
      params.resource = 'message';
      params.operation = 'post';
    } else if (mapping.nodeType === 'n8n-nodes-base.if') {
      params.conditions = { options: { caseSensitive: true, leftValue: '', rightValue: '' } };
    }

    if (Object.keys(params).length === 0) {
      return undefined;
    }

    return params;
  }

  getMappings(): KeywordMapping[] {
    return this.mappings.map((m) => ({ ...m }));
  }

  getMappingCount(): number {
    return this.mappings.length;
  }

  getCategories(): string[] {
    const categories = new Set(this.mappings.map((m) => m.category));
    return Array.from(categories).sort();
  }

  getNodesByCategory(category: string): KeywordMapping[] {
    return this.mappings.filter((m) => m.category === category);
  }
}

// Singleton instance
let _keywordMapper: KeywordMapper | null = null;

/**
 * Get or create the KeywordMapper singleton.
 */
export function getKeywordMapper(): KeywordMapper {
  if (!_keywordMapper) {
    _keywordMapper = new KeywordMapper();
  }
  return _keywordMapper;
}

/**
 * Reset the KeywordMapper singleton (useful for testing).
 */
export function resetKeywordMapper(): void {
  _keywordMapper = null;
}
