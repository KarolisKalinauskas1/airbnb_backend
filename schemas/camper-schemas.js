const { z } = require('zod');

// Schema for location object
const locationSchema = z.object({
  address_line1: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  country_id: z.number().int().positive(),
  postal_code: z.string().min(1, "Postal code is required"),
  longtitute: z.string().or(z.number()).optional(),
  latitute: z.string().or(z.number()).optional()
});

// Schema for creating camping spots
const createCampingSpotSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100),
  description: z.string().min(10, "Description must be at least 10 characters").max(2000),
  price_per_night: z.number().positive("Price must be positive"),
  max_guests: z.number().int().positive().max(20, "Maximum 20 guests allowed"),
  owner_id: z.number().int().positive(),
  location: locationSchema,
  amenities: z.array(z.number().int().positive()).optional()
});

// Schema for camping spot search
const searchCampingSpotSchema = z.object({
  startDate: z.string().refine(val => !isNaN(Date.parse(val)), {
    message: "Invalid start date format"
  }),
  endDate: z.string().refine(val => !isNaN(Date.parse(val)), {
    message: "Invalid end date format"
  }),
  lat: z.string().optional(),
  lng: z.string().optional(),
  radius: z.string().optional().transform(val => val ? parseFloat(val) : 50),
  minPrice: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
  maxPrice: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
  guests: z.string().optional().transform(val => val ? parseInt(val) : undefined)
}).refine(data => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return end > start;
}, {
  message: "End date must be after start date",
  path: ["endDate"]
});

// Schema for availability check
const availabilityCheckSchema = z.object({
  startDate: z.string().refine(val => !isNaN(Date.parse(val)), {
    message: "Invalid start date format"
  }),
  endDate: z.string().refine(val => !isNaN(Date.parse(val)), {
    message: "Invalid end date format"
  })
}).refine(data => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return end > start;
}, {
  message: "End date must be after start date",
  path: ["endDate"]
});

module.exports = {
  createCampingSpotSchema,
  searchCampingSpotSchema,
  availabilityCheckSchema,
  locationSchema
};
