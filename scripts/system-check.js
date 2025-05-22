const ServiceHealthCheck = require('../utils/service-health');
const PaymentService = require('../services/payment.service');

async function runSystemCheck() {
    console.log('\nRunning system health check...');
    
    // Check all external services
    const healthStatus = await ServiceHealthCheck.checkAllServices();
    console.log('\nService Health Status:', JSON.stringify(healthStatus, null, 2));

    if (!healthStatus.healthy) {
        console.error('❌ Some services are unhealthy!');
        process.exit(1);
    }

    // Test payment flow with mock data
    console.log('\nTesting payment flow...');
    try {
        const mockBookingData = {
            camper_id: '1',
            user_id: '1',
            start_date: new Date(),
            end_date: new Date(Date.now() + 86400000),
            number_of_guests: 2,
            total: 100,
            spot_name: 'Test Camping Spot'
        };

        const session = await PaymentService.createCheckoutSession(mockBookingData);
        console.log('✓ Payment session creation successful');
        
        // Validate session data
        if (!session.url || !session.url.includes('checkout.stripe.com')) {
            throw new Error('Invalid Stripe URL');
        }
        
        console.log('✓ Payment URL validation successful');
    } catch (error) {
        console.error('❌ Payment flow test failed:', error);
        process.exit(1);
    }

    // Test environment variables
    console.log('\nValidating environment variables...');
    const requiredVars = [
        'DATABASE_URL',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'SUPABASE_URL',
        'SUPABASE_ANON_KEY',
        'JWT_SECRET',
        'FRONTEND_URL'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
        console.error('❌ Missing required environment variables:', missingVars);
        process.exit(1);
    }

    console.log('✓ Environment variables validated');

    // Test database connection pool
    console.log('\nTesting database connection pool...');
    try {
        const promises = Array(5).fill().map(() => 
            prisma.$queryRaw`SELECT 1`
        );
        await Promise.all(promises);
        console.log('✓ Database connection pool test successful');
    } catch (error) {
        console.error('❌ Database connection pool test failed:', error);
        process.exit(1);
    }

    console.log('\n✅ All systems operational!');
    process.exit(0);
}

// Run the check
runSystemCheck().catch(error => {
    console.error('System check failed:', error);
    process.exit(1);
});
