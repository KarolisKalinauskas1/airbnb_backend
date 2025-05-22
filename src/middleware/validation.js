const Joi = require('joi');

/**
 * Generic validation middleware factory
 * @param {Object} schema - Joi schema for request validation
 * @param {string} type - Request part to validate ('body', 'query', 'params')
 */
const validate = (schema, type = 'body') => {
  return (req, res, next) => {
    const validationResult = schema.validate(req[type], {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: true
    });

    if (validationResult.error) {
      const errors = validationResult.error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: errors
      });
    }

    // Replace request data with validated data
    req[type] = validationResult.value;
    next();
  };
};

// Common validation schemas
const commonSchemas = {
  id: Joi.number().integer().positive(),
  email: Joi.string().email(),
  password: Joi.string().min(8).max(100),
  date: Joi.date().iso(),
  price: Joi.number().min(0),
  coordinates: Joi.object({
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required()
  }),
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10)
  })
};

// API-specific schemas
const schemas = {
  camping: {
    create: Joi.object({
      title: Joi.string().required().min(3).max(100),
      description: Joi.string().required().min(10),
      price_per_night: Joi.number().required().min(0),
      max_guests: Joi.number().integer().required().min(1),
      location: commonSchemas.coordinates,
      amenities: Joi.array().items(commonSchemas.id)
    }),
    search: Joi.object({
      query: Joi.string().min(2),
      minPrice: Joi.number().min(0),
      maxPrice: Joi.number().min(0),
      guests: Joi.number().integer().min(1),
      startDate: commonSchemas.date,
      endDate: commonSchemas.date,
      ...commonSchemas.pagination
    })
  },
  booking: {
    create: Joi.object({
      camping_spot_id: commonSchemas.id.required(),
      start_date: commonSchemas.date.required(),
      end_date: commonSchemas.date.required(),
      guest_count: Joi.number().integer().min(1).required()
    })
  },
  auth: {
    register: Joi.object({
      email: commonSchemas.email.required(),
      password: commonSchemas.password.required(),
      full_name: Joi.string().required().min(2).max(100),
      is_seller: Joi.boolean()
    }),
    login: Joi.object({
      email: commonSchemas.email.required(),
      password: commonSchemas.password.required()
    })
  }
};

module.exports = {
  validate,
  schemas,
  commonSchemas
};
