/**
 * Script to check database tables and find the correct user table
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDatabaseTables() {
  console.log('Checking database tables...');
  
  try {
    // Try to query the $queryRaw API to get table names
    console.log('Attempting to get table names...');
    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    
    console.log('Available tables:');
    tables.forEach(table => {
      console.log(`- ${table.table_name}`);
    });
    
    // Check for user tables specifically
    const userTables = tables.filter(t => 
      t.table_name.includes('user') || 
      t.table_name.includes('public_user')
    );
    
    console.log('\nUser-related tables:');
    userTables.forEach(table => {
      console.log(`- ${table.table_name}`);
    });
    
    // Try to query each potential user table
    console.log('\nTrying to query user tables...');
    
    for (const table of userTables) {
      console.log(`\nQuerying ${table.table_name}...`);
      try {
        const userCount = await prisma[table.table_name].count();
        console.log(`- Count: ${userCount} records`);
        
        if (userCount > 0) {
          const firstUser = await prisma[table.table_name].findFirst();
          console.log('- Sample user fields:', Object.keys(firstUser).join(', '));
        }
      } catch (error) {
        console.error(`- Error querying ${table.table_name}:`, error.message);
      }
    }
    
  } catch (error) {
    console.error('Error querying database:', error);
    
    // Fallback: try to access tables directly through Prisma
    console.log('\nFallback: checking tables directly through Prisma...');
    
    // List of potential user table names
    const potentialTables = ['users', 'public_users', 'Users', 'PublicUsers', 'user', 'User'];
    
    for (const tableName of potentialTables) {
      try {
        if (prisma[tableName]) {
          const count = await prisma[tableName].count();
          console.log(`- ${tableName}: ${count} records`);
          
          if (count > 0) {
            const sample = await prisma[tableName].findFirst();
            console.log(`- Fields: ${Object.keys(sample).join(', ')}`);
          }
        } else {
          console.log(`- ${tableName}: Not available in Prisma client`);
        }
      } catch (error) {
        console.log(`- ${tableName}: Error - ${error.message}`);
      }
    }
  }
  
  await prisma.$disconnect();
}

checkDatabaseTables().catch(error => {
  console.error('Script error:', error);
  prisma.$disconnect();
});
