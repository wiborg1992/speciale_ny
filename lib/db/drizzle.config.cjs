'use strict';
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');

const rootEnv = path.resolve(__dirname, '../../.env');
if (existsSync(rootEnv)) {
  for (const line of readFileSync(rootEnv, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL mangler. Sæt DATABASE_URL i ../../.env');
}

/** @type {import('drizzle-kit').Config} */
module.exports = {
  schema: './src/schema/*.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
};
