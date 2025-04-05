const request = require('supertest');
const app = require('../app'); // Adjust the path if needed

describe('Express App', () => {
  it('should respond with 404 for unknown routes', async () => {
    const response = await request(app).get('/unknown-route');
    expect(response.status).toBe(404);
  });

  it('should respond with 200 for the root route', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
  });
});