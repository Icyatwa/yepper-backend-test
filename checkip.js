// Method 1: Using external service to get public IP
const axios = require('axios');

async function getPublicIpAddress() {
  try {
    const response = await axios.get('https://api.ipify.org?format=json');
    console.log('Your current public IP address is:', response.data.ip);
    // You should whitelist this IP address in your Flutterwave dashboard
  } catch (error) {
    console.error('Failed to get public IP address:', error.message);
  }
}

getPublicIpAddress();