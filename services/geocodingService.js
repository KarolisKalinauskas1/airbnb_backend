const axios = require('axios');

/**
 * Geocodes an address using OpenStreetMap Nominatim service
 * @param {Object} location - Location data containing address components
 * @returns {Promise<Object>} - Object with latitude and longitude
 */
async function geocodeAddress(location) {
  try {
    if (!location || !location.address_line1) {
      console.log('Invalid location data provided:', location);
      return { latitude: 0, longitude: 0 };
    }
    
    // Build the address string
    const addressParts = [];
    if (location.address_line1) addressParts.push(location.address_line1);
    if (location.address_line2) addressParts.push(location.address_line2);
    if (location.city) addressParts.push(location.city);
    if (location.postal_code) addressParts.push(location.postal_code);
    
    // Get country name from country ID if needed
    let countryName = '';
    if (location.country) {
      countryName = location.country;
    } else if (location.country_id) {
      // This would need access to the database, but we'll handle it in the route
      countryName = 'Belgium'; // Default to Belgium for now
    }
    
    if (countryName) addressParts.push(countryName);
    
    const addressString = addressParts.join(', ');
    console.log(`Geocoding address: ${addressString}`);
    
    // Call Nominatim API
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: addressString,
        format: 'json',
        limit: 1,
      },
      headers: {
        'User-Agent': 'AirbnbForCamping/1.0'
      }
    });
    
    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      console.log(`Geocoding result: ${result.lat}, ${result.lon}`);
      return {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon)
      };
    } else {
      console.warn('No geocoding results found for address:', addressString);
      return { latitude: 0, longitude: 0 };
    }
  } catch (error) {
    console.error('Geocoding error:', error.message);
    // Return default coordinates instead of failing
    return { latitude: 0, longitude: 0 };
  }
}

module.exports = {
  geocodeAddress
};
