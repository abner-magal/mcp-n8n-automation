/**
 * Node Suggester Service
 * 
 * Analyzes existing workflow nodes and suggests complementary ones.
 * Provides categorized templates for common workflow patterns.
 */

export interface NodeSuggestion {
  nodeType: string;
  nodeName: string;
  category: string;
  reason: string;
  confidence: number;
  useCase?: string;
}

export interface WorkflowTemplate {
  name: string;
  category: string;
  description: string;
  nodes: Array<{
    type: string;
    name: string;
    position: [number, number];
  }>;
}

interface SuggestionRule {
  hasNodes: string[];
  missingNodes: string[];
  suggestions: NodeSuggestion[];
}

export class NodeSuggester {
  private suggestionRules: SuggestionRule[];
  private templates: WorkflowTemplate[];

  constructor() {
    this.suggestionRules = this.initializeSuggestionRules();
    this.templates = this.initializeTemplates();
  }

  /**
   * Analyze existing nodes and suggest complementary ones.
   */
  analyzeAndSuggest(existingNodes: string[]): NodeSuggestion[] {
    const suggestions: NodeSuggestion[] = [];
    const normalizedNodes = existingNodes.map(n => this.normalizeNodeType(n));

    // Check each suggestion rule
    for (const rule of this.suggestionRules) {
      // Check if ANY of the hasNodes match (not ALL)
      const hasAnyRequiredNode = rule.hasNodes.some(node =>
        normalizedNodes.some(n => n.includes(node) || node.includes(n))
      );

      if (hasAnyRequiredNode) {
        // Check which suggested nodes are missing
        for (const suggestion of rule.suggestions) {
          const isMissing = !normalizedNodes.some(n =>
            n.includes(suggestion.nodeType) || suggestion.nodeType.includes(n)
          );

          if (isMissing) {
            suggestions.push(suggestion);
          }
        }
      }
    }

    // Always suggest a trigger if none exists
    if (!this.hasTriggerNode(normalizedNodes)) {
      suggestions.unshift({
        nodeType: 'n8n-nodes-base.webhook',
        nodeName: 'Webhook',
        category: 'Trigger',
        reason: 'Workflow requires a trigger to execute',
        confidence: 0.95,
        useCase: 'Start workflow when HTTP request is received',
      });
    }

    // Deduplicate by nodeType
    const uniqueSuggestions = this.deduplicateByField(suggestions, 'nodeType');

    // Sort by confidence (descending)
    return uniqueSuggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get templates by category.
   */
  getTemplates(category?: string): WorkflowTemplate[] {
    if (!category) {
      return this.templates;
    }

    return this.templates.filter(t => t.category === category);
  }

  /**
   * Suggest nodes based on task description (without existing workflow).
   */
  suggestFromTask(taskDescription: string): NodeSuggestion[] {
    const suggestions: NodeSuggestion[] = [];
    const lowerDescription = taskDescription.toLowerCase();

    // Webhook/API tasks
    if (lowerDescription.includes('webhook') || lowerDescription.includes('api endpoint')) {
      suggestions.push(
        this.createSuggestion('n8n-nodes-base.webhook', 'Webhook', 'Trigger',
          'Receive HTTP requests from external systems', 0.95,
          'Start workflow when external service sends data'),
        this.createSuggestion('n8n-nodes-base.respondToWebhook', 'Respond to Webhook', 'Core',
          'Send immediate response to webhook caller', 0.85,
          'Return data to the service that triggered the webhook'),
      );
    }

    // HTTP Request tasks
    if (lowerDescription.includes('http request') || lowerDescription.includes('fetch') ||
        lowerDescription.includes('api call') || lowerDescription.includes('rest api')) {
      suggestions.push(
        this.createSuggestion('n8n-nodes-base.httpRequest', 'HTTP Request', 'Core',
          'Make HTTP requests to external APIs', 0.95,
          'Fetch data from REST API'),
        this.createSuggestion('n8n-nodes-base.json', 'JSON', 'Transform',
          'Parse JSON responses from HTTP requests', 0.80,
          'Extract data from API response body'),
        this.createSuggestion('n8n-nodes-base.set', 'Edit Fields', 'Transform',
          'Transform and shape data from API responses', 0.75,
          'Extract specific fields from API response'),
      );
    }

    // Email tasks
    if (lowerDescription.includes('email') || lowerDescription.includes('send mail') ||
        lowerDescription.includes('notification')) {
      suggestions.push(
        this.createSuggestion('n8n-nodes-base.emailSend', 'Send Email', 'Core',
          'Send email notifications', 0.90,
          'Notify users via email when events occur'),
      );
    }

    // Slack tasks
    if (lowerDescription.includes('slack')) {
      suggestions.push(
        this.createSuggestion('n8n-nodes-base.slack', 'Slack', 'Core',
          'Send messages to Slack channels', 0.90,
          'Post notifications to Slack channel'),
        this.createSuggestion('n8n-nodes-base.set', 'Edit Fields', 'Transform',
          'Format message content for Slack', 0.70,
          'Structure message payload for Slack API'),
      );
    }

    // Database tasks
    if (lowerDescription.includes('database') || lowerDescription.includes('postgres') ||
        lowerDescription.includes('mysql') || lowerDescription.includes('sql')) {
      suggestions.push(
        this.createSuggestion('n8n-nodes-base.postgres', 'Postgres', 'Core',
          'Query PostgreSQL database', 0.90,
          'Execute SQL queries against database'),
        this.createSuggestion('n8n-nodes-base.aggregate', 'Aggregate', 'Transform',
          'Aggregate query results', 0.70,
          'Group and summarize database records'),
      );
    }

    // Google Sheets tasks
    if (lowerDescription.includes('google sheets') || lowerDescription.includes('spreadsheet')) {
      suggestions.push(
        this.createSuggestion('n8n-nodes-base.googleSheets', 'Google Sheets', 'Core',
          'Read/write Google Sheets data', 0.90,
          'Append rows to spreadsheet'),
        this.createSuggestion('n8n-nodes-base.aggregate', 'Aggregate', 'Transform',
          'Aggregate sheet data', 0.65,
          'Summarize spreadsheet data'),
      );
    }

    // Data transformation tasks
    if (lowerDescription.includes('transform') || lowerDescription.includes('convert') ||
        lowerDescription.includes('format')) {
      suggestions.push(
        this.createSuggestion('n8n-nodes-base.set', 'Edit Fields', 'Transform',
          'Transform and modify data structure', 0.85,
          'Rename fields, calculate values, shape data'),
        this.createSuggestion('n8n-nodes-base.json', 'JSON', 'Transform',
          'Parse or generate JSON data', 0.75,
          'Convert data to/from JSON format'),
      );
    }

    // Conditional logic tasks
    if (lowerDescription.includes('if') || lowerDescription.includes('condition') ||
        lowerDescription.includes('branch') || lowerDescription.includes('filter')) {
      suggestions.push(
        this.createSuggestion('n8n-nodes-base.if', 'If', 'Flow',
          'Conditional branching based on conditions', 0.85,
          'Route data differently based on field values'),
      );
    }

    // Schedule tasks
    if (lowerDescription.includes('schedule') || lowerDescription.includes('cron') ||
        lowerDescription.includes('periodic') || lowerDescription.includes('every')) {
      suggestions.push(
        this.createSuggestion('n8n-nodes-base.scheduleTrigger', 'Schedule Trigger', 'Trigger',
          'Execute workflow on schedule', 0.90,
          'Run workflow daily/hourly/etc.'),
      );
    }

    // Error handling
    if (lowerDescription.includes('error') || lowerDescription.includes('fail') ||
        lowerDescription.includes('retry')) {
      suggestions.push(
        this.createSuggestion('n8n-nodes-base.stopAndError', 'Stop and Error', 'Flow',
          'Handle errors gracefully', 0.75,
          'Stop execution and report error'),
      );
    }

    // Always include a trigger if not already added
    if (!suggestions.some(s => s.category === 'Trigger')) {
      suggestions.unshift({
        nodeType: 'n8n-nodes-base.webhook',
        nodeName: 'Webhook',
        category: 'Trigger',
        reason: 'Workflow requires a trigger to execute',
        confidence: 0.80,
        useCase: 'Start workflow when event occurs',
      });
    }

    // Deduplicate and sort
    const uniqueSuggestions = this.deduplicateByField(suggestions, 'nodeType');
    return uniqueSuggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Initialize suggestion rules based on node combinations.
   */
  private initializeSuggestionRules(): SuggestionRule[] {
    return [
      // Webhook workflows
      {
        hasNodes: ['webhook'],
        missingNodes: [],
        suggestions: [
          this.createSuggestion('n8n-nodes-base.respondToWebhook', 'Respond to Webhook', 'Core',
            'Send immediate response to webhook caller', 0.90,
            'Return data to webhook sender'),
          this.createSuggestion('n8n-nodes-base.set', 'Edit Fields', 'Transform',
            'Process and transform webhook data', 0.85,
            'Extract fields from webhook payload'),
          this.createSuggestion('n8n-nodes-base.if', 'If', 'Flow',
            'Conditional processing based on webhook data', 0.75,
            'Route webhook data to different paths'),
        ],
      },
      // HTTP Request workflows
      {
        hasNodes: ['httprequest'],
        missingNodes: [],
        suggestions: [
          this.createSuggestion('n8n-nodes-base.json', 'JSON', 'Transform',
            'Parse JSON responses from HTTP requests', 0.85,
            'Extract data from API response'),
          this.createSuggestion('n8n-nodes-base.set', 'Edit Fields', 'Transform',
            'Transform API response data', 0.80,
            'Extract and reshape specific fields'),
          this.createSuggestion('n8n-nodes-base.if', 'If', 'Flow',
            'Error handling for failed API calls', 0.70,
            'Check HTTP status and handle errors'),
        ],
      },
      // Slack workflows
      {
        hasNodes: ['slack'],
        missingNodes: [],
        suggestions: [
          this.createSuggestion('n8n-nodes-base.set', 'Edit Fields', 'Transform',
            'Format message content for Slack', 0.80,
            'Structure Slack message payload'),
          this.createSuggestion('n8n-nodes-base.if', 'If', 'Flow',
            'Conditional message sending', 0.70,
            'Send message only if condition met'),
        ],
      },
      // Database workflows
      {
        hasNodes: ['postgres'],
        missingNodes: [],
        suggestions: [
          this.createSuggestion('n8n-nodes-base.aggregate', 'Aggregate', 'Transform',
            'Aggregate query results', 0.80,
            'Group and summarize database records'),
          this.createSuggestion('n8n-nodes-base.set', 'Edit Fields', 'Transform',
            'Transform query parameters and results', 0.75,
            'Format data for database insertion'),
          this.createSuggestion('n8n-nodes-base.if', 'If', 'Flow',
            'Conditional database operations', 0.65,
            'Execute queries only when conditions met'),
        ],
      },
      // Google Sheets workflows
      {
        hasNodes: ['googlesheets'],
        missingNodes: [],
        suggestions: [
          this.createSuggestion('n8n-nodes-base.aggregate', 'Aggregate', 'Transform',
            'Aggregate sheet data', 0.75,
            'Summarize spreadsheet rows'),
          this.createSuggestion('n8n-nodes-base.json', 'JSON', 'Transform',
            'Parse JSON data for sheet operations', 0.70,
            'Convert JSON to sheet format'),
          this.createSuggestion('n8n-nodes-base.set', 'Edit Fields', 'Transform',
            'Transform data before writing to sheets', 0.70,
            'Format data for spreadsheet'),
        ],
      },
      // Error handling (universal)
      {
        hasNodes: ['httprequest', 'postgres', 'googlesheets', 'slack', 'emailsend'],
        missingNodes: ['stopAndError', 'if'],
        suggestions: [
          this.createSuggestion('n8n-nodes-base.if', 'If', 'Flow',
            'Conditional error handling', 0.70,
            'Check for errors and handle gracefully'),
        ],
      },
    ];
  }

  /**
   * Initialize workflow templates by category.
   */
  private initializeTemplates(): WorkflowTemplate[] {
    return [
      // Webhook template
      {
        name: 'Webhook Processing',
        category: 'webhook',
        description: 'Receive webhook, process data, and respond',
        nodes: [
          { type: 'n8n-nodes-base.webhook', name: 'Webhook', position: [100, 300] },
          { type: 'n8n-nodes-base.set', name: 'Transform Data', position: [350, 300] },
          { type: 'n8n-nodes-base.if', name: 'Validate', position: [600, 300] },
          { type: 'n8n-nodes-base.respondToWebhook', name: 'Respond', position: [850, 200] },
        ],
      },
      // Notification template
      {
        name: 'Notification Workflow',
        category: 'notification',
        description: 'Trigger, process, and send notification (Slack/Email/Discord)',
        nodes: [
          { type: 'n8n-nodes-base.scheduleTrigger', name: 'Schedule', position: [100, 300] },
          { type: 'n8n-nodes-base.httpRequest', name: 'Fetch Data', position: [350, 300] },
          { type: 'n8n-nodes-base.set', name: 'Format Message', position: [600, 300] },
          { type: 'n8n-nodes-base.slack', name: 'Send to Slack', position: [850, 200] },
        ],
      },
      // Data sync template
      {
        name: 'Data Synchronization',
        category: 'data-sync',
        description: 'Source → Transform → Destination',
        nodes: [
          { type: 'n8n-nodes-base.scheduleTrigger', name: 'Schedule', position: [100, 300] },
          { type: 'n8n-nodes-base.postgres', name: 'Query Source', position: [350, 300] },
          { type: 'n8n-nodes-base.set', name: 'Transform', position: [600, 300] },
          { type: 'n8n-nodes-base.googleSheets', name: 'Write to Sheets', position: [850, 300] },
        ],
      },
      // Automation template
      {
        name: 'Scheduled Automation',
        category: 'automation',
        description: 'Schedule → Fetch → Process → Store',
        nodes: [
          { type: 'n8n-nodes-base.scheduleTrigger', name: 'Schedule', position: [100, 300] },
          { type: 'n8n-nodes-base.httpRequest', name: 'Fetch API', position: [350, 300] },
          { type: 'n8n-nodes-base.json', name: 'Parse JSON', position: [600, 300] },
          { type: 'n8n-nodes-base.set', name: 'Transform', position: [850, 300] },
          { type: 'n8n-nodes-base.postgres', name: 'Store Data', position: [1100, 300] },
        ],
      },
      // API integration template
      {
        name: 'API Integration',
        category: 'api-integration',
        description: 'Webhook → HTTP Request → Transform → Response',
        nodes: [
          { type: 'n8n-nodes-base.webhook', name: 'Webhook', position: [100, 300] },
          { type: 'n8n-nodes-base.httpRequest', name: 'Call API', position: [350, 300] },
          { type: 'n8n-nodes-base.set', name: 'Transform Response', position: [600, 300] },
          { type: 'n8n-nodes-base.respondToWebhook', name: 'Respond', position: [850, 300] },
        ],
      },
      // Database template
      {
        name: 'Database Workflow',
        category: 'database',
        description: 'Trigger → Query → Aggregate → Output',
        nodes: [
          { type: 'n8n-nodes-base.scheduleTrigger', name: 'Schedule', position: [100, 300] },
          { type: 'n8n-nodes-base.postgres', name: 'Query Database', position: [350, 300] },
          { type: 'n8n-nodes-base.aggregate', name: 'Aggregate Results', position: [600, 300] },
          { type: 'n8n-nodes-base.set', name: 'Format Output', position: [850, 300] },
        ],
      },
    ];
  }

  /**
   * Create a standardized node suggestion.
   */
  private createSuggestion(
    nodeType: string,
    nodeName: string,
    category: string,
    reason: string,
    confidence: number,
    useCase: string,
  ): NodeSuggestion {
    return {
      nodeType,
      nodeName,
      category,
      reason,
      confidence,
      useCase,
    };
  }

  /**
   * Normalize node type for comparison.
   */
  private normalizeNodeType(nodeType: string): string {
    return nodeType
      .toLowerCase()
      .replace('n8n-nodes-base.', '')
      .replace('nodes-base.', '')
      .replace('nodes-langchain.', '')
      .trim();
  }

  /**
   * Check if workflow has a trigger node.
   */
  private hasTriggerNode(normalizedNodes: string[]): boolean {
    const triggerKeywords = ['webhook', 'schedule', 'trigger', 'emailRead', 'poll'];
    return normalizedNodes.some(node =>
      triggerKeywords.some(keyword => node.includes(keyword))
    );
  }

  /**
   * Deduplicate array by field.
   */
  private deduplicateByField<T>(array: T[], field: keyof T): T[] {
    const seen = new Set();
    return array.filter(item => {
      const value = item[field];
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
  }
}

/**
 * Singleton instance.
 */
let instance: NodeSuggester | null = null;

export function getNodeSuggester(): NodeSuggester {
  if (!instance) {
    instance = new NodeSuggester();
  }
  return instance;
}

/**
 * Reset the NodeSuggester singleton (useful for testing).
 */
export function resetNodeSuggester(): void {
  instance = null;
}
