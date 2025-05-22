const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, {
    maxNetworkRetries: 2, // Built-in retry mechanism for network issues
    timeout: 10000,       // 10 second timeout
    apiVersion: '2023-10-16' // Lock API version for stability
});

/**
 * Service class for Stripe-specific operations
 */
class StripeService {
    /**
     * Initialize a Stripe checkout session
     */
    static async createCheckoutSession(sessionData) {
        try {
            return await stripe.checkout.sessions.create(sessionData);
        } catch (error) {
            console.error('Stripe checkout session creation failed:', error);
            throw this.handleStripeError(error);
        }
    }

    /**
     * Standardize Stripe error handling
     */
    static handleStripeError(error) {
        const errorMap = {
            'StripeCardError': 'Your card was declined. Please check your card details and try again.',
            'StripeInvalidRequestError': 'Invalid payment request. Please check your details and try again.',
            'StripeAPIError': 'Our payment service is temporarily unavailable. Please try again in a few moments.',
            'StripeConnectionError': 'Could not connect to payment service. Please check your internet connection.',
            'StripeAuthenticationError': 'Payment authentication failed. Please contact support.',
            'StripeRateLimitError': 'Too many payment attempts. Please wait a moment and try again.',
            'StripeIdempotencyError': 'Duplicate payment request detected.',
            'card_declined': 'Your card was declined. Please try another card.',
            'expired_card': 'Your card has expired.',
            'incorrect_cvc': 'Your card\'s security code is incorrect.',
            'processing_error': 'An error occurred while processing your card.',
        };

        // Get specific error message or use generic one
        const errorMessage = errorMap[error.type || error.code] || 'An error occurred while processing your payment.';

        return {
            message: errorMessage,
            code: error.type || error.code || 'unknown_error',
            statusCode: this.getHttpStatusCode(error),
            raw: process.env.NODE_ENV === 'development' ? error : undefined
        };
    }

    /**
     * Map Stripe errors to HTTP status codes
     */
    static getHttpStatusCode(error) {
        const statusCodeMap = {
            'StripeCardError': 402, // Payment Required
            'StripeInvalidRequestError': 400, // Bad Request
            'StripeAPIError': 503, // Service Unavailable
            'StripeConnectionError': 503, // Service Unavailable
            'StripeAuthenticationError': 401, // Unauthorized
            'StripeRateLimitError': 429, // Too Many Requests
            'StripeIdempotencyError': 409, // Conflict
        };

        return statusCodeMap[error.type] || 500;
    }

    /**
     * Retrieve a Stripe checkout session
     */
    static async retrieveSession(sessionId) {
        try {
            return await stripe.checkout.sessions.retrieve(sessionId, {
                expand: ['payment_intent', 'payment_intent.charges']
            });
        } catch (error) {
            console.error('Error retrieving Stripe session:', error);
            throw this.handleStripeError(error);
        }
    }

    /**
     * Create a refund for a charge
     */
    static async createRefund(chargeId, options = {}) {
        try {
            return await stripe.refunds.create({
                charge: chargeId,
                ...options
            });
        } catch (error) {
            console.error('Error creating refund:', error);
            throw this.handleStripeError(error);
        }
    }
}

module.exports = StripeService;
