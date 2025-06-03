#!/usr/bin/env node
/**
 * Script to check triggers and constraints on the users table
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function checkUsersTableTriggers() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Checking users table triggers and constraints...');
    
    // Query triggers
    const triggers = await prisma.$queryRaw`
      SELECT 
        trigger_name,
        event_manipulation,
        event_object_table,
        action_statement,
        action_timing
      FROM information_schema.triggers
      WHERE event_object_table = 'users'
        AND event_object_schema = 'public'
    `;
    
    console.log('\nTriggers on users table:');
    if (triggers.length === 0) {
      console.log('No triggers found');
    } else {
      triggers.forEach(trig => {
        console.log(`- ${trig.trigger_name} (${trig.action_timing} ${trig.event_manipulation})`);
        console.log(`  Statement: ${trig.action_statement}`);
      });
    }
    
    // Query constraints
    const constraints = await prisma.$queryRaw`
      SELECT 
        constraint_name,
        constraint_type,
        table_name,
        check_clause
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.check_constraints cc 
        ON tc.constraint_name = cc.constraint_name
      WHERE tc.table_name = 'users'
        AND tc.table_schema = 'public'
    `;
    
    console.log('\nConstraints on users table:');
    if (constraints.length === 0) {
      console.log('No constraints found');
    } else {
      constraints.forEach(con => {
        console.log(`- ${con.constraint_name} (${con.constraint_type})`);
        if (con.check_clause) {
          console.log(`  Check: ${con.check_clause}`);
        }
      });
    }
  } catch (error) {
    console.error('Error querying database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsersTableTriggers().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
