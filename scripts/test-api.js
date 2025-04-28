/**
 * API Testing Script
 * 
 * Run with: node scripts/test-api.js
 * Tests common API endpoints and checks for issues
 */
const axios = require('axios');
const API_URL = 'http://localhost:3000';

// Test specific endpoint
async function testEndpoint(path, options = {}) {
  try {
    const url = `${API_URL}${path}`;
    console.log(`Testing ${url}...`);
    
    const config = {
      url,
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        ...options.headers
      }
    };
    
    const response = await axios(config);
    
    console.log(`✓ ${path} - ${response.status}`);
    console.log(`  Content-Type: ${response.headers['content-type']}`);
    return {
      success: true,
      status: response.status,
      contentType: response.headers['content-type']
    };
  } catch (error) {
    console.error(`✗ ${path} - ${error.response?.status || error.message}`);
    console.error(`  Error: ${error.response?.data?.error || error.message}`);
    return {
      success: false,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    };
  }
}

// Run all tests
async function runTests() {
  console.log('Running API tests...');
  console.log('-----------------');
  
  const results = {
    health: await testEndpoint('/health'),
    apiHealth: await testEndpoint('/api/health'),
    usersFullInfo: await testEndpoint('/users/full-info', {
      headers: { 'Authorization': 'Bearer invalid-token-just-testing' }
    }),
    apiUsersFullInfo: await testEndpoint('/api/users/full-info', {
      headers: { 'Authorization': 'Bearer invalid-token-just-testing' }
    }),
    ping: await testEndpoint('/api/ping')
  };
  
  console.log('\nSummary:');
  Object.entries(results).forEach(([test, result]) => {
    console.log(`${test}: ${result.success ? '✓' : '✗'}`);
  });
}

// Run the tests
runTests().catch(error => {
  console.error('Test error:', error);
});
