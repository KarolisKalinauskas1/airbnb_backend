const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Helper function to safely create owner record with retries
 */
async function createOwnerRecord(userId, license = 'none', maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Check if owner record already exists
      const existingOwner = await prisma.owner.findUnique({
        where: { owner_id: userId }
      });
      
      if (existingOwner) {
        console.log(`Owner record already exists for user ${userId}`);
        return true;
      }

      // Create owner record
      await prisma.owner.create({
        data: {
          owner_id: userId,
          license: license || 'none'
        }
      });
      
      console.log(`Successfully created owner record for user ${userId}, license: ${license || 'none'}`);
      return true;
    } catch (error) {
      console.error(`Failed to create owner record (attempt ${attempt}/${maxRetries}):`, error);
      
      if (attempt === maxRetries) {
        console.error('Max retries reached for owner record creation');
        return false;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  return false;
}

module.exports = {
  createOwnerRecord
};
