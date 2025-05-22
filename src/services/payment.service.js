const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class PaymentService {
    static async createCheckoutSession(bookingData) {
        // Validate input data
        const requiredFields = ['camper_id', 'user_id', 'start_date', 'end_date', 'number_of_guests', 'total'];
        const missingFields = requiredFields.filter(field => !bookingData[field]);
        
        if (missingFields.length > 0) {
            throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }

        // Format data for Stripe
        const sessionData = {
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: bookingData.spot_name || 'Camping Spot Booking',
                    },
                    unit_amount: Math.round(bookingData.total * 100), // Convert to cents
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${process.env.FRONTEND_URL}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/campers/${bookingData.camper_id}`,
            metadata: {
                camper_id: String(bookingData.camper_id),
                user_id: String(bookingData.user_id),
                start_date: new Date(bookingData.start_date).toISOString(),
                end_date: new Date(bookingData.end_date).toISOString(),
                number_of_guests: String(bookingData.number_of_guests),
                cost: String(bookingData.cost || bookingData.total),
                service_fee: String(bookingData.service_fee || '0'),
                total: String(bookingData.total)
            }
        };

        try {
            const session = await stripe.checkout.sessions.create(sessionData);
            return { 
                url: session.url,
                session_id: session.id,
                status: 'success'
            };
        } catch (error) {
            throw this.handleStripeError(error);
        }
    }

    static async handleSuccessfulPayment(session) {
        const { 
            camper_id, 
            user_id, 
            start_date, 
            end_date, 
            number_of_guests, 
            total 
        } = session.metadata;

        // Create booking record
        const booking = await prisma.bookings.create({
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
                }
            }
        });

        // Create transaction record
        await prisma.transaction.create({
            data: {
                amount: parseFloat(total),
                bookings: { connect: { booking_id: booking.booking_id } },
                status_booking_transaction: { connect: { status_id: 2 } }
            }
        });

        return booking;
    }

    static handleStripeError(error) {
        if (error.type === 'StripeInvalidRequestError') {
            if (error.message.includes('valid integer')) {
                return new Error('Invalid payment amount format');
            }
            return new Error(`Invalid payment request: ${error.message}`);
        }
        
        if (error.type === 'StripeAPIError') {
            return new Error('Payment service temporarily unavailable');
        }
        
        if (error.type === 'StripeAuthenticationError') {
            return new Error('Payment authentication error');
        }
        
        return new Error('Payment processing failed');
    }
}

module.exports = PaymentService;
