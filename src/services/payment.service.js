const { PrismaClient } = require('@prisma/client');
const StripeService = require('./stripe.service');
const prisma = new PrismaClient();

// Circuit breaker configuration
const CIRCUIT_CONFIG = {
    FAILURE_THRESHOLD: 5,
    RESET_TIMEOUT: 60000, // 1 minute
    BACKOFF_BASE: 2000,   // Base delay for exponential backoff (2 seconds)
    MAX_RETRIES: 3
};

// Circuit breaker state
let failureCount = 0;
let lastFailureTime = null;
let circuitOpen = false;

class PaymentService {
    /**
     * Retry an operation with exponential backoff and circuit breaker
     */
    static async retryOperation(operation) {
        if (this.isCircuitOpen()) {
            throw new Error('Payment service is temporarily unavailable');
        }

        let lastError;
        for (let attempt = 1; attempt <= CIRCUIT_CONFIG.MAX_RETRIES; attempt++) {
            try {
                const result = await operation();
                this.resetCircuitBreaker();
                return result;
            } catch (error) {
                lastError = error;
                console.error(`Payment attempt ${attempt} failed:`, error.message);
                
                if (attempt === CIRCUIT_CONFIG.MAX_RETRIES) {
                    this.recordFailure();
                    break;
                }
                
                // Exponential backoff with jitter
                const baseDelay = CIRCUIT_CONFIG.BACKOFF_BASE * Math.pow(2, attempt - 1);
                const jitter = Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
            }
        }
        throw lastError;
    }

    /**
     * Check if the circuit breaker is open
     */
    static isCircuitOpen() {
        if (!circuitOpen) return false;

        // Check if we can close the circuit
        if (lastFailureTime && Date.now() - lastFailureTime >= CIRCUIT_CONFIG.RESET_TIMEOUT) {
            this.resetCircuitBreaker();
            return false;
        }
        return true;
    }

    /**
     * Record a failure and potentially open the circuit
     */
    static recordFailure() {
        failureCount++;
        lastFailureTime = Date.now();
        
        if (failureCount >= CIRCUIT_CONFIG.FAILURE_THRESHOLD) {
            circuitOpen = true;
        }
        
        console.warn(`Payment service failure count: ${failureCount}`);
    }

    /**
     * Reset the circuit breaker state
     */
    static resetCircuitBreaker() {
        failureCount = 0;
        lastFailureTime = null;
        circuitOpen = false;
    }

    /**
     * Create a checkout session with validation and error handling
     */
    static async createCheckoutSession(bookingData) {
        return this.retryOperation(async () => {
            // Validate and sanitize input data
            this.validateBookingData(bookingData);
            const sessionData = this.formatSessionData(bookingData);
            
            try {
                const session = await StripeService.createCheckoutSession(sessionData);
                return {
                    url: session.url,
                    session_id: session.id,
                    status: 'success'
                };
            } catch (error) {
                // Let the retry mechanism handle the error
                throw error;
            }
        });
    }

    /**
     * Retrieve a checkout session with error handling
     */
    static async getCheckoutSession(sessionId) {
        return this.retryOperation(async () => {
            try {
                return await StripeService.retrieveSession(sessionId);
            } catch (error) {
                throw error;
            }
        });
    }

    /**
     * Handle successful payment completion
     */
    static async handleSuccessfulPayment(session) {
        // Extract and validate metadata
        const { 
            camper_id, 
            user_id, 
            start_date, 
            end_date, 
            number_of_guests, 
            total 
        } = session.metadata;

        // Start a transaction to ensure data consistency
        return await prisma.$transaction(async (tx) => {
            // Create booking record
            const booking = await tx.bookings.create({
                data: {
                    start_date: new Date(start_date),
                    end_date: new Date(end_date),
                    number_of_guests: parseInt(number_of_guests),
                    cost: parseFloat(total),
                    created_at: new Date(),
                    camping_spot: { connect: { camping_spot_id: parseInt(camper_id) } },
                    users: { connect: { user_id: parseInt(user_id) } },
                    status_booking_transaction: { connect: { status_id: 2 } } // Confirmed status
                },
                include: {
                    camping_spot: {
                        include: {
                            images: true,
                            location: true
                        }
                    },
                    users: true
                }
            });

            // Create transaction record
            await tx.transaction.create({
                data: {
                    amount: parseFloat(total),
                    created_at: new Date(),
                    bookings: { connect: { booking_id: booking.booking_id } },
                    status_booking_transaction: { connect: { status_id: 2 } }
                }
            });

            return booking;
        });
    }

