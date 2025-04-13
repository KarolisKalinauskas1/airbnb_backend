const bodyParser = require('body-parser');

/**
 * Middleware that processes Stripe webhook requests.
 * This preserves the raw body needed for Stripe signature verification.
 */
const stripeWebhookMiddleware = bodyParser.raw({ 
  type: 'application/json' 
});

module.exports = {
  stripeWebhookMiddleware
};
