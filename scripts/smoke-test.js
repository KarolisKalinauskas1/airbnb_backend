/**
 * This script performs smoke tests to verify that core functionality is working
 * Run it after deploying to verify your application
 */

const axios = require('axios');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const VERCEL_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
const TARGET_URL = VERCEL_URL || API_URL;

// Tests to run
const tests = [
  {
    name: 'Health Check',
    endpoint: '/api/health',
    method: 'get',
    expectedStatus: 200,
    validate: (data) => data && data.status === 'ok'
  },
  {
    name: 'API Ping',
    endpoint: '/api/ping',
    method: 'get',
    expectedStatus: 200,
    validate: (data) => data && data.status === 'pong'
  },
  {
    name: 'Camping Spots Endpoint',
    endpoint: '/api/camping-spots?limit=1',
    method: 'get',
    expectedStatus: 200,
    validate: (data) => Array.isArray(data)
  }
];

async function runTests() {
  console.log(`Running smoke tests against ${TARGET_URL}`);
  console.log('----------------------------------------');
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const test of tests) {
    try {
      console.log(`Testing: ${test.name}`);
      
      const response = await axios({
        method: test.method,
        url: `${TARGET_URL}${test.endpoint}`,
        validateStatus: () => true // Don't throw on error status codes
      });
      
      const status = response.status;
      const data = response.data;
      
      // Check status
      const statusPassed = status === test.expectedStatus;
      
      // Check data validation if status is correct
      const validationPassed = statusPassed && test.validate(data);
      
      if (statusPassed && validationPassed) {
        console.log(`✅ PASSED: ${test.name}`);
        passedTests++;
      } else {
        console.log(`❌ FAILED: ${test.name}`);
        console.log(`   Expected status: ${test.expectedStatus}, Got: ${status}`);
        console.log(`   Response data:`, JSON.stringify(data, null, 2).substring(0, 100) + '...');
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ ERROR: ${test.name}`);
      console.log(`   ${error.message}`);
      failedTests++;
    }
    
    console.log('----------------------------------------');
  }
  
  console.log(`Test Summary: ${passedTests} passed, ${failedTests} failed`);
  
  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests();
