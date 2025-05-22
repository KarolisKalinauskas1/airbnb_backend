const http = require('http');

function checkHealth(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: process.env.PORT || 3000,
      path: path,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log(`Health check for ${path}:`, result);
          resolve(result);
        } catch (e) {
          console.error(`Error parsing response from ${path}:`, e);
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`Problem with health check request to ${path}:`, e);
      reject(e);
    });

    req.end();
  });
}

async function main() {
  try {
    // Check both endpoints
    await checkHealth('/health');
    await checkHealth('/api/health');
    console.log('Health checks passed');
    process.exit(0);
  } catch (error) {
    console.error('Health check failed:', error);
    process.exit(1);
  }
}

main();
