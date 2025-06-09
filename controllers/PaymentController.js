// Paymentcontroller.js
const Picture = require('../models/PictureModel');
const Payment = require('../models/PaymentModel');
const Flutterwave = require('flutterwave-node-v3');
const axios = require('axios');

// Initialize Flutterwave
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

exports.initiateCardPayment = async (req, res) => {
  try {
    const { amount, currency, email, phoneNumber, userId, pictureId } = req.body;

    if (!amount || !currency || !phoneNumber || !userId || !pictureId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const tx_ref = 'CARDPAY-' + Date.now();

    // Step 1: Save the pending payment in the database
    const payment = new Payment({
      tx_ref,
      amount,
      currency,
      email,
      phoneNumber,
      userId,
      pictureId,
      status: 'pending'
    });
    await payment.save();

    // Step 2: Initiate the payment with Flutterwave
    const paymentPayload = {
      tx_ref,
      amount,
      currency,
      redirect_url: 'https://yepper-backend.onrender.com/api/payment/callback',
      customer: {
        email: email || 'no-email@example.com',
        phonenumber: phoneNumber,
      },
      payment_options: 'card',
      customizations: {
        title: 'Card Payment',
        description: 'Pay with your bank card',
      },
    };

    const response = await axios.post('https://api.flutterwave.com/v3/payments', paymentPayload, {
      headers: {
        Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.data && response.data.data && response.data.data.link) {
      res.status(200).json({ paymentLink: response.data.data.link });
    } else {
      res.status(500).json({ message: 'Payment initiation failed', error: response.data });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error during payment initiation' });
  }
};
 
exports.paymentCallback = async (req, res) => {
  try {
    const { tx_ref, transaction_id } = req.query;

    const transactionVerification = await axios.get(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
      headers: {
        Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`
      }
    });

    const { status, customer, amount, currency } = transactionVerification.data.data;

    if (status === 'successful') {
      // Find and update the payment status to 'successful'
      const payment = await Payment.findOneAndUpdate(
        { tx_ref },
        { status: 'successful' },
        { new: true }
      );

      if (payment) {
        // Add user to the list of paid users for the picture
        await Picture.findByIdAndUpdate(payment.pictureId, {
          $addToSet: { paidUsers: payment.userId }
        });
      }

      return res.redirect('https://yepper.cc/list'); 
    } else {
      // Update the payment record as failed
      await Payment.findOneAndUpdate({ tx_ref }, { status: 'failed' });
      return res.redirect('https://yepper.cc/failed');
    }
  } catch (error) {
    console.error('Error processing payment callback:', error);
    res.status(500).json({ message: 'Error processing payment callback' });
  }
};