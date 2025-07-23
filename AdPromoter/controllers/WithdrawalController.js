// withdrawalController.js
const mongoose = require('mongoose');
const axios = require('axios');
const WebOwnerBalance = require('../models/WebOwnerBalanceModel');
const PaymentTracker = require('../models/PaymentTracker');
const Withdrawal = require('../models/WithdrawalModel');

const TEST_MODE = process.env.NODE_ENV !== 'production' || process.env.FLUTTERWAVE_TEST_MODE === 'true';
const FLW_SECRET_KEY = TEST_MODE ? process.env.FLW_TEST_SECRET_KEY : process.env.FLW_SECRET_KEY;
const FLW_BASE_URL = 'https://api.flutterwave.com/v3';

class WithdrawalService {
  // Validate withdrawal input parameters
  static validateWithdrawalInput(amount, phoneNumber, userId) {
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      throw new Error('Invalid amount. Must be a positive number.');
    }

    if (!phoneNumber || !/^(07\d{8})$/.test(phoneNumber)) {
      throw new Error('Invalid phone number. Must start with 07 and be 10 digits.');
    }

    if (!userId) {
      throw new Error('User ID is required.');
    }
  }

  // Prepare Flutterwave transfer payload
  static prepareTransferPayload(phoneNumber, amount, userId) {
    const reference = `${TEST_MODE ? 'TEST-' : ''}WITHDRAWAL-${userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    return {
      account_bank: 'MPS',
      account_number: phoneNumber,
      amount,
      currency: 'RWF',
      beneficiary_name: TEST_MODE ? 'Test MoMo Transfer' : 'MoMo Transfer',
      reference,
      callback_url: `${process.env.BASE_URL || 'https://yepper-backend.onrender.com'}/api/accept/withdrawal-callback`,
      debit_currency: 'RWF',
      ...(TEST_MODE && { test_mode: true })
    };
  }

  // Simulate successful transfer for test mode
  static simulateTestTransfer(transferPayload) {
    return {
      data: {
        status: 'success',
        data: {
          id: `test_transfer_${Date.now()}`,
          reference: transferPayload.reference,
          account_number: transferPayload.account_number,
          amount: transferPayload.amount,
          currency: transferPayload.currency,
          status: 'PENDING',
          complete_message: 'Test transfer initiated successfully',
          test_mode: true
        },
        message: 'Transfer initiated successfully (TEST MODE)'
      }
    };
  }
}

exports.initiateWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, amount, phoneNumber, paymentId } = req.body;

    // Input validation
    try {
      WithdrawalService.validateWithdrawalInput(amount, phoneNumber, userId);
    } catch (validationError) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: validationError.message,
        testMode: TEST_MODE
      });
    }

    // Check if user has sufficient balance
    const balance = await WebOwnerBalance.findOne({ userId }).session(session);
    if (!balance || balance.availableBalance < amount) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Insufficient balance',
        currentBalance: balance?.availableBalance || 0,
        testMode: TEST_MODE
      });
    }

    // Prepare transfer payload
    const transferPayload = WithdrawalService.prepareTransferPayload(phoneNumber, amount, userId);

    let response;
    
    try {
      if (TEST_MODE) {
        // Simulate transfer in test mode
        console.log('🧪 TEST MODE: Simulating withdrawal transfer:', transferPayload);
        response = WithdrawalService.simulateTestTransfer(transferPayload);
        
        // Add delay to simulate real API call
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        // Real transfer via Flutterwave
        response = await axios.post(`${FLW_BASE_URL}/transfers`, transferPayload, {
          headers: { 
            Authorization: `Bearer ${FLW_SECRET_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
      }

      // Create withdrawal record
      const withdrawal = new Withdrawal({
        userId,
        amount,
        phoneNumber,
        status: response.data.status === 'success' ? 'processing' : 'failed',
        transactionId: response.data.data?.id,
        testMode: TEST_MODE,
        ...(TEST_MODE && { testData: response.data })
      });
      await withdrawal.save({ session });

      if (response.data.status === 'success') {
        // Update user's available balance
        await WebOwnerBalance.findOneAndUpdate(
          { userId },
          { $inc: { availableBalance: -amount } },
          { session }
        );

        // Update payment tracker status if provided
        if (paymentId) {
          await PaymentTracker.findByIdAndUpdate(
            paymentId,
            {
              lastWithdrawalDate: new Date(),
              status: 'withdrawn'
            },
            { session }
          );
        }

        await session.commitTransaction();
        
        return res.status(200).json({
          message: TEST_MODE ? 'Test withdrawal initiated successfully' : 'Withdrawal initiated successfully',
          reference: transferPayload.reference,
          withdrawal,
          testMode: TEST_MODE,
          ...(TEST_MODE && { 
            note: 'This is a test transaction - no real money will be transferred',
            simulatedResponse: response.data
          })
        });
      } else {
        await session.abortTransaction();
        return res.status(400).json({ 
          message: 'Failed to initiate transfer',
          error: response.data,
          testMode: TEST_MODE
        });
      }
    } catch (transferError) {
      await session.abortTransaction();
      console.error('Transfer error:', transferError);
      
      return res.status(500).json({ 
        message: TEST_MODE ? 'Error processing test transfer' : 'Error processing transfer',
        error: transferError.response?.data || transferError.message,
        testMode: TEST_MODE
      });
    }
  } catch (error) {
    await session.abortTransaction();
    console.error('Withdrawal error:', error);
    res.status(500).json({ 
      message: TEST_MODE ? 'Error processing test withdrawal' : 'Error processing withdrawal',
      error: error.message,
      testMode: TEST_MODE
    });
  } finally {
    session.endSession();
  }
};

