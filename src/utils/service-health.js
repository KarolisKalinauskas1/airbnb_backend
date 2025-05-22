const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const formData = require('form-data');
const Mailgun = require('mailgun.js');

class ServiceHealthCheck {
    static async checkStripe() {
        try {
            await stripe.paymentIntents.list({ limit: 1 });
            return { status: 'healthy', service: 'Stripe' };
        } catch (error) {
            return { status: 'unhealthy', service: 'Stripe', error: error.message };
        }
    }

    static async checkSupabase() {
        try {
            const supabase = createClient(
                process.env.SUPABASE_URL,
                process.env.SUPABASE_SERVICE_ROLE_KEY
            );
            const { data, error } = await supabase.from('public_users').select('count');
            if (error) throw error;
            return { status: 'healthy', service: 'Supabase' };
        } catch (error) {
            return { status: 'unhealthy', service: 'Supabase', error: error.message };
        }
    }

    static async checkDatabase() {
        const prisma = new PrismaClient();
        try {
            await prisma.$connect();
            await prisma.$queryRaw`SELECT 1`;
            await prisma.$disconnect();
            return { status: 'healthy', service: 'Database' };
        } catch (error) {
            return { status: 'unhealthy', service: 'Database', error: error.message };
        }
    }

    static async checkMailgun() {
        try {
            const mailgun = new Mailgun(formData);
            const mg = mailgun.client({
                username: 'api',
                key: process.env.MAILGUN_API_KEY,
            });
            await mg.get(`/domains/${process.env.MAILGUN_DOMAIN}`);
            return { status: 'healthy', service: 'Mailgun' };
        } catch (error) {
            return { status: 'unhealthy', service: 'Mailgun', error: error.message };
        }
    }

    static async checkAllServices() {
        const results = await Promise.allSettled([
            this.checkStripe(),
            this.checkSupabase(),
            this.checkDatabase(),
            this.checkMailgun()
        ]);

        const serviceStatus = results.map(result => {
            if (result.status === 'fulfilled') {
                return result.value;
            }
            return { 
                status: 'error', 
                service: 'unknown', 
                error: result.reason.message 
            };
        });

        const allHealthy = serviceStatus.every(s => s.status === 'healthy');
        const timestamp = new Date().toISOString();

        return {
            timestamp,
            healthy: allHealthy,
            services: serviceStatus
        };
    }
}

module.exports = ServiceHealthCheck;