    /**
     * Create a refund with error handling
     */
    static async createRefund(bookingId, reason = '') {
        return this.retryOperation(async () => {
            try {
                // Get the booking and associated transaction
                const booking = await prisma.bookings.findUnique({
                    where: { booking_id: bookingId },
                    include: {
                        transaction: true
                    }
                });

                if (!booking || !booking.transaction) {
                    throw new Error('Booking or transaction not found');
                }

                // Create the refund
                const refund = await StripeService.createRefund(booking.transaction.stripe_charge_id, {
                    reason: reason || 'requested_by_customer'
                });

                // Update booking status
                await prisma.bookings.update({
                    where: { booking_id: bookingId },
                    data: {
                        status_id: 4 // Refunded status
                    }
                });

                return refund;
            } catch (error) {
                throw error;
            }
        });
    }    /**
     * Validate booking data
     */
    static validateBookingData(bookingData) {
        const requiredFields = ['camper_id', 'user_id', 'start_date', 'end_date', 'number_of_guests', 'total'];
        const missingFields = requiredFields.filter(field => !bookingData[field]);
        
        if (missingFields.length > 0) {
            throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }

        // Validate types - ensure numbers are properly parsed
        if (isNaN(parseFloat(bookingData.total)) || parseFloat(bookingData.total) <= 0) {
            throw new Error('Invalid payment amount');
        }

        if (isNaN(parseInt(bookingData.number_of_guests)) || parseInt(bookingData.number_of_guests) <= 0) {
            throw new Error('Invalid number of guests');
        }

        // Parse dates with proper error handling
        try {
            const start = new Date(bookingData.start_date);
            const end = new Date(bookingData.end_date);
            
            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                throw new Error('Invalid date format');
            }
            
            if (start >= end) {
                throw new Error('End date must be after start date');
            }
            
            // Check that dates are not in the past
            if (start < new Date()) {
                throw new Error('Start date cannot be in the past');
            }
        } catch (error) {
            throw new Error(`Date validation error: ${error.message}`);
        }
        const end = new Date(bookingData.end_date);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new Error('Invalid dates');
        }
        
        if (end <= start) {
            throw new Error('End date must be after start date');
        }

        // Validate past dates
        const now = new Date();
        if (start < now) {
            throw new Error('Start date cannot be in the past');
        }
    }    /**
     * Format session data for Stripe
     */
    static formatSessionData(bookingData) {
        // Ensure the metadata is properly sanitized and all values are valid
        const metadata = this.sanitizeMetadata(bookingData);

        // Ensure we have a valid price by parsing as float and rounding to nearest cent
        const unitAmount = Math.round(parseFloat(bookingData.total) * 100);
        
        // Provide a fallback name if none is provided
        const spotName = bookingData.spot_name || `Camping Spot #${bookingData.camper_id}`;
        
        // Get frontend URL from environment variable with fallback
        const frontendUrl = process.env.FRONTEND_URL || 'https://airbnb-frontend-i8p5-git-main-karoliskalinauskas1s-projects.vercel.app';
        
        // Properly format dates for display
        const startDate = new Date(bookingData.start_date).toLocaleDateString();
        const endDate = new Date(bookingData.end_date).toLocaleDateString();
        
        return {
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: spotName,
                        description: `Booking from ${startDate} to ${endDate} for ${bookingData.number_of_guests} guests`,
                    },
                    unit_amount: unitAmount,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${frontendUrl}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${frontendUrl}/campers/${bookingData.camper_id}`,
            metadata
        };
    }

    /**
     * Sanitize metadata for Stripe
     */
    static sanitizeMetadata(bookingData) {
        const metadata = {};
        const allowedFields = [
            'camper_id', 'user_id', 'start_date', 'end_date',
            'number_of_guests', 'cost', 'service_fee', 'total'
        ];

        allowedFields.forEach(field => {
            if (bookingData[field] !== undefined) {
                let value = bookingData[field];
                
                // Convert dates to ISO string
                if (field.includes('date')) {
                    value = new Date(value).toISOString();
                }
                
                // Convert numbers to strings for Stripe metadata
                if (typeof value === 'number') {
                    value = String(value);
                }
                
                metadata[field] = value;
            }
        });

        return metadata;
    }
}

module.exports = PaymentService;
