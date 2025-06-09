require('dotenv').config();
const axios = require('axios');

async function testAPI() {
  try {
    console.log('🔍 Testing the actual bookings API endpoint...');
    
    // First, let's test without authentication to see if the endpoint is accessible
    const baseURL = 'http://localhost:3000';
    
    // Try to get health check first
    try {
      const healthResponse = await axios.get(`${baseURL}/api/health`);
      console.log('✅ Server is running, health check passed');
    } catch (err) {
      console.log('❌ Server health check failed:', err.message);
      return;
    }
    
    // Test the bookings endpoint (this will likely fail without auth, but let's see the response)
    try {
      const bookingsResponse = await axios.get(`${baseURL}/api/bookings/user`);
      console.log('📋 Bookings response:', bookingsResponse.data);
    } catch (err) {
      console.log('⚠️ Expected auth error for bookings endpoint:', err.response?.status, err.response?.data?.error);
    }
    
    // Let's also test the general bookings endpoint
    try {
      const allBookingsResponse = await axios.get(`${baseURL}/api/bookings`);
      console.log('📋 All bookings response:', allBookingsResponse.data);
    } catch (err) {
      console.log('⚠️ Expected auth error for all bookings endpoint:', err.response?.status, err.response?.data?.error);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAPI();
