const { prisma } = require('./src/config/prisma');

async function runAuthMigration() {
  try {
    console.log('Running auth_user_id migration...');
    
    // Check if the column already exists
    const checkQuery = `
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'users' 
      AND column_name = 'auth_user_id'
    `;
    
    const columnExists = await prisma.$queryRawUnsafe(checkQuery);
    
    if (columnExists.length === 0) {
      // Add the column
      await prisma.$executeRawUnsafe('ALTER TABLE public.users ADD COLUMN auth_user_id UUID');
      console.log('✅ Added auth_user_id column to users table');
      
      // Create an index to improve lookup performance
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON public.users(auth_user_id)');
      console.log('✅ Created index on auth_user_id column');
    } else {
      console.log('✅ auth_user_id column already exists in users table');
    }
    
    await prisma.$disconnect();
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

runAuthMigration();
