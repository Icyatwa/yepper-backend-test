// Method 1: Using external service to get public IP
const axios = require('axios');

async function getPublicIP() {
  try {
    console.log('🔍 Checking current public IP address...');
    
    // Try multiple services in case one is down
    const services = [
      'https://api.ipify.org?format=json',
      'https://ipapi.co/json/',
      'https://httpbin.org/ip'
    ];
    
    for (const service of services) {
      try {
        const response = await axios.get(service, { timeout: 5000 });
        let ip;
        
        if (service.includes('ipify')) {
          ip = response.data.ip;
        } else if (service.includes('ipapi')) {
          ip = response.data.ip;
        } else if (service.includes('httpbin')) {
          ip = response.data.origin;
        }
        
        console.log(`✅ Current public IP: ${ip}`);
        console.log(`🏢 Service used: ${service}`);
        return ip;
      } catch (err) {
        console.log(`❌ Failed to get IP from ${service}`);
        continue;
      }
    }
    
    throw new Error('All IP services failed');
  } catch (error) {
    console.error('❌ Error getting public IP:', error.message);
    return null;
  }
}

// Method 2: Add IP checking endpoint to your Express server
function addIPCheckEndpoint(app) {
  app.get('/api/check-ip', async (req, res) => {
    try {
      // Get client IP from request
      const clientIP = req.ip || 
                      req.connection.remoteAddress || 
                      req.socket.remoteAddress ||
                      (req.connection.socket ? req.connection.socket.remoteAddress : null);
      
      // Get server's public IP
      const publicIP = await getPublicIP();
      
      // Get forwarded IPs if behind proxy
      const forwardedFor = req.headers['x-forwarded-for'];
      const realIP = req.headers['x-real-ip'];
      
      res.json({
        message: '🔍 IP Address Information',
        data: {
          clientIP: clientIP,
          publicIP: publicIP,
          forwardedFor: forwardedFor,
          realIP: realIP,
          headers: {
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'x-real-ip': req.headers['x-real-ip'],
            'user-agent': req.headers['user-agent']
          }
        }
      });
      
      console.log('📊 IP Check Results:');
      console.log(`   Client IP: ${clientIP}`);
      console.log(`   Public IP: ${publicIP}`);
      console.log(`   X-Forwarded-For: ${forwardedFor}`);
      console.log(`   X-Real-IP: ${realIP}`);
      
    } catch (error) {
      res.status(500).json({
        message: 'Error checking IP',
        error: error.message
      });
    }
  });
}

// Method 3: Enhanced withdrawal function with IP checking
exports.initiateWithdrawalWithIPCheck = async (req, res) => {
  try {
    // Check current IP before making Flutterwave request
    const currentIP = await getPublicIP();
    console.log('🌐 Current server IP:', currentIP);
    console.log('🔒 Whitelisted IP in Flutterwave: 102.22.140.7');
    
    if (currentIP !== '102.22.140.7') {
      console.log('⚠️  IP MISMATCH DETECTED!');
      console.log(`   Current IP: ${currentIP}`);
      console.log(`   Expected IP: 102.22.140.7`);
      console.log('💡 Action needed: Update Flutterwave IP whitelist or check server configuration');
      
      return res.status(400).json({
        message: 'IP Address mismatch detected',
        currentIP: currentIP,
        whitelistedIP: '102.22.140.7',
        action: 'Please update your Flutterwave IP whitelist with the current IP',
        test_mode: true
      });
    }
    
    console.log('✅ IP matches whitelisted address');
    
    // Continue with original withdrawal logic...
    // ... rest of your withdrawal code
    
  } catch (error) {
    console.error('Error in IP check:', error);
    res.status(500).json({ 
      message: 'Error checking IP address',
      error: error.message,
      test_mode: true
    });
  }
};

// Method 4: Command line IP checker (run this as a separate script)
async function quickIPCheck() {
  console.log('🚀 Quick IP Address Check');
  console.log('========================');
  
  const ip = await getPublicIP();
  if (ip) {
    console.log(`\n📍 Your current public IP: ${ip}`);
    console.log(`🔒 Flutterwave whitelisted IP: 102.22.140.7`);
    
    if (ip === '102.22.140.7') {
      console.log('✅ IPs match! You should be able to access Flutterwave API');
    } else {
      console.log('❌ IP mismatch detected!');
      console.log('\n🛠️  Solutions:');
      console.log('   1. Update Flutterwave dashboard with new IP:', ip);
      console.log('   2. Or check if you\'re behind a proxy/load balancer');
      console.log('   3. Contact your hosting provider about static IP');
    }
  }
}

// Method 5: Use in your existing withdrawal controller
function addIPLoggingToWithdrawal() {
  // Add this at the beginning of your initiateWithdrawal function
  const logCurrentIP = async () => {
    try {
      const ip = await getPublicIP();
      console.log('🌐 FLUTTERWAVE REQUEST DEBUG:');
      console.log(`   Current Server IP: ${ip}`);
      console.log(`   Whitelisted IP: 102.22.140.7`);
      console.log(`   Match: ${ip === '102.22.140.7' ? '✅ Yes' : '❌ No'}`);
      return ip;
    } catch (error) {
      console.log('❌ Could not determine current IP');
      return null;
    }
  };
  
  return logCurrentIP;
}

// Export functions for use
module.exports = {
  getPublicIP,
  addIPCheckEndpoint,
  quickIPCheck,
  addIPLoggingToWithdrawal
};

// If running this file directly for quick check
if (require.main === module) {
  quickIPCheck();
}