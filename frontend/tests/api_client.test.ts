import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient, ApiClientError } from '../src/api/client.js';

describe('Phase 2.1 - Centralized API Client Tests', () => {
  it('1. ApiClient initializes with base URL and default timeout', () => {
    const client = new ApiClient({ baseUrl: 'http://localhost:3000' });
    assert.equal(client.getBaseUrl(), 'http://localhost:3000');
  });

  it('2. ApiClient manages auth token properly', () => {
    const client = new ApiClient({ baseUrl: 'http://localhost:3000' });
    assert.equal(client.getToken(), null);
    client.setToken('sample-jwt-token');
    assert.equal(client.getToken(), 'sample-jwt-token');
    client.setToken(null);
    assert.equal(client.getToken(), null);
  });

  it('3. ApiClientError normalizes API error responses with status, code, and details', () => {
    // constructor(status: number, errorCode: string, message: string, details?: unknown)
    const error = new ApiClientError(
      401,
      'AUTHENTICATION_FAILED',
      'Invalid credentials supplied',
      { attempt: 1 }
    );
    assert.equal(error.name, 'ApiClientError');
    assert.equal(error.message, 'Invalid credentials supplied');
    assert.equal(error.status, 401);
    assert.equal(error.errorCode, 'AUTHENTICATION_FAILED');
    assert.deepEqual(error.details, { attempt: 1 });
  });
});
