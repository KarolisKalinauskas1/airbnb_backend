const { z } = require('zod');

// Schema for creating a booking
const createBookingSchema = z.object({
  camper_id: z.number().int().positive(),
  user_id: z.number().int().positive(),
  start_date: z.string().refine(value => !isNaN(Date.parse(value)), {
    message: "Invalid start date format"
  }),
  end_date: z.string().refine(value => !isNaN(Date.parse(value)), {
    message: "Invalid end date format"
  }),
  number_of_guests: z.number().int().positive().max(20),
  cost: z.number().positive(),
  spot_name: z.string().optional(),
  spot_image: z.string().optional()
}).refine(data => {
  const start = new Date(data.start_date);
  const end = new Date(data.end_date);
  return end > start;
}, {
  message: "End date must be after start date",
  path: ["end_date"]
});

// Schema for checkout session creation
const createCheckoutSessionSchema = createBookingSchema.extend({
  // Additional fields specific to checkout
});

module.exports = {
  createBookingSchema,
  createCheckoutSessionSchema
};
