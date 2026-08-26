const http = require('http');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    if (data) {
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        let parsed = responseBody;
        try {
          parsed = JSON.parse(responseBody);
        } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING BACKEND API VERIFICATION TESTS ---');
  
  try {
    const testUsername = 'AdminTest_' + Date.now().toString(36);
    // 1. Register Admin User
    console.log('\n1. Testing User Registration...');
    const regRes = await makeRequest('POST', '/api/auth/register', {
      name: testUsername,
      pin: '1234'
    });
    console.log('Status Code:', regRes.statusCode);
    console.log('Response Body:', regRes.body);
    if (regRes.statusCode !== 200) throw new Error('Registration failed');
    const adminUser = regRes.body.user;

    // 2. Login
    console.log('\n2. Testing User Login...');
    const loginRes = await makeRequest('POST', '/api/auth/login', {
      name: testUsername,
      pin: '1234'
    });
    console.log('Status Code:', loginRes.statusCode);
    console.log('Response Body:', loginRes.body);
    if (loginRes.statusCode !== 200) throw new Error('Login failed');

    // 3. Create Contact
    console.log('\n3. Testing Contact Creation...');
    const contactRes = await makeRequest('POST', '/api/contacts', {
      name: 'Test Lead',
      company: 'Acme Corp',
      niche: 'Tech',
      phone: '1234567890',
      email: 'test@acme.com',
      notes: 'Initial notes',
      status: 'new'
    }, { 'X-User-ID': adminUser.id });
    console.log('Status Code:', contactRes.statusCode);
    console.log('Response Body:', contactRes.body);
    if (contactRes.statusCode !== 200) throw new Error('Contact creation failed');
    const contact = contactRes.body;

    // 4. Get Contacts
    console.log('\n4. Testing List Contacts...');
    const listRes = await makeRequest('GET', '/api/contacts', null, { 'X-User-ID': adminUser.id });
    console.log('Status Code:', listRes.statusCode);
    console.log('Contacts Count:', listRes.body.length);
    if (listRes.statusCode !== 200 || listRes.body.length === 0) throw new Error('Listing contacts failed');

    // 5. Log Touch
    console.log('\n5. Testing Touch Logging...');
    const touchRes = await makeRequest('POST', `/api/contacts/${contact.id}/touches`, {
      channel: 'Call',
      outcome: 'Connected',
      notes: 'First call, they are interested.'
    }, { 'X-User-ID': adminUser.id });
    console.log('Status Code:', touchRes.statusCode);
    console.log('Response Body:', touchRes.body);
    if (touchRes.statusCode !== 200) throw new Error('Touch logging failed');

    // 6. Get Admin Users list
    console.log('\n6. Testing Admin Get Users...');
    const usersRes = await makeRequest('GET', '/api/admin/users', null, { 'X-User-ID': adminUser.id });
    console.log('Status Code:', usersRes.statusCode);
    
    if (adminUser.role === 'admin') {
      console.log('Users Count:', usersRes.body.length);
      console.log('Users List:', usersRes.body);
      if (usersRes.statusCode !== 200) throw new Error('Fetching admin users failed');
    } else {
      console.log('Response Body:', usersRes.body);
      if (usersRes.statusCode !== 403) throw new Error('Expected 403 Forbidden for Caller on admin users list');
      console.log('✅ Access correctly forbidden for Caller.');
    }

    // 7. Get Activity Log
    console.log('\n7. Testing Admin Get Activity Log...');
    const actRes = await makeRequest('GET', '/api/admin/activity', null, { 'X-User-ID': adminUser.id });
    console.log('Status Code:', actRes.statusCode);
    
    if (adminUser.role === 'admin') {
      console.log('Recent Logs:', actRes.body.slice(0, 3));
      if (actRes.statusCode !== 200 || actRes.body.length === 0) throw new Error('Fetching activity logs failed');
    } else {
      console.log('Response Body:', actRes.body);
      if (actRes.statusCode !== 403) throw new Error('Expected 403 Forbidden for Caller on admin activity log');
      console.log('✅ Access correctly forbidden for Caller.');
    }

    console.log('\n--- ALL BACKEND API TESTS COMPLETED SUCCESSFULLY ---');
  } catch (err) {
    console.error('\n❌ Test failed with error:', err.message);
    process.exit(1);
  }
}

runTests();
