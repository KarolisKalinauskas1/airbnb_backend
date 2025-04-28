const axios = require('axios');

async function geocodeAddress(location) {
  try {
    // Construct the address string
    const addressComponents = [
      location.address_line1,
      location.address_line2,
      location.postal_code,
      location.city
    ].filter(Boolean); // Remove empty/null/undefined values

    const address = addressComponents.join(', ');
    
    // Use a more precise geocoding service (OpenStreetMap Nominatim)
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: address,
        format: 'json',
        limit: 1,
        countrycodes: location.country_id, // Use country code for better accuracy
        addressdetails: 1,
        'accept-language': 'en'
      },
      headers: {
        'User-Agent': 'CampingSpotApp/1.0'
      }
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('No results found for the provided address');
    }

    const result = response.data[0];
    
    // Validate the coordinates
    if (!result.lat || !result.lon) {
      throw new Error('Invalid coordinates received from geocoding service');
    }

    // Return coordinates with high precision
    return {
      latitude: parseFloat(result.lat).toFixed(7),
      longitude: parseFloat(result.lon).toFixed(7),
      address: result.display_name,
      confidence: result.importance // Higher importance means better match
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    throw new Error('Failed to geocode address: ' + error.message);
  }
}

module.exports = { geocodeAddress }; 