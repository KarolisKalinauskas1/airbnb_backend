const axios = require('axios');

// Add haversine distance calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon1 - lon2);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function toRad(value) {
  return value * Math.PI / 180;
}

async function geocodeAddress(address) {
  try {
    // Fix: Use GEOAPIFY instead of GEOPIFY to match your .env file
    const apiKey = process.env.GEOAPIFY_API_KEY;
    
    if (!apiKey) {
      console.error('GEOAPIFY_API_KEY is not defined in environment variables');
      throw new Error('Geocoding API key not available');
    }

    // Format address for Geoapify
    const query = encodeURIComponent(
      `${address.address_line1} ${address.address_line2 || ''} ${address.city} ${address.postal_code}`
    );
    
    // Use Geoapify geocoding API with the correct API key variable name
    const response = await axios.get(
      `https://api.geoapify.com/v1/geocode/search?text=${query}&apiKey=${apiKey}&limit=1`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    // Check if we got valid results
    if (response.data && 
        response.data.features && 
        response.data.features.length > 0 && 
        response.data.features[0].geometry && 
        response.data.features[0].geometry.coordinates) {
      
      // Geoapify returns coordinates as [longitude, latitude]
      const coordinates = response.data.features[0].geometry.coordinates;
      
      return {
        // Swap order as we use latitude first in our application
        longitude: coordinates[0],
        latitude: coordinates[1]
      };
    }
    
    throw new Error('Location not found');
  } catch (error) {
    console.error('Geocoding error:', error);
    throw error;
  }
}

module.exports = { 
  geocodeAddress,
  calculateDistance
};
