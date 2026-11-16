async function testAuth() {
  try {
    const email = `test${Date.now()}@staging.com`;
    const response = await fetch('http://localhost:8000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' })
    });
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
    if (data.success) {
      console.log('Access token:', data.data.access_token.substring(0, 20) + '...');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testAuth();