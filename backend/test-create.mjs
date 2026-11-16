async function testCreate() {
  try {
    const email = `test${Date.now()}@staging.com`;
    const registerResponse = await fetch('http://localhost:8000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' })
    });
    const registerData = await registerResponse.json();
    console.log('Register:', registerData.success ? 'OK' : 'FAILED');
    
    const accessToken = registerData.data.access_token;
    
    const createResponse = await fetch('http://localhost:8000/api/jobs/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ title: 'Senior React Developer', companyName: 'TestCorp', location: 'India', remoteType: 'remote', employmentType: 'full_time', experienceLevel: 'senior' })
    });
    const createData = await createResponse.json();
    console.log('Status:', createResponse.status);
    console.log('POST /api/jobs/manual:', createData.success ? 'OK' : 'FAILED');
    console.log('Response:', JSON.stringify(createData, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testCreate();