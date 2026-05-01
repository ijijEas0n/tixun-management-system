import assert from 'node:assert/strict';
import { parseStoredAppData } from './storage';

assert.equal(
  parseStoredAppData('{bad json').years[0].id,
  'y1',
  'bad saved app data falls back to default data instead of crashing',
);

const parsed = parseStoredAppData(JSON.stringify({
  years: [{ id: 'custom', name: '2026' }],
  students: [],
  records: {},
  testSessions: [],
}));

assert.equal(parsed.years[0].id, 'custom', 'valid saved app data is preserved');
