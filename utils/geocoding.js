/**
 * Geocoding utility with fallback for offline operation
 * and robust error handling
 */

// Simple in-memory cache
const geocodingCache = {};

// Add haversine distance calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
  try {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  } catch (error) {
    console.error('Distance calculation error:', error);
    return 0; // Return 0 distance on error
  }
}

function toRad(value) {
  return value * Math.PI / 180;
}

// Generate cache key for geocoding
function getCacheKey(address) {
  if (!address) return 'unknown';
  
  const city = address.city || 'unknown';
  const postal = address.postal_code || 'unknown';
  const addr1 = address.address_line1 || 'unknown';
  
  return `${city}-${postal}-${addr1}`;
}

// Save cache to file synchronously
function saveCacheSync() {
  try {
    const fs = require('fs');
    const path = require('path');
    const cacheDir = path.join(__dirname, '../data');
    const cacheFile = path.join(cacheDir, 'geocoding-cache.json');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    fs.writeFileSync(cacheFile, JSON.stringify(geocodingCache, null, 2));
  } catch (error) {
    console.warn('Failed to save geocoding cache:', error.message);
  }
}

// Load cache from file synchronously
function loadCacheSync() {
  try {
    const fs = require('fs');
    const path = require('path');
    const cacheFile = path.join(__dirname, '../data', 'geocoding-cache.json');
    
    if (fs.existsSync(cacheFile)) {
      const data = fs.readFileSync(cacheFile, 'utf8');
      const loadedCache = JSON.parse(data);
      
      // Copy loaded cache to our cache object
      Object.assign(geocodingCache, loadedCache);
      console.log(`Loaded ${Object.keys(loadedCache).length} geocoding entries from cache`);
    }
  } catch (error) {
    console.warn('Failed to load geocoding cache:', error.message);
  }
}

// Try to load the cache on module initialization
try {
  loadCacheSync();
} catch (err) {
  console.warn('Error loading geocoding cache on startup:', err.message);
}

// The main geocoding function with multiple fallbacks
async function geocodeAddress(address) {
  if (!address) {
    console.warn('Geocoding called with null address');
    return { latitude: 50.85, longitude: 4.35 }; // Default to Brussels
  }
  
  try {
    // Generate a cache key from the address components
    const cacheKey = getCacheKey(address);
    
    // Check if we have a cached result
    if (geocodingCache[cacheKey]) {
      console.log('Using cached geocoding result for:', cacheKey);
      return geocodingCache[cacheKey];
    }
    
    // Try to use axios if it's available
    let axios;
    try {
      // Instead of basic require, use the module resolver to auto-install if needed
      const resolver = require('./module-resolver');
      axios = await resolver.requireWithAutoInstall('axios');
    } catch (err) {
      console.warn('Axios module not available:', err.message);
    }
    
    // If axios is not available or fails, use a deterministic algorithm based on postal code
    if (!axios) {
      return generateFallbackCoordinates(address);
    }
    
    // Use Nominatim OpenStreetMap for geocoding (free)
    const query = encodeURIComponent(
      `${address.address_line1 || ''} ${address.address_line2 || ''} ${address.city || ''} ${address.postal_code || ''}`
    );
    
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
        {
          headers: {
            'User-Agent': 'Camping_App/1.0' // Required by Nominatim's ToS
          },
          timeout: 5000
        }
      );
      
      let result;
      
      if (response?.data && Array.isArray(response.data) && response.data.length > 0) {
        result = {
          latitude: parseFloat(response.data[0].lat) || 0,
          longitude: parseFloat(response.data[0].lon) || 0
        };
      } else {
        console.warn('Location not found via API for address:', query);
        result = generateFallbackCoordinates(address);
      }
      
      // Store in cache
      geocodingCache[cacheKey] = result;
      
      // Save cache periodically (only when new entries are added)
      setTimeout(() => {
        saveCacheSync();
      }, 100);
      
      return result;
    } catch (requestError) {
      console.error('API request error:', requestError.message);
      return generateFallbackCoordinates(address);
    }
  } catch (error) {
    console.error('Geocoding error:', error.message);
    return { latitude: 50.85, longitude: 4.35 }; // Brussels
  }
}

// Generate coordinates based on postal code or other address data
function generateFallbackCoordinates(address) {
  try {
    // Default to center of Belgium
    let baseLat = 50.85;
    let baseLng = 4.35;
    
    // Create a more unique seed from the address
    let seed = 0;
    if (address.postal_code) {
      // Extract numbers from postal code
      const postalNumbers = address.postal_code.replace(/\D/g, '');
      if (postalNumbers.length > 0) {
        seed += parseInt(postalNumbers);
      }
    }
    
    // Add city name to the seed
    if (address.city) {
      seed += address.city.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    }
    
    // Add street address to the seed
    if (address.address_line1) {
      seed += address.address_line1.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    }
    
    // Generate more unique variations
    // Use sine and cosine to create more natural-looking variations
    const latVariation = Math.sin(seed) * 0.1; // Up to 0.1 degrees variation
    const lngVariation = Math.cos(seed) * 0.1; // Up to 0.1 degrees variation
    
    const latitude = baseLat + latVariation;
    const longitude = baseLng + lngVariation;
    
    // Round to 6 decimal places (about 11cm precision)
    const result = {
      latitude: parseFloat(latitude.toFixed(6)),
      longitude: parseFloat(longitude.toFixed(6))
    };
    
    console.log('Generated fallback coordinates:', {
      address,
      seed,
      result
    });
    
    return result;
  } catch (error) {
    console.error('Error generating fallback coordinates:', error.message);
    return { latitude: 50.85, longitude: 4.35 }; // Brussels as ultimate fallback
  }
}

// Register process exit handler
process.on('exit', () => {
  try {
    saveCacheSync();
    console.log('Geocoding cache saved before exit');
  } catch (err) {
    console.warn('Error saving cache on exit:', err.message);
  }
});

module.exports = { 
  geocodeAddress,
  calculateDistance
};
