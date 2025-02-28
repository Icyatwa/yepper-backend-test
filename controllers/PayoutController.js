// controllers/PayoutController.js
const Flutterwave = require('flutterwave-node-v3');
const Payment = require('../models/PaymentModel');
const Picture = require('../models/PictureModel');
const { getPublicIP } = require('../utils/ipUtil');

const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

const MIN_PAYOUT_AMOUNT = 1000; // Minimum payout in RWF
const MAX_PAYOUT_AMOUNT = 2000000; // Maximum payout in RWF

exports.requestPayout = async (req, res) => {
  let transaction = null;
  
  try {
    const { creatorId, amount, phoneNumber, beneficiaryName } = req.body;
    
    // Input validation
    if (!creatorId || !amount || !phoneNumber || !beneficiaryName) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields',
        details: { creatorId, amount, phoneNumber, beneficiaryName }
      });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < MIN_PAYOUT_AMOUNT || numAmount > MAX_PAYOUT_AMOUNT) {
      return res.status(400).json({
        status: 'error',
        message: `Amount must be between ${MIN_PAYOUT_AMOUNT} and ${MAX_PAYOUT_AMOUNT} RWF`,
        details: { amount, min: MIN_PAYOUT_AMOUNT, max: MAX_PAYOUT_AMOUNT }
      });
    }

    // Phone validation for Rwanda
    const phoneRegex = /^(?:\+250|0)?7[23489]\d{7}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid Rwandan phone number format',
        examples: ['+250781234567', '0781234567']
      });
    }

    // Format phone number consistently
    const formattedPhone = phoneNumber.startsWith('+250') 
      ? phoneNumber 
      : phoneNumber.replace(/^0/, '+250');

    // Verify available balance
    const pictures = await Picture.find({ ownerId: creatorId });
    if (!pictures.length) {
      return res.status(404).json({
        status: 'error',
        message: 'No content found for creator',
        creatorId
      });
    }

    const payments = await Payment.find({
      pictureId: { $in: pictures.map(p => p._id) },
      status: 'successful',
      withdrawalStatus: 'none'
    });

    const availableBalance = payments.reduce((sum, p) => sum + p.amount, 0);
    if (numAmount > availableBalance) {
      return res.status(400).json({
        status: 'error',
        message: 'Insufficient balance',
        details: {
          requested: numAmount,
          available: availableBalance,
          currency: 'RWF'
        }
      });
    }

    // Generate unique reference
    const reference = `PAYOUT-${creatorId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Initiate transfer
    const payoutResponse = await flw.Transfer.initiate({
      account_bank: 'MPS', // Mobile Money Rwanda
      account_number: formattedPhone,
      amount: numAmount,
      narration: `Creator payout - ${creatorId}`,
      currency: 'RWF',
      reference,
      callback_url: "https://yepper-backend.onrender.com/api/payout/callback",
      debit_currency: 'RWF',
      beneficiary_name: beneficiaryName, // Add beneficiary name field
      meta: {
        creator_id: creatorId,
        payment_ids: payments.map(p => p._id.toString())
      }
    });

    if (payoutResponse.status !== 'success') {
      throw new Error(payoutResponse.message || 'Transfer initiation failed');
    }

    // Update payment records
    await Payment.updateMany(
      { _id: { $in: payments.map(p => p._id) } },
      { 
        $set: {
          withdrawalStatus: 'pending',
          payoutReference: reference,
          payoutInitiatedAt: new Date(),
          lastModified: new Date()
        }
      }
    );

    return res.status(200).json({
      status: 'success',
      message: 'Payout initiated successfully',
      data: {
        reference,
        amount: numAmount,
        currency: 'RWF',
        phone: formattedPhone,
        beneficiaryName,
        transferId: payoutResponse.data.id
      }
    });

  } catch (error) {
    console.error('Payout Error:', error);

    // If we have a transaction ID, try to verify its status
    if (transaction?.id) {
      try {
        const status = await flw.Transfer.fetch(transaction.id);
        console.log('Transfer status:', status);
      } catch (verifyError) {
        console.error('Status verification failed:', verifyError);
      }
    }

    return res.status(error.response?.status || 500).json({
      status: 'error',
      message: error.message || 'Payout processing failed',
      code: error.response?.data?.code,
      reference: transaction?.reference
    });
  }
};