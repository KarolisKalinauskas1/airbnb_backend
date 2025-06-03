const { z } = require('zod');

// Schema for user registration
const registerUserSchema = z.object({
  email: z.string().email({
    message: "Invalid email address"
  }),
  password: z.string().min(8, {
    message: "Password must be at least 8 characters"
  }),
  full_name: z.string().min(2, {
    message: "Full name must be at least 2 characters"
  }),
  is_seller: z.union([z.string(), z.boolean(), z.number(), z.enum(['0', '1', 'true', 'false'])]).optional().transform(val => {
    if (val === '1' || val === 1 || val === true || val === 'true') return true;
    return false;
  }),
  license: z.string().optional().nullable()
});

// Schema for user login
const loginUserSchema = z.object({
  email: z.string().email({
    message: "Invalid email address"
  }),
  password: z.string().min(1, {
    message: "Password is required"
  })
});

// Schema for password change
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, {
    message: "Current password is required"
  }),
  newPassword: z.string().min(8, {
    message: "New password must be at least 8 characters"
  })
});

// Schema for user creation (POST /api/users)
const createUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string(),
  is_seller: z.boolean().optional().default(false),
  license: z.string().optional(),
  auth_user_id: z.string().optional()
});

module.exports = {
  registerUserSchema,
  loginUserSchema,
  createUserSchema,
  changePasswordSchema
};
