const { runMigration, verifyMigration } = require('./backend/src/scripts/localStorage-migration');

/**
 * Test the migration script
 */
async function testMigration() {
  console.log('🧪 Testing localStorage to MongoDB migration...\n');
  
  try {
    // Run the migration
    await runMigration();
    
    console.log('\n✅ Migration test completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration test failed:', error.message);
    process.exit(1);
  }
}

// Run test if called directly
if (require.main === module) {
  testMigration();
}

module.exports = { testMigration };