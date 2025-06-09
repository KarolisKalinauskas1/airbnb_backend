const { prisma } = require('./src/config/prisma');

async function checkUsersTable() {
  try {
    console.log('Checking users table structure...');
    
    // Try to get a sample user to see what fields are available
    const sampleUser = await prisma.users.findFirst();
    console.log('Sample user data:', sampleUser);
    
    // Also try to describe the table structure using raw SQL
    const tableInfo = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'users' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;
    
    console.log('Users table columns:', tableInfo);
    
  } catch (error) {
    console.error('Error checking users table:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsersTable();
