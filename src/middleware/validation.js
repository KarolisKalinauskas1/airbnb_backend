const { z } = require('zod');

/**
 * Generic validation middleware factory
 * @param {Object} schema - Zod schema for request validation
 * @param {string} type - Request part to validate ('body', 'query', 'params')
 */
const validate = (schema, type = 'body') => {
  return (req, res, next) => {
    try {
      // Log incoming request data in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`Validating ${type} data:`, req[type]);
      }

      const result = schema.parse(req[type]);
      // Replace request data with validated data
      req[type] = result;
      next();
    } catch (error) {
      console.error('Validation error:', error);
      
      // Create a user-friendly error response
      const validationError = {
        error: 'Validation Error',
        message: 'Invalid request data',
        details: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }))
      };

      return res.status(400).json(validationError);
    }
  };
};

// Common validation schemas
const commonSchemas = {
  id: z.number().positive(),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  date: z.string().datetime(),
  price: z.number().min(0),
  coordinates: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  }),
  pagination: z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(10)
  })
};

// API-specific schemas
const schemas = {
  camping: {
    create: z.object({
      title: z.string().min(3).max(100),
      description: z.string().min(10),
      price_per_night: z.number().min(0),
      max_guests: z.number().int().min(1),
      location: commonSchemas.coordinates,
      amenities: z.array(commonSchemas.id)
    }),
    search: z.object({
      query: z.string().min(2).optional(),
      minPrice: z.number().min(0).optional(),
      maxPrice: z.number().min(0).optional(),
      guests: z.number().int().min(1).optional(),
      startDate: commonSchemas.date.optional(),
      endDate: commonSchemas.date.optional(),
      page: commonSchemas.pagination.shape.page,
      limit: commonSchemas.pagination.shape.limit
    })
  },
  booking: {
    create: z.object({
      camping_spot_id: commonSchemas.id,
      start_date: commonSchemas.date,
      end_date: commonSchemas.date,
      guest_count: z.number().int().min(1)
    })
  }
};

module.exports = {
  validate,
  schemas,
  commonSchemas
};