exports.withdrawalCallback = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { data } = req.body;
    
    console.log(TEST_MODE ? '🧪 TEST MODE: Withdrawal callback received:' : 'Withdrawal callback received:', data);
    
    const withdrawal = await Withdrawal.findOne({ transactionId: data.id });

    if (!withdrawal) {
      await session.abortTransaction();
      return res.status(404).json({ 
        message: 'Withdrawal not found',
        testMode: TEST_MODE
      });
    }

    if (data.status === 'successful' || data.status === 'SUCCESSFUL') {
      withdrawal.status = 'completed';
      withdrawal.completedAt = new Date();
    } else {
      withdrawal.status = 'failed';
      withdrawal.failureReason = data.complete_message || 'Transfer failed';
      
      // Refund the amount back to available balance
      await WebOwnerBalance.findOneAndUpdate(
        { userId: withdrawal.userId },
        { $inc: { availableBalance: withdrawal.amount } },
        { session }
      );
    }

    if (TEST_MODE) {
      withdrawal.testCallbackData = data;
    }

    await withdrawal.save({ session });
    await session.commitTransaction();
    
    res.status(200).json({ 
      message: TEST_MODE ? 'Test callback processed successfully' : 'Callback processed successfully',
      testMode: TEST_MODE
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Withdrawal callback error:', error);
    res.status(500).json({ 
      message: TEST_MODE ? 'Error processing test callback' : 'Error processing callback',
      error: error.message,
      testMode: TEST_MODE
    });
  } finally {
    session.endSession();
  }
};

exports.simulateWithdrawalCallback = async (req, res) => {
  if (!TEST_MODE) {
    return res.status(403).json({ message: 'This endpoint is only available in test mode' });
  }

  try {
    const { transactionId, status = 'successful' } = req.body;
    
    if (!transactionId) {
      return res.status(400).json({ message: 'Transaction ID is required' });
    }

    // Simulate callback data
    const callbackData = {
      data: {
        id: transactionId,
        status: status.toUpperCase(),
        complete_message: status === 'successful' ? 'Test transfer completed successfully' : 'Test transfer failed',
        amount: 1000, // This would come from the actual transaction
        currency: 'RWF',
        test_mode: true
      }
    };

    // Call the actual callback handler
    req.body = callbackData;
    await exports.withdrawalCallback(req, res);
    
  } catch (error) {
    console.error('Simulate callback error:', error);
    res.status(500).json({ 
      message: 'Error simulating callback',
      error: error.message,
      testMode: true
    });
  }
};