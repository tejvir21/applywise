async function testJobs() {
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
    
    // Test GET /api/jobs
    const listResponse = await fetch('http://localhost:8000/api/jobs', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const listData = await listResponse.json();
    console.log('GET /api/jobs:', listData.success ? 'OK' : 'FAILED', '- Total:', listData.data?.total);
    
    // Test POST /api/jobs/manual
    const uniqueTitle = `Senior React Developer ${Date.now()}`;
    const createResponse = await fetch('http://localhost:8000/api/jobs/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ title: uniqueTitle, companyName: 'TestCorp', location: 'India', remoteType: 'remote', employmentType: 'full_time', experienceLevel: 'senior' })
    });
    const createData = await createResponse.json();
    console.log('POST /api/jobs/manual:', createData.success ? 'OK' : 'FAILED');
    const jobId = createData.data?.id;
    
    // Test GET /api/jobs/:id
    if (jobId) {
      const detailResponse = await fetch(`http://localhost:8000/api/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const detailData = await detailResponse.json();
      console.log('GET /api/jobs/:id:', detailData.success ? 'OK' : 'FAILED');
    }
    
    // Test POST /api/jobs/:id/save
    if (jobId) {
      const saveResponse = await fetch(`http://localhost:8000/api/jobs/${jobId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ notes: 'Test note' })
      });
      const saveData = await saveResponse.json();
      console.log('POST /api/jobs/:id/save:', saveData.success ? 'OK' : 'FAILED');
    }
    
    // Test GET /api/jobs/saved
    const savedResponse = await fetch('http://localhost:8000/api/jobs/saved', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const savedData = await savedResponse.json();
    console.log('GET /api/jobs/saved:', savedData.success ? 'OK' : 'FAILED');
    
    // Test POST /api/jobs/import/mock
    const mockResponse = await fetch('http://localhost:8000/api/jobs/import/mock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ count: 3 })
    });
    const mockData = await mockResponse.json();
    console.log('POST /api/jobs/import/mock:', mockData.success ? 'OK' : 'FAILED', '- Imported:', mockData.data?.imported);
    
    // Test unauthenticated access
    const unauthResponse = await fetch('http://localhost:8000/api/jobs');
    console.log('Unauthenticated GET /api/jobs:', unauthResponse.status === 401 ? 'OK (401)' : 'FAILED');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testJobs();