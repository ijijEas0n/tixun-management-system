import assert from 'node:assert/strict';
import { formatTime800m } from './utils';

assert.equal(formatTime800m(null), '--');
assert.equal(formatTime800m(Number.POSITIVE_INFINITY), '--');
assert.equal(formatTime800m(Number.NaN), '--');
assert.equal(formatTime800m(132), '2:12.0');
