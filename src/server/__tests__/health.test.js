/**
 * health.test.js — Integration tests for the /api/health endpoint.
 *
 * These tests spin up the Express app directly (no DB connection)
 * and verify the health endpoint returns the expected JSON shape.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');

describe('GET /api/health', () => {
  afterAll(async () => {
    // Close any open Mongoose connections after the test suite
    await mongoose.connection.close();
  });

  it('should return JSON with a service field', async () => {
    const res = await request(app).get('/api/health');

    // Status is 200 (connected) or 503 (no DB in test) — both are valid shapes
    expect([200, 503]).toContain(res.statusCode);
    expect(res.body).toHaveProperty('service', 'PortFlow AI API');
    expect(res.body).toHaveProperty('database');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('should return a timestamp in ISO 8601 format', async () => {
    const res = await request(app).get('/api/health');
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });
});

describe('404 handler', () => {
  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('success', false);
  });
});
