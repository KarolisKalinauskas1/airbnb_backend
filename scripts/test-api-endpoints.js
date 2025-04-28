/**
 * API Endpoint Testing Script
 * 
 * This script tests different API endpoints to ensure proper content type handling
 * Run with: node scripts/test-api-endpoints.js
 */
const axios = require('axios');
const BASE_URL = 'http://localhost:3000'; // Adjust to match your server port

async function testEndpoint(path, options = {}) {
  try {
    const url = `${BASE_URL}${path}`;
    console.log(`Testing ${url}`);
    
    const response = await axios({
      url,
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        ...options.headers
      },
      validateStatus: () => true, // Don't throw on non-2xx responses
      timeout: 3000
    });
    
    console.log(`✅ ${path} - ${response.status}`);
    console.log(`  Content-Type: ${response.headers['content-type']}`);
    
    // Check if response is HTML when it shouldn't be
    if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
      console.log(`❌ ERROR: Received HTML when JSON was expected`);
      console.log(response.data.substring(0, 200) + '...');
    }
    
    return {
      success: true,
      status: response.status,
      contentType: response.headers['content-type'],
      isHtml: typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')
    };
  } catch (error) {
    console.error(`❌ ${path} - ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

async function runTests() {
  console.log('🔍 Testing API endpoints...');
  console.log('----------------------------');
  
  const results = {
    'Health check': await testEndpoint('/health'),
    'API health check': await testEndpoint('/api/health'),
    'Root': await testEndpoint('/'),
    'Users test endpoint': await testEndpoint('/users/test-endpoint'),
    'Content type test': await testEndpoint('/health/content-type-test')
  };
  
  console.log('\n📊 Results summary:');
  for (const [name, result] of Object.entries(results)) {
    const status = result.success ? '✅' : '❌';
    const warning = result.isHtml ? ' ⚠️ HTML DETECTED!' : '';
    console.log(`${status} ${name}${warning}`);
  }
  
  console.log('\n🔧 If you see HTML responses for API endpoints, check:');
  console.log('1. CORS middleware is applied before static files middleware');
  console.log('2. Force JSON middleware is being applied correctly');
  console.log('3. Routes are mounted correctly');
}

runTests().catch(console.error);
