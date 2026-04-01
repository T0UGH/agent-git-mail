#!/usr/bin/env node
// Updates AGM config to add a contact entry (v2 format with remote_repo_url)
const fs = require('fs');
const path = require('path');
const yaml = require('/workspace/agent-git-mail/node_modules/yaml');

const configPath = process.env.AGM_CONFIG_PATH || path.join(process.env.HOME || '/root', '.config', 'agm', 'config.yaml');
const contactName = process.argv[2];
const contactRemoteUrl = process.argv[3];

if (!contactName || !contactRemoteUrl) {
  console.error('Usage: update-config.js <contactName> <contactRemoteUrl>');
  process.exit(1);
}

const raw = fs.readFileSync(configPath, 'utf-8');
const cfg = yaml.parse(raw);

// Add contacts section if missing
if (!cfg.contacts) {
  cfg.contacts = {};
}
// v2 format: contacts[name] = { remote_repo_url }
cfg.contacts[contactName] = { remote_repo_url: contactRemoteUrl };

fs.writeFileSync(configPath, yaml.stringify(cfg), 'utf-8');
console.log(`Added ${contactName} -> ${contactRemoteUrl} in ${configPath}`);
console.log('Updated config:');
console.log(fs.readFileSync(configPath, 'utf-8'));
