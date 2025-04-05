const axios = require('axios');

async function geocodeAddress(address) {
  try {
    const query = encodeURIComponent(
      `${address.address_line1} ${address.address_line2 || ''} ${address.city} ${address.postal_code}`
    );
    
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
      {
        headers: {
          'User-Agent': 'Camping_App/1.0' // Required by Nominatim's ToS
        }
      }
    );

    if (response.data && response.data.length > 0) {
      return {
        latitude: parseFloat(response.data[0].lat),
        longitude: parseFloat(response.data[0].lon)
      };
    }
    
    throw new Error('Location not found');
  } catch (error) {
    console.error('Geocoding error:', error);
    throw error;
  }
}

module.exports = { geocodeAddress };
