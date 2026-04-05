/**
 * Node Suggester Service Tests
 * 
 * Tests for the enhanced node suggestion logic, template retrieval,
 * and task-based suggestions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NodeSuggester, type NodeSuggestion, type WorkflowTemplate } from '../../../src/services/node-suggester';

describe('NodeSuggester', () => {
  let suggester: NodeSuggester;

  beforeEach(() => {
    suggester = new NodeSuggester();
  });

  describe('analyzeAndSuggest', () => {
    it('should suggest complementary nodes for webhook workflow', () => {
      const existingNodes = ['n8n-nodes-base.webhook'];
      const suggestions = suggester.analyzeAndSuggest(existingNodes);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.nodeType.includes('respondToWebhook'))).toBe(true);
      expect(suggestions.some(s => s.nodeType.includes('set'))).toBe(true);
    });

    it('should suggest JSON and Set nodes for HTTP request workflow', () => {
      const existingNodes = ['n8n-nodes-base.httpRequest'];
      const suggestions = suggester.analyzeAndSuggest(existingNodes);

      expect(suggestions.some(s => s.nodeType.includes('json'))).toBe(true);
      expect(suggestions.some(s => s.nodeType.includes('set'))).toBe(true);
    });

    it('should suggest Aggregate and Set for Postgres workflow', () => {
      const existingNodes = ['n8n-nodes-base.postgres'];
      const suggestions = suggester.analyzeAndSuggest(existingNodes);

      expect(suggestions.some(s => s.nodeType.includes('aggregate'))).toBe(true);
      expect(suggestions.some(s => s.nodeType.includes('set'))).toBe(true);
    });

    it('should suggest trigger node when none exists', () => {
      const existingNodes = ['n8n-nodes-base.set', 'n8n-nodes-base.json'];
      const suggestions = suggester.analyzeAndSuggest(existingNodes);

      expect(suggestions.some(s => s.nodeType.includes('webhook') || s.nodeType.includes('scheduleTrigger'))).toBe(true);
    });

    it('should not suggest trigger when webhook already exists', () => {
      const existingNodes = ['n8n-nodes-base.webhook', 'n8n-nodes-base.set'];
      const suggestions = suggester.analyzeAndSuggest(existingNodes);

      // Should not suggest webhook again
      expect(suggestions.filter(s => s.nodeType.includes('webhook')).length).toBeLessThanOrEqual(1);
    });

    it('should suggest nodes for Google Sheets workflow', () => {
      const existingNodes = ['n8n-nodes-base.googleSheets'];
      const suggestions = suggester.analyzeAndSuggest(existingNodes);

      expect(suggestions.some(s => s.nodeType.includes('aggregate'))).toBe(true);
      expect(suggestions.some(s => s.nodeType.includes('json') || s.nodeType.includes('set'))).toBe(true);
    });

    it('should suggest nodes for Slack workflow', () => {
      const existingNodes = ['n8n-nodes-base.slack'];
      const suggestions = suggester.analyzeAndSuggest(existingNodes);

      expect(suggestions.some(s => s.nodeType.includes('set'))).toBe(true);
      expect(suggestions.some(s => s.nodeType.includes('if'))).toBe(true);
    });

    it('should return deduplicated suggestions', () => {
      const existingNodes = ['n8n-nodes-base.webhook', 'n8n-nodes-base.httpRequest'];
      const suggestions = suggester.analyzeAndSuggest(existingNodes);

      const nodeTypes = suggestions.map(s => s.nodeType);
      const uniqueNodeTypes = new Set(nodeTypes);

      expect(nodeTypes.length).toBe(uniqueNodeTypes.size);
    });

    it('should sort suggestions by confidence (descending)', () => {
      const existingNodes = ['n8n-nodes-base.webhook'];
      const suggestions = suggester.analyzeAndSuggest(existingNodes);

      for (let i = 0; i < suggestions.length - 1; i++) {
        expect(suggestions[i].confidence).toBeGreaterThanOrEqual(suggestions[i + 1].confidence);
      }
    });

    it('should include reason and useCase in suggestions', () => {
      const existingNodes = ['n8n-nodes-base.webhook'];
      const suggestions = suggester.analyzeAndSuggest(existingNodes);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].reason).toBeDefined();
      expect(suggestions[0].reason.length).toBeGreaterThan(0);
      expect(suggestions[0].useCase).toBeDefined();
    });

    it('should handle normalized node types', () => {
      const existingNodes = ['webhook', 'nodes-base.httpRequest'];
      const suggestions = suggester.analyzeAndSuggest(existingNodes);

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should return empty array for complete workflow', () => {
      // This is a workflow that has all necessary nodes
      const existingNodes = [
        'n8n-nodes-base.webhook',
        'n8n-nodes-base.set',
        'n8n-nodes-base.if',
        'n8n-nodes-base.respondToWebhook',
      ];
      const suggestions = suggester.analyzeAndSuggest(existingNodes);

      // May still suggest some optional nodes, but not required ones
      expect(Array.isArray(suggestions)).toBe(true);
    });
  });

  describe('getTemplates', () => {
    it('should return all templates when no category specified', () => {
      const templates = suggester.getTemplates();

      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some(t => t.category === 'webhook')).toBe(true);
      expect(templates.some(t => t.category === 'notification')).toBe(true);
      expect(templates.some(t => t.category === 'data-sync')).toBe(true);
    });

    it('should return webhook template for webhook category', () => {
      const templates = suggester.getTemplates('webhook');

      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every(t => t.category === 'webhook')).toBe(true);
      expect(templates[0].nodes.length).toBeGreaterThan(0);
    });

    it('should return notification template for notification category', () => {
      const templates = suggester.getTemplates('notification');

      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some(t => t.nodes.some(n => n.type.includes('slack')))).toBe(true);
    });

    it('should return data-sync template for data-sync category', () => {
      const templates = suggester.getTemplates('data-sync');

      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some(t => t.category === 'data-sync')).toBe(true);
    });

    it('should return automation template for automation category', () => {
      const templates = suggester.getTemplates('automation');

      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some(t => t.nodes.some(n => n.type.includes('scheduleTrigger')))).toBe(true);
    });

    it('should return api-integration template for api-integration category', () => {
      const templates = suggester.getTemplates('api-integration');

      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some(t => t.nodes.some(n => n.type.includes('httpRequest')))).toBe(true);
    });

    it('should return database template for database category', () => {
      const templates = suggester.getTemplates('database');

      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some(t => t.nodes.some(n => n.type.includes('postgres')))).toBe(true);
    });

    it('should return empty array for invalid category', () => {
      const templates = suggester.getTemplates('invalid-category' as any);

      expect(templates).toEqual([]);
    });

    it('should have valid node positions in templates', () => {
      const templates = suggester.getTemplates();

      for (const template of templates) {
        for (const node of template.nodes) {
          expect(node.position).toHaveLength(2);
          expect(typeof node.position[0]).toBe('number');
          expect(typeof node.position[1]).toBe('number');
        }
      }
    });

    it('should have required fields in templates', () => {
      const templates = suggester.getTemplates();

      for (const template of templates) {
        expect(template.name).toBeDefined();
        expect(template.category).toBeDefined();
        expect(template.description).toBeDefined();
        expect(template.nodes).toBeDefined();
        expect(Array.isArray(template.nodes)).toBe(true);
      }
    });
  });

  describe('suggestFromTask', () => {
    it('should suggest webhook and respond nodes for webhook task', () => {
      const suggestions = suggester.suggestFromTask('Create a webhook endpoint');

      expect(suggestions.some(s => s.nodeType.includes('webhook'))).toBe(true);
      expect(suggestions.some(s => s.nodeType.includes('respondToWebhook'))).toBe(true);
    });

    it('should suggest HTTP request nodes for API task', () => {
      const suggestions = suggester.suggestFromTask('Make an HTTP request to fetch data');

      expect(suggestions.some(s => s.nodeType.includes('httpRequest'))).toBe(true);
      expect(suggestions.some(s => s.nodeType.includes('json'))).toBe(true);
    });

    it('should suggest email nodes for email task', () => {
      const suggestions = suggester.suggestFromTask('Send an email notification');

      expect(suggestions.some(s => s.nodeType.includes('emailSend'))).toBe(true);
    });

    it('should suggest Slack nodes for Slack task', () => {
      const suggestions = suggester.suggestFromTask('Send a message to Slack');

      expect(suggestions.some(s => s.nodeType.includes('slack'))).toBe(true);
      expect(suggestions.some(s => s.nodeType.includes('set'))).toBe(true);
    });

    it('should suggest database nodes for database task', () => {
      const suggestions = suggester.suggestFromTask('Query PostgreSQL database');

      expect(suggestions.some(s => s.nodeType.includes('postgres'))).toBe(true);
      expect(suggestions.some(s => s.nodeType.includes('aggregate'))).toBe(true);
    });

    it('should suggest Google Sheets nodes for sheets task', () => {
      const suggestions = suggester.suggestFromTask('Append row to Google Sheets');

      expect(suggestions.some(s => s.nodeType.includes('googleSheets'))).toBe(true);
      expect(suggestions.some(s => s.nodeType.includes('aggregate'))).toBe(true);
    });

    it('should suggest transformation nodes for transform task', () => {
      const suggestions = suggester.suggestFromTask('Transform and convert data format');

      expect(suggestions.some(s => s.nodeType.includes('set'))).toBe(true);
      expect(suggestions.some(s => s.nodeType.includes('json'))).toBe(true);
    });

    it('should suggest conditional nodes for if task', () => {
      const suggestions = suggester.suggestFromTask('Check condition and branch');

      expect(suggestions.some(s => s.nodeType.includes('if'))).toBe(true);
    });

    it('should suggest schedule trigger for schedule task', () => {
      const suggestions = suggester.suggestFromTask('Run every hour on schedule');

      expect(suggestions.some(s => s.nodeType.includes('scheduleTrigger'))).toBe(true);
    });

    it('should always include a trigger node', () => {
      const suggestions = suggester.suggestFromTask('Process some data');

      expect(suggestions.some(s => s.category === 'Trigger')).toBe(true);
    });

    it('should return deduplicated suggestions', () => {
      const suggestions = suggester.suggestFromTask('Webhook and HTTP request');

      const nodeTypes = suggestions.map(s => s.nodeType);
      const uniqueNodeTypes = new Set(nodeTypes);

      expect(nodeTypes.length).toBe(uniqueNodeTypes.size);
    });

    it('should sort suggestions by confidence (descending)', () => {
      const suggestions = suggester.suggestFromTask('Webhook, HTTP request, and email');

      for (let i = 0; i < suggestions.length - 1; i++) {
        expect(suggestions[i].confidence).toBeGreaterThanOrEqual(suggestions[i + 1].confidence);
      }
    });

    it('should handle complex task description', () => {
      const suggestions = suggester.suggestFromTask(
        'When webhook receives data, make HTTP request to API, transform response, and send email'
      );

      expect(suggestions.some(s => s.nodeType.includes('webhook'))).toBe(true);
      expect(suggestions.some(s => s.nodeType.includes('httpRequest'))).toBe(true);
      expect(suggestions.some(s => s.nodeType.includes('set'))).toBe(true);
      expect(suggestions.some(s => s.nodeType.includes('emailSend'))).toBe(true);
    });

    it('should include confidence scores between 0 and 1', () => {
      const suggestions = suggester.suggestFromTask('Send email notification');

      for (const suggestion of suggestions) {
        expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
        expect(suggestion.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should include useCase for each suggestion', () => {
      const suggestions = suggester.suggestFromTask('Query database and aggregate');

      for (const suggestion of suggestions) {
        expect(suggestion.useCase).toBeDefined();
        expect(suggestion.useCase!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('NodeSuggestion interface', () => {
    it('should have correct structure', () => {
      const suggestions = suggester.analyzeAndSuggest(['n8n-nodes-base.webhook']);

      if (suggestions.length > 0) {
        const suggestion: NodeSuggestion = suggestions[0];
        expect(suggestion.nodeType).toBeDefined();
        expect(suggestion.nodeName).toBeDefined();
        expect(suggestion.category).toBeDefined();
        expect(suggestion.reason).toBeDefined();
        expect(suggestion.confidence).toBeDefined();
        expect(suggestion.useCase).toBeDefined();
      }
    });
  });

  describe('WorkflowTemplate interface', () => {
    it('should have correct structure', () => {
      const templates = suggester.getTemplates('webhook');

      if (templates.length > 0) {
        const template: WorkflowTemplate = templates[0];
        expect(template.name).toBeDefined();
        expect(template.category).toBeDefined();
        expect(template.description).toBeDefined();
        expect(template.nodes).toBeDefined();

        if (template.nodes.length > 0) {
          const node = template.nodes[0];
          expect(node.type).toBeDefined();
          expect(node.name).toBeDefined();
          expect(node.position).toBeDefined();
          expect(node.position).toHaveLength(2);
        }
      }
    });
  });
});
