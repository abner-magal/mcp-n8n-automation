/**
 * Create a minimal nodes.db file for E2E testing.
 * This script creates a database with the core schema but WITHOUT FTS5 tables,
 * since sql.js doesn't support the FTS5 extension.
 * 
 * Usage: npx tsx tests/e2e/create-minimal-db.ts
 */
import { createDatabaseAdapter } from '../../src/database/database-adapter';
import * as fs from 'fs';
import * as path from 'path';

async function createMinimalDb() {
  const dbPath = path.resolve(__dirname, '../../data/nodes.db');
  
  // Remove existing corrupted database
  if (fs.existsSync(dbPath)) {
    console.log('Removing existing database:', dbPath);
    fs.unlinkSync(dbPath);
  }

  // Remove WAL files
  for (const suffix of ['-shm', '-wal']) {
    const walPath = dbPath + suffix;
    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
    }
  }

  console.log('Creating minimal database at:', dbPath);
  
  try {
    const db = await createDatabaseAdapter(dbPath);
    
    // Create only the core tables (no FTS5)
    const schema = `
      CREATE TABLE IF NOT EXISTS nodes (
        node_type TEXT PRIMARY KEY,
        package_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        development_style TEXT,
        is_ai_tool INTEGER DEFAULT 0,
        is_trigger INTEGER DEFAULT 0,
        is_webhook INTEGER DEFAULT 0,
        is_versioned INTEGER DEFAULT 0,
        is_tool_variant INTEGER DEFAULT 0,
        tool_variant_of TEXT,
        has_tool_variant INTEGER DEFAULT 0,
        version TEXT,
        documentation TEXT,
        properties_schema TEXT,
        operations TEXT,
        credentials_required TEXT,
        outputs TEXT,
        output_names TEXT,
        is_community INTEGER DEFAULT 0,
        is_verified INTEGER DEFAULT 0,
        author_name TEXT,
        author_github_url TEXT,
        npm_package_name TEXT,
        npm_version TEXT,
        npm_downloads INTEGER DEFAULT 0,
        community_fetched_at DATETIME,
        npm_readme TEXT,
        ai_documentation_summary TEXT,
        ai_summary_generated_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_package ON nodes(package_name);
      CREATE INDEX IF NOT EXISTS idx_ai_tool ON nodes(is_ai_tool);
      CREATE INDEX IF NOT EXISTS idx_category ON nodes(category);

      CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY,
        workflow_id INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        author_name TEXT,
        author_username TEXT,
        author_verified INTEGER DEFAULT 0,
        nodes_used TEXT,
        workflow_json TEXT,
        workflow_json_compressed TEXT,
        categories TEXT,
        views INTEGER DEFAULT 0,
        created_at DATETIME,
        updated_at DATETIME,
        url TEXT,
        scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata_json TEXT,
        metadata_generated_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS template_node_configs (
        id INTEGER PRIMARY KEY,
        node_type TEXT NOT NULL,
        template_id INTEGER NOT NULL,
        template_name TEXT NOT NULL,
        template_views INTEGER DEFAULT 0,
        node_name TEXT,
        parameters_json TEXT NOT NULL,
        credentials_json TEXT,
        has_credentials INTEGER DEFAULT 0,
        has_expressions INTEGER DEFAULT 0,
        complexity TEXT,
        use_cases TEXT,
        rank INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS node_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_type TEXT NOT NULL,
        version TEXT NOT NULL,
        package_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        is_current_max INTEGER DEFAULT 0,
        properties_schema TEXT,
        operations TEXT,
        credentials_required TEXT,
        outputs TEXT,
        minimum_n8n_version TEXT,
        breaking_changes TEXT,
        deprecated_properties TEXT,
        added_properties TEXT,
        released_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(node_type, version)
      );

      CREATE TABLE IF NOT EXISTS version_property_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_type TEXT NOT NULL,
        from_version TEXT NOT NULL,
        to_version TEXT NOT NULL,
        property_name TEXT NOT NULL,
        change_type TEXT NOT NULL,
        is_breaking INTEGER DEFAULT 0,
        old_value TEXT,
        new_value TEXT,
        migration_hint TEXT,
        auto_migratable INTEGER DEFAULT 0,
        migration_strategy TEXT,
        severity TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS workflow_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        workflow_name TEXT NOT NULL,
        workflow_snapshot TEXT NOT NULL,
        trigger TEXT NOT NULL,
        operations TEXT,
        fix_types TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(workflow_id, version_number)
      );
    `;

    db.exec(schema);
    console.log('Core schema created successfully');

    // Insert a minimal test node
    const insertNode = `
      INSERT OR REPLACE INTO nodes (
        node_type, package_name, display_name, description, category,
        is_ai_tool, is_trigger, is_webhook, version
      ) VALUES (
        'n8n-nodes-base.httpRequest',
        'n8n-nodes-base',
        'HTTP Request',
        'Makes HTTP requests to external APIs',
        'Input',
        1, 0, 0,
        '4.2'
      );
    `;
    
    db.exec(insertNode);
    console.log('Test node inserted: n8n-nodes-base.httpRequest');

    // Verify
    const count = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
    console.log('Total nodes in database:', count.count);

    console.log('✅ Minimal database created successfully');
  } catch (error) {
    console.error('❌ Failed to create database:', error);
    process.exit(1);
  }
}

createMinimalDb().catch(console.error);
