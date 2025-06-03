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

// New function to find locations within a specific radius
async function findLocationsWithinRadius(centerLocation, radiusKm) {
  try {
    if (!centerLocation) {
      return [];
    }

    // Get coordinates for the center location
    const centerCoords = await geocodeAddress(centerLocation);
    if (!centerCoords || !centerCoords.latitude || !centerCoords.longitude) {
      console.warn(`Could not geocode center location: ${centerLocation}`);
      return [];
    }

    // In a production app, you would query the database directly with a geo query
    // For this implementation, we'll get all locations and filter in-memory
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const allLocations = await prisma.location.findMany({
      include: {
        country: true
      }
    });
    
    // Filter locations that are within the radius
    const locationsInRadius = allLocations.filter(location => {
      if (!location.latitude || !location.longitude) return false;
      
      const distance = calculateDistance(
        centerCoords.latitude, 
        centerCoords.longitude,
        location.latitude,
        location.longitude
      );
      
      return distance <= radiusKm;
    });
    
    return locationsInRadius;
  } catch (error) {
    console.error('Error finding locations within radius:', error);
    return [];
  }
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
    
    // Always use /tmp for Railway deployment environments
    const cacheDir = '/tmp';
    const cacheFile = path.join(cacheDir, 'geocoding-cache.json');
    
    // Create directory if it doesn't exist - with permissive mode
    if (!fs.existsSync(cacheDir)) {
      try {
        fs.mkdirSync(cacheDir, { recursive: true, mode: 0o777 });
      } catch (dirError) {
        console.warn('Failed to create cache directory, using memory cache only:', dirError.message);
        return;
      }
    }
    
    // Use try/catch for the actual write operation
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(geocodingCache, null, 2), { mode: 0o666 });
      console.log(`Successfully saved geocoding cache to ${cacheFile}`);
    } catch (writeError) {
      console.warn('Failed to write geocoding cache file:', writeError.message);
    }
  } catch (error) {
    console.warn('Failed to save geocoding cache:', error.message);
    // Continue execution - geocoding will still work, just without caching
  }
}

// Load cache from file synchronously
function loadCacheSync() {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Always use /tmp for Railway deployment environments
    const cacheDir = '/tmp';
    const cacheFile = path.join(cacheDir, 'geocoding-cache.json');
    
    if (fs.existsSync(cacheFile)) {
      try {
        const data = fs.readFileSync(cacheFile, 'utf8');
        const loadedCache = JSON.parse(data);
        
        // Copy loaded cache to our cache object
        Object.assign(geocodingCache, loadedCache);
        console.log(`Loaded ${Object.keys(loadedCache).length} geocoding entries from cache`);
      } catch (readError) {
        console.warn('Failed to read geocoding cache file:', readError.message);
        // Continue with empty cache
      }
    }
  } catch (error) {
    console.warn('Failed to load geocoding cache:', error.message);
    // Continue with empty cache - geocoding will still work
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
    const cacheKey = typeof address === 'string' ? address.toLowerCase() : getCacheKey(address);
    
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
    // Handling both string location names and address objects
    let queryString;
    if (typeof address === 'string') {
      queryString = encodeURIComponent(address);
    } else {
      queryString = encodeURIComponent(
        `${address.address_line1 || ''}, ${address.postal_code || ''} ${address.city || ''}, ${address.country_id || ''}`
      );
    }
    
    const response = await axios.get(`https://nominatim.openstreetmap.org/search?q=${queryString}&format=json&limit=1`);
    
    if (response.data && response.data.length > 0) {
      const result = {
        latitude: parseFloat(response.data[0].lat),
        longitude: parseFloat(response.data[0].lon)
      };
      
      // Cache the result
      geocodingCache[cacheKey] = result;
      saveCacheSync();
      
      return result;
    } else {
      console.warn(`No geocoding results for: ${queryString}`);
      return generateFallbackCoordinates(address);
    }
  } catch (error) {
    console.error('Geocoding error:', error);
    return generateFallbackCoordinates(address);
  }
}

