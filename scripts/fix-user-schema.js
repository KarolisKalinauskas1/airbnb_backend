/**
 * This script helps fix inconsistencies in the user database schema
 * It will attempt to ensure the user table has proper columns and types
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function fixUserSchema() {
  console.log('Starting user schema check and fix...');
  
  const prisma = new PrismaClient({
    log: ['error', 'warn']
  });
  
  try {
    await prisma.$connect();
    console.log('✅ Connected to database');
    
    // Detect which table we should use
    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND
            (table_name LIKE '%user%' OR table_name LIKE '%User%')
    `;
    
    if (tables.length === 0) {
      console.error('❌ No user tables found in the database');
      return;
    }
    
    console.log('Found user tables:');
    tables.forEach((t, i) => console.log(`${i+1}. ${t.table_name}`));
    
    // For each table, check if it has the isowner column
    for (const tableObj of tables) {
      const tableName = tableObj.table_name;
      console.log(`\nChecking table: ${tableName}`);
      
      try {
        // Check if table has isowner column
        const columns = await prisma.$queryRaw`
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_name = ${tableName}
        `;
        
        console.log(`Columns in ${tableName}:`);
        columns.forEach(c => console.log(`- ${c.column_name} (${c.data_type})`));
        
        // Look for isowner or similar columns
        const ownerColumns = columns.filter(c => 
          c.column_name.toLowerCase().includes('owner') ||
          c.column_name.toLowerCase().includes('seller')
        );
        
        if (ownerColumns.length > 0) {
          console.log('✅ Found owner-related columns:', ownerColumns.map(c => c.column_name).join(', '));
          
          // For each owner column, check its data type and values
          for (const col of ownerColumns) {
            console.log(`\nAnalyzing column: ${col.column_name}`);
            const values = await prisma.$queryRaw`
              SELECT DISTINCT ${prisma.$raw(col.column_name)}
              FROM ${prisma.$raw(tableName)}
              LIMIT 10
            `;
            
            console.log('Distinct values:', JSON.stringify(values));
            
            // If the column is a text/varchar and contains only 0/1 values
            if (['character varying', 'text'].includes(col.data_type)) {
              console.log('Column is string type. Checking if we should convert to integer...');
              
              // Analyze values to see if they're all numeric
              const allNumeric = values.every(v => {
                const val = v[col.column_name];
                return val === '0' || val === '1' || val === 0 || val === 1;
              });
              
              if (allNumeric) {
                console.log('All values are 0/1, considering converting to integer...');
                // This would require a manual database migration
                console.log(`Run this SQL to convert to integer:
ALTER TABLE ${tableName} 
ALTER COLUMN ${col.column_name} TYPE INTEGER 
USING (${col.column_name}::integer);`);
              }
            }
          }
        } else {
          console.warn('⚠️ No owner column found in this table');
        }
      } catch (error) {
        console.error(`Error inspecting ${tableName}:`, error);
      }
    }
  } catch (error) {
    console.error('Error during schema fix:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixUserSchema().catch(console.error);
