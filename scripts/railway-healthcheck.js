/**
 * Health check script for Railway deployment
 * 
 * This script tests the health endpoints of your deployed Railway app
 * Run with: node railway-healthcheck.js <your-deployed-url>
 * Example: node railway-healthcheck.js https://camping-api.up.railway.app
 */
const axios = require('axios');

// The URL to test, either from command line or default to localhost
const baseUrl = process.argv[2] || 'http://localhost:3000';
console.log(`\nTesting health endpoints on: ${baseUrl}\n`);

// List of endpoints to test
const endpoints = [
  '/health',
  '/api/health',
  '/api/ping',
];

// Function to test a specific endpoint
async function testEndpoint(endpoint) {
  const url = `${baseUrl}${endpoint}`;
  console.log(`Testing ${url}...`);
  
  try {
    const startTime = Date.now();
    const response = await axios.get(url, { 
      timeout: 10000,
      validateStatus: () => true // Accept any status code
    });
    const duration = Date.now() - startTime;
    
    // Display response details
    console.log(`✅ Status: ${response.status} (${duration}ms)`);
    console.log(`Response data:`, JSON.stringify(response.data, null, 2));
    
    return {
      url,
      success: response.status >= 200 && response.status < 300,
      status: response.status,
      data: response.data,
      duration
    };
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Response data:`, error.response.data);
    }
    
    return {
      url,
      success: false,
      error: error.message
    };
  }
}

// Main function to test all endpoints
async function runTests() {
  console.log('Starting health check tests...\n');
  const results = [];
  
  for (const endpoint of endpoints) {
    console.log(`\n--- Testing ${endpoint} ---`);
    const result = await testEndpoint(endpoint);
    results.push(result);
    console.log('-------------------\n');
  }
  
  // Summary
  console.log('\n=== TEST SUMMARY ===');
  const successCount = results.filter(r => r.success).length;
  console.log(`Successful tests: ${successCount}/${endpoints.length}`);
  
  if (successCount === 0) {
    console.log('\n❌ ALL TESTS FAILED - Severe issue with deployment');
    console.log('Recommendations:');
    console.log('1. Verify environment variables are correctly set in Railway');
    console.log('2. Check build logs for any initialization errors');
    console.log('3. Check for any database connection issues');
  } else if (successCount < endpoints.length) {
    console.log('\n⚠️ SOME TESTS FAILED - Partial functionality');
    console.log('Recommendations:');
    console.log('1. Check route configurations');
    console.log('2. Verify database connection settings');
    console.log('3. Look for any middleware issues');
  } else {
    console.log('\n✅ ALL TESTS PASSED - Health endpoints working correctly');
  }
}

// Run all tests
runTests().catch(error => {
  console.error('Failed to run tests:', error);
  process.exit(1);
});