// Fallback coordinate generation - deterministic but not accurate
function generateFallbackCoordinates(address) {
  console.log('Using fallback coordinate generation');
  
  // Return Brussels as default if we have nothing to work with
  if (!address) {
    return { latitude: 50.85, longitude: 4.35 }; // Brussels
  }
  
  // Default map center and offsets
  let baseLatitude = 50.85; // Brussels latitude
  let baseLongitude = 4.35; // Brussels longitude
  
  // If we have a string, try to match known locations
  if (typeof address === 'string') {
    address = address.toLowerCase();
    
    // Very basic location mapping - in a real app you'd have a proper database
    const knownLocations = {
      'brussels': { latitude: 50.85, longitude: 4.35 },
      'antwerp': { latitude: 51.22, longitude: 4.40 },
      'ghent': { latitude: 51.05, longitude: 3.72 },
      'bruges': { latitude: 51.21, longitude: 3.22 },
      'leuven': { latitude: 50.88, longitude: 4.70 },
      'liege': { latitude: 50.63, longitude: 5.57 },
      'namur': { latitude: 50.47, longitude: 4.87 },
      'charleroi': { latitude: 50.41, longitude: 4.44 },
      'mons': { latitude: 50.45, longitude: 3.95 },
      'ostend': { latitude: 51.23, longitude: 2.92 }
    };
    
    // Check if we have coordinates for this location
    for (const [key, coords] of Object.entries(knownLocations)) {
      if (address.includes(key)) {
        return coords;
      }
    }
    
    // If no match, return Brussels as default
    return { latitude: 50.85, longitude: 4.35 }; 
  }
  
  // If we have an address object, try to use postal code for deterministic offset
  let offsetFactor = 0.01;
  if (address.postal_code) {
    // Use last digits of postal code to create a deterministic offset
    const postalDigits = address.postal_code.match(/\d+/);
    if (postalDigits && postalDigits[0]) {
      const lastDigits = postalDigits[0].slice(-2);
      if (lastDigits) {
        const offset = parseInt(lastDigits) / 100;
        return {
          latitude: baseLatitude + (offset * 0.5),
          longitude: baseLongitude + (offset * 0.5)
        };
      }
    }
  }
  
  // Fallback if no postal code
  return {
    latitude: baseLatitude + (Math.random() * offsetFactor),
    longitude: baseLongitude + (Math.random() * offsetFactor)
  };
}

// Search for locations by query string
async function searchLocations(query) {
    try {
        // Check cache first
        const cacheKey = `search:${query.toLowerCase()}`;
        if (geocodingCache[cacheKey]) {
            console.log('Returning cached search results for:', query);
            return geocodingCache[cacheKey];
        }

        // Set up geocoding options
        const options = {
            provider: 'nominatim',
            httpAdapter: 'https',
            apiKey: process.env.GEOCODER_API_KEY, // Optional, some providers need this
            formatter: null
        };

        // Use node-geocoder
        const NodeGeocoder = require('node-geocoder');
        const geocoder = NodeGeocoder(options);

        // Search for locations
        const results = await geocoder.geocode(query);

        // Format the results
        const formattedResults = results.map(result => ({
            latitude: result.latitude,
            longitude: result.longitude,
            formattedAddress: result.formattedAddress,
            country: result.country,
            city: result.city,
            state: result.state,
            zipcode: result.zipcode,
            streetName: result.streetName,
            streetNumber: result.streetNumber,
            countryCode: result.countryCode
        }));

        // Cache the results
        geocodingCache[cacheKey] = formattedResults;

        return formattedResults;
    } catch (error) {
        console.error('Location search error:', error);
        return [];
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
  calculateDistance,
  findLocationsWithinRadius,
  searchLocations
};
