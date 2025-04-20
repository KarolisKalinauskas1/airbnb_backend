/**
 * Fallback data to use when database connections fail
 * This provides a minimal experience when the database is unavailable
 */

const amenities = [
  { amenity_id: 1, name: "WiFi" },
  { amenity_id: 2, name: "Electricity" },
  { amenity_id: 3, name: "Shower" },
  { amenity_id: 4, name: "Toilet" },
  { amenity_id: 5, name: "Water" },
  { amenity_id: 6, name: "Fireplace" },
  { amenity_id: 7, name: "Picnic table" },
  { amenity_id: 8, name: "BBQ" },
  { amenity_id: 9, name: "Swimming" },
  { amenity_id: 10, name: "Kitchen" }
];

// Sample camping spots when database is unavailable
const campingSpots = [
  {
    camping_spot_id: 1,
    title: "Peaceful Forest Retreat",
    description: "A quiet camping spot surrounded by trees and nature",
    price_per_night: 45,
    max_guests: 4,
    owner_id: 1,
    location: {
      location_id: 101,
      address_line1: "Forest Path 1",
      city: "Arnhem",
      postal_code: "1234 AB",
      latitute: "51.9851",
      longtitute: "5.8987",
      country: { name: "Netherlands" }
    },
    images: [
      { 
        image_id: 1001,
        image_url: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.0.3"
      }
    ],
    camping_spot_amenities: [
      { amenity_id: 1, amenity: { name: "WiFi" } },
      { amenity_id: 2, amenity: { name: "Electricity" } },
      { amenity_id: 4, amenity: { name: "Toilet" } }
    ]
  },
  {
    camping_spot_id: 2,
    title: "Lakeside Paradise",
    description: "Beautiful camping spot next to a serene lake",
    price_per_night: 60,
    max_guests: 6,
    owner_id: 2,
    location: {
      location_id: 102,
      address_line1: "Lake Road 5",
      city: "Mechelen",
      postal_code: "2800",
      latitute: "51.0259",
      longtitute: "4.4821",
      country: { name: "Belgium" }
    },
    images: [
      { 
        image_id: 1002,
        image_url: "https://images.unsplash.com/photo-1470246973918-29a93221c455?q=80&w=1374&auto=format&fit=crop&ixlib=rb-4.0.3"
      }
    ],
    camping_spot_amenities: [
      { amenity_id: 3, amenity: { name: "Shower" } },
      { amenity_id: 4, amenity: { name: "Toilet" } },
      { amenity_id: 5, amenity: { name: "Water" } },
      { amenity_id: 9, amenity: { name: "Swimming" } }
    ]
  },
  {
    camping_spot_id: 3,
    title: "Mountain View Camp",
    description: "Spectacular views of the mountains and hiking trails nearby",
    price_per_night: 50,
    max_guests: 4,
    owner_id: 3,
    location: {
      location_id: 103,
      address_line1: "Mountain Trail 10",
      city: "Innsbruck",
      postal_code: "6020",
      latitute: "47.2654",
      longtitute: "11.3927",
      country: { name: "Austria" }
    },
    images: [
      { 
        image_id: 1003,
        image_url: "https://images.unsplash.com/photo-1563299796-17596ed6b017?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.0.3" 
      }
    ],
    camping_spot_amenities: [
      { amenity_id: 2, amenity: { name: "Electricity" } },
      { amenity_id: 6, amenity: { name: "Fireplace" } },
      { amenity_id: 7, amenity: { name: "Picnic table" } }
    ]
  },
  {
    camping_spot_id: 4,
    title: "Beach Camping",
    description: "Fall asleep to the sound of waves on this beachfront spot",
    price_per_night: 75,
    max_guests: 8,
    owner_id: 2,
    location: {
      location_id: 104,
      address_line1: "Beach Boulevard 20",
      city: "Barcelona",
      postal_code: "08001",
      latitute: "41.3851",
      longtitute: "2.1734",
      country: { name: "Spain" }
    },
    images: [
      { 
        image_id: 1004,
        image_url: "https://images.unsplash.com/photo-1487730116645-74489c95b41b?q=80&w=1470&auto=format&fit=crop&ixlib=rb-4.0.3"
      }
    ],
    camping_spot_amenities: [
      { amenity_id: 3, amenity: { name: "Shower" } },
      { amenity_id: 4, amenity: { name: "Toilet" } },
      { amenity_id: 8, amenity: { name: "BBQ" } },
      { amenity_id: 9, amenity: { name: "Swimming" } }
    ]
  }
];

module.exports = {
  amenities,
  campingSpots
};
