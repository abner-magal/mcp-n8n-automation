/**
 * Tests for KeywordMapper service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { KeywordMapper } from '../../../src/services/keyword-mapper';

describe('KeywordMapper', () => {
  let mapper: KeywordMapper;

  beforeEach(() => {
    mapper = new KeywordMapper();
  });

  describe('constructor', () => {
    it('should initialize with at least 30 keyword mappings', () => {
      const count = mapper.getMappingCount();
      expect(count).toBeGreaterThanOrEqual(30);
    });

    it('should have mappings for all expected categories', () => {
      const categories = mapper.getCategories();
      expect(categories).toContain('Trigger');
      expect(categories).toContain('Core');
      expect(categories).toContain('Flow');
      expect(categories).toContain('Communication');
      expect(categories).toContain('Database');
      expect(categories).toContain('Apps');
      expect(categories).toContain('Transform');
      expect(categories).toContain('Utility');
    });
  });

  describe('getMappings', () => {
    it('should return a copy of mappings', () => {
      const mappings1 = mapper.getMappings();
      const mappings2 = mapper.getMappings();
      expect(mappings1).not.toBe(mappings2);
      expect(mappings1).toEqual(mappings2);
    });

    it('should return mappings with valid structure', () => {
      const mappings = mapper.getMappings();
      for (const mapping of mappings) {
        expect(mapping).toHaveProperty('keywords');
        expect(mapping).toHaveProperty('nodeType');
        expect(mapping).toHaveProperty('category');
        expect(mapping).toHaveProperty('priority');
        expect(Array.isArray(mapping.keywords)).toBe(true);
        expect(mapping.keywords.length).toBeGreaterThan(0);
        expect(mapping.priority).toBeGreaterThanOrEqual(1);
        expect(mapping.priority).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('mapKeywordsToNodes', () => {
    it('should return empty array for empty input', () => {
      const result = mapper.mapKeywordsToNodes('');
      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace-only input', () => {
      const result = mapper.mapKeywordsToNodes('   ');
      expect(result).toEqual([]);
    });

    it('should match webhook keywords', () => {
      const result = mapper.mapKeywordsToNodes('Create a webhook trigger');
      const webhookNodes = result.filter((n) =>
        n.nodeType.includes('webhook'),
      );
      expect(webhookNodes.length).toBeGreaterThan(0);
      expect(webhookNodes[0].confidence).toBeGreaterThan(0);
    });

    it('should match email keywords', () => {
      const result = mapper.mapKeywordsToNodes('Send an email notification');
      const emailNodes = result.filter((n) =>
        n.nodeType.includes('emailSend'),
      );
      expect(emailNodes.length).toBeGreaterThan(0);
      expect(emailNodes[0].confidence).toBeGreaterThan(0);
    });

    it('should match schedule trigger', () => {
      const result = mapper.mapKeywordsToNodes(
        'Run this on a schedule every hour',
      );
      const scheduleNodes = result.filter((n) =>
        n.nodeType.includes('scheduleTrigger'),
      );
      expect(scheduleNodes.length).toBeGreaterThan(0);
    });

    it('should match HTTP request keywords', () => {
      const result = mapper.mapKeywordsToNodes(
        'Make an API call to fetch data',
      );
      const httpNodes = result.filter((n) =>
        n.nodeType.includes('httpRequest'),
      );
      expect(httpNodes.length).toBeGreaterThan(0);
    });

    it('should perform case-insensitive matching', () => {
      const resultLower = mapper.mapKeywordsToNodes('send email');
      const resultUpper = mapper.mapKeywordsToNodes('SEND EMAIL');
      const resultMixed = mapper.mapKeywordsToNodes('Send Email');

      expect(resultLower.length).toBe(resultUpper.length);
      expect(resultLower.length).toBe(resultMixed.length);
    });

    it('should match multiple node types from a single description', () => {
      const result = mapper.mapKeywordsToNodes(
        'When webhook receives data, send email via slack',
      );
      const types = result.map((n) => n.nodeType);

      const hasTrigger = types.some((t) => t.includes('webhook'));
      const hasEmail = types.some((t) => t.includes('emailSend'));
      const hasSlack = types.some((t) => t.includes('slack'));

      expect(hasTrigger).toBe(true);
      expect(hasEmail).toBe(true);
      expect(hasSlack).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    it('should return unique node types', () => {
      const result = mapper.mapKeywordsToNodes(
        'webhook http trigger api call',
      );
      const uniqueTypes = new Set(result.map((n) => n.nodeType));
      expect(result.length).toBe(uniqueTypes.size);
    });

    it('should produce confidence scores between 0 and 1', () => {
      const result = mapper.mapKeywordsToNodes(
        'send email and also query postgres database',
      );
      for (const node of result) {
        expect(node.confidence).toBeGreaterThanOrEqual(0);
        expect(node.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should include suggested parameters for known node types', () => {
      const result = mapper.mapKeywordsToNodes('send email to user');
      const emailNode = result.find((n) => n.nodeType.includes('emailSend'));
      expect(emailNode).toBeDefined();
      expect(emailNode!.suggestedParams).toBeDefined();
      expect(emailNode!.suggestedParams).toHaveProperty('toEmail');
      expect(emailNode!.suggestedParams).toHaveProperty('subject');
    });

    it('should not return results for completely unrelated text', () => {
      const result = mapper.mapKeywordsToNodes(
        'xyzabc123 nonsense qwerty',
      );
      expect(result.length).toBe(0);
    });

    it('should match partial keywords', () => {
      const result = mapper.mapKeywordsToNodes(
        'I need to read from google sheets',
      );
      const sheetsNodes = result.filter((n) =>
        n.nodeType.includes('googleSheets'),
      );
      expect(sheetsNodes.length).toBeGreaterThan(0);
    });

    it('should include nodeName for all mapped nodes', () => {
      const result = mapper.mapKeywordsToNodes(
        'schedule trigger then http request',
      );
      for (const node of result) {
        expect(node.nodeName).toBeDefined();
        expect(node.nodeName.length).toBeGreaterThan(0);
      }
    });

    it('should include category for all mapped nodes', () => {
      const result = mapper.mapKeywordsToNodes('if condition then set fields');
      const categories = mapper.getCategories();
      for (const node of result) {
        expect(categories).toContain(node.category);
      }
    });
  });

  describe('getCategories', () => {
    it('should return sorted array of unique categories', () => {
      const categories = mapper.getCategories();
      const sorted = [...categories].sort();
      expect(categories).toEqual(sorted);
      expect(new Set(categories).size).toBe(categories.length);
    });
  });

  describe('getNodesByCategory', () => {
    it('should return nodes for a valid category', () => {
      const nodes = mapper.getNodesByCategory('Trigger');
      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) {
        expect(node.category).toBe('Trigger');
      }
    });

    it('should return empty array for invalid category', () => {
      const nodes = mapper.getNodesByCategory('NonExistent');
      expect(nodes).toEqual([]);
    });
  });
});
