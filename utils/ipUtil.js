// utils/ipUtil.js
const axios = require('axios');

const IP_UPDATE_INTERVAL = 1000 * 60 * 60; // 1 hour
let currentIP = null;
let lastIPUpdateTime = null;

const updateFlutterwaveIPWhitelist = async (ip) => {
  try {
    // First verify if IP is already whitelisted
    const verifyResponse = await axios.get(
      'https://api.flutterwave.com/v3/transactions/webhook-ips',
      {
        headers: {
          'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (verifyResponse.data?.data?.includes(ip)) {
      console.log(`IP ${ip} is already whitelisted`);
      return true;
    }

    const response = await axios.post(
      'https://api.flutterwave.com/v3/transactions/webhook-whitelist',
      { 
        ip_address: ip, // Single IP format
        ip_whitelist: [ip] // Array format (trying both as documentation varies)
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data?.status === 'success' || response.status === 200) {
      console.log(`Successfully whitelisted IP: ${ip}`);
      return true;
    }
    
    throw new Error(response.data?.message || 'IP whitelisting failed');
  } catch (error) {
    console.error('Flutterwave IP Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    return false;
  }
};

const getAndUpdateIP = async () => {
  try {
    const ipServices = [
      'https://api.ipify.org?format=json',
      'https://api.ip.sb/jsonip',
      'https://api.myip.com'
    ];

    let discoveredIP = null;
    
    for (const service of ipServices) {
      try {
        const response = await axios.get(service, { timeout: 5000 });
        const newIP = response.data.ip;
        
        if (!newIP) continue;
        discoveredIP = newIP;
        
        // If IP hasn't changed, just update timestamp
        if (newIP === currentIP) {
          lastIPUpdateTime = Date.now();
          return currentIP;
        }

        // Attempt to whitelist the new IP
        const success = await updateFlutterwaveIPWhitelist(newIP);
        if (success) {
          currentIP = newIP;
          lastIPUpdateTime = Date.now();
          return currentIP;
        }
        
        // If whitelisting failed but we got an IP, keep trying other services
        break;
      } catch (serviceError) {
        console.error(`IP service ${service} failed:`, serviceError.message);
        continue;
      }
    }
    
    if (discoveredIP) {
      console.warn('IP discovered but whitelisting failed:', discoveredIP);
      return discoveredIP;
    }
    
    throw new Error('Unable to retrieve IP address from any service');
  } catch (error) {
    console.error('Error in getAndUpdateIP:', error);
    throw error;
  }
};

const getPublicIP = async (forceUpdate = false) => {
  try {
    if (forceUpdate || !currentIP || !lastIPUpdateTime || 
        Date.now() - lastIPUpdateTime > IP_UPDATE_INTERVAL) {
      return await getAndUpdateIP();
    }
    return currentIP;
  } catch (error) {
    console.error('IP Service Error:', error);
    throw error;
  }
};

module.exports = { getPublicIP };