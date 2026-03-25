// Use native fetch available in Node.js 18+


const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

const routesToTest = [
  { path: '/login', expectedStatus: 200, name: 'Login Page' },
  { path: '/signup', expectedStatus: 200, name: 'Signup Page' },
  { path: '/forgot-password', expectedStatus: 200, name: 'Forgot Password Page' },
  { path: '/admin', expectedStatus: 200, name: 'Admin Login Page' },
  { path: '/courses', expectedStatus: 200, name: 'Courses Catalog' },
  { path: '/health', expectedStatus: 200, name: 'Health Check' }
];

async function runSmokeTest() {
  console.log('🚀 Starting Smoke Test (QA Mode)...');
  console.log(`📡 Base URL: ${BASE_URL}`);
  
  let passedCount = 0;
  let failedCount = 0;

  for (const route of routesToTest) {
    try {
      console.log(`🧪 Testing ${route.name} [${route.path}]...`);
      const response = await fetch(`${BASE_URL}${route.path}`);
      
      if (response.status === route.expectedStatus) {
        console.log(`✅ ${route.name} passed (${response.status})`);
        passedCount++;
      } else {
        console.error(`❌ ${route.name} FAILED! Expected ${route.expectedStatus}, got ${response.status}`);
        failedCount++;
      }
    } catch (error) {
      console.error(`❌ ${route.name} FAILED! Error: ${error.message}`);
      failedCount++;
    }
  }

  // Test a protected route (should redirect to /login)
  try {
    console.log('🧪 Testing Protected Route (Dashboard) [should redirect]...');
    const response = await fetch(`${BASE_URL}/dashboard`, { redirect: 'manual' });
    if (response.status === 302) {
      console.log('✅ Dashboard redirect passed (302)');
      passedCount++;
    } else {
      console.error(`❌ Dashboard redirect FAILED! Got ${response.status}`);
      failedCount++;
    }
  } catch (error) {
    console.error(`❌ Dashboard redirect FAILED! Error: ${error.message}`);
    failedCount++;
  }

  console.log('\n📊 TEST SUMMARY');
  console.log(`✅ Passed: ${passedCount}`);
  console.log(`❌ Failed: ${failedCount}`);

  if (failedCount > 0) {
    console.error('\n🛑 SMOKE TEST FAILED');
    process.exit(1);
  } else {
    console.log('\n✨ SMOKE TEST PASSED');
    process.exit(0);
  }
}

runSmokeTest();
