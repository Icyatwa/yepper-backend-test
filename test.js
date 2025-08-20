router.post('/payment/verify-with-refund', async (req, res) => {
  console.log('=== PAYMENT VERIFY CALLED ===');
  console.log('Body:', req.body);
  
  const session = await mongoose.startSession();
  
  try {
    const { transaction_id, tx_ref } = req.body;
    
    // Validate input parameters
    if (!transaction_id && !tx_ref) {
      return res.status(400).json({ 
        success: false,
        error: 'Either transaction_id or tx_ref is required',
        received: { transaction_id, tx_ref }
      });
    }

    // For Flutterwave verification, we need the transaction_id
    // If we only have tx_ref, we need to find the payment first to get the transaction_id
    let flutterwaveTransactionId = transaction_id;
    let paymentTxRef = tx_ref;

    // If we don't have transaction_id but have tx_ref, try to find existing payment
    if (!flutterwaveTransactionId && paymentTxRef) {
      const existingPayment = await Payment.findOne({ tx_ref: paymentTxRef });
      if (existingPayment && existingPayment.paymentId) {
        flutterwaveTransactionId = existingPayment.paymentId;
      } else {
        // For new payments, we'll use tx_ref as the identifier for now
        flutterwaveTransactionId = paymentTxRef;
      }
    }

    console.log('Using for verification:', {
      flutterwaveTransactionId,
      paymentTxRef
    });

    // Verify with Flutterwave
    const flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLW_TEST_SECRET_KEY;
    
    if (!flutterwaveSecretKey) {
      return res.status(500).json({
        success: false,
        error: 'Payment service configuration missing'
      });
    }
    
    console.log('Making Flutterwave verification request:', {
      url: `https://api.flutterwave.com/v3/transactions/${flutterwaveTransactionId}/verify`,
      hasSecretKey: !!flutterwaveSecretKey,
      secretKeyType: flutterwaveSecretKey?.includes('TEST') ? 'TEST' : 'LIVE'
    });
    
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${flutterwaveTransactionId}/verify`,
      {
        headers: {
          'Authorization': `Bearer ${flutterwaveSecretKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log('Flutterwave verification response:', {
      status: response.data.status,
      data: response.data.data ? {
        id: response.data.data.id,
        tx_ref: response.data.data.tx_ref,
        status: response.data.data.status,
        amount: response.data.data.amount
      } : null
    });

    if (response.data.status === 'success' && response.data.data.status === 'successful') {
      // Find payment record using the verified tx_ref from Flutterwave response
      const verifiedTxRef = response.data.data.tx_ref;
      const verifiedTransactionId = response.data.data.id;

      console.log('Looking for payment with:', {
        verifiedTxRef,
        verifiedTransactionId,
        originalTxRef: paymentTxRef
      });

      const payment = await Payment.findOne({ 
        $or: [
          { tx_ref: verifiedTxRef },
          { tx_ref: paymentTxRef },
          { paymentId: verifiedTransactionId }
        ]
      });

      if (!payment) {
        console.log('Payment record not found, available payments:', 
          await Payment.find({}).select('tx_ref paymentId status').limit(5)
        );
        
        return res.status(404).json({ 
          success: false,
          error: 'Payment record not found',
          searchCriteria: {
            verifiedTxRef,
            paymentTxRef,
            verifiedTransactionId
          }
        });
      }

      console.log('Found payment:', {
        id: payment._id,
        tx_ref: payment.tx_ref,
        status: payment.status,
        amount: payment.amount
      });

      if (payment.status === 'successful') {
        return res.status(200).json({ 
          success: true, 
          message: 'Payment already processed',
          payment: payment.getPaymentSummary(),
          alreadyProcessed: true
        });
      }

      // Verify amounts match
      const flutterwaveAmount = parseFloat(response.data.data.amount);
      const expectedAmount = payment.amountPaid || payment.amount;
      
      if (Math.abs(flutterwaveAmount - expectedAmount) > 0.01) {
        return res.status(400).json({
          success: false,
          error: 'Amount mismatch',
          expected: expectedAmount,
          received: flutterwaveAmount
        });
      }

      // Process the payment in a transaction
      await session.withTransaction(async () => {
        // Update payment status
        payment.status = 'successful';
        payment.paidAt = new Date();
        payment.paymentId = verifiedTransactionId;
        payment.flutterwaveData = response.data.data;
        await payment.save({ session });

        console.log('Payment updated to successful');

        // Deduct wallet if used
        if (payment.walletApplied && payment.walletApplied > 0) {
          const walletUpdate = await Wallet.findOneAndUpdate(
            { ownerId: payment.advertiserId, ownerType: 'advertiser' },
            { 
              $inc: { 
                balance: -payment.walletApplied,
                totalSpent: payment.walletApplied
              },
              lastUpdated: new Date()
            },
            { session, new: true }
          );
          console.log('Wallet deducted:', payment.walletApplied, 'New balance:', walletUpdate?.balance);
        }

        // Mark refunds as used (only for non-reassignment)
        if (payment.refundApplied && payment.refundApplied > 0 && !payment.isReassignment) {
          console.log('Processing refund usage:', payment.refundApplied);
          
          const refundResult = await Payment.applyRefundsToPayment(
            payment.advertiserId, 
            payment.refundApplied, 
            session
          );

          // Update the used refunds
          for (const refundUpdate of refundResult.refundsToUpdate) {
            await Payment.findByIdAndUpdate(
              refundUpdate.paymentId,
              {
                refundUsed: true,
                refundUsedAt: new Date(),
                refundUsedForPayment: payment._id,
                refundUsageAmount: refundUpdate.refundToUse
              },
              { session }
            );
          }

          // Update payment with refund sources
          payment.refundSources = refundResult.appliedRefunds;
          await payment.save({ session });

          console.log('Refunds marked as used');
        }

        // Activate the ad
        const adUpdate = await ImportAd.findOneAndUpdate(
          { 
            _id: payment.adId,
            'websiteSelections.websiteId': payment.websiteId,
            'websiteSelections.categories': payment.categoryId
          },
          {
            $set: {
              'websiteSelections.$.approved': true,
              'websiteSelections.$.status': 'active',
              'websiteSelections.$.publishedAt': new Date(),
              'websiteSelections.$.approvedAt': new Date()
            }
          },
          { session, new: true }
        );

        if (!adUpdate) {
          throw new Error('Failed to update ad status');
        }
        console.log('Ad activated');

        // Update category
        await AdCategory.findByIdAndUpdate(
          payment.categoryId,
          { $addToSet: { selectedAds: payment.adId } },
          { session }
        );
        console.log('Category updated');

        // Update website owner wallet
        const category = await AdCategory.findById(payment.categoryId);
        if (category) {
          await Wallet.findOneAndUpdate(
            { ownerId: category.ownerId, ownerType: 'webOwner' },
            { 
              $inc: { 
                balance: payment.amount,
                totalEarned: payment.amount
              },
              lastUpdated: new Date()
            },
            { session, upsert: true }
          );
          console.log('Website owner wallet updated');
        }
      });

      return res.status(200).json({
        success: true,
        message: 'Payment verified and ad activated successfully',
        payment: payment.getPaymentSummary(),
        verification: {
          flutterwaveTransactionId: verifiedTransactionId,
          amount: flutterwaveAmount,
          currency: response.data.data.currency,
          verifiedAt: new Date()
        }
      });

    } else {
      console.log('Flutterwave verification failed:', response.data);
      return res.status(400).json({ 
        success: false, 
        message: 'Payment verification failed with Flutterwave',
        details: {
          flutterwaveStatus: response.data.status,
          transactionStatus: response.data.data?.status,
          reason: response.data.message
        }
      });
    }

  } catch (error) {
    console.error('Payment verification error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      headers: error.response?.headers,
      config: error.config ? {
        method: error.config.method,
        url: error.config.url,
        headers: error.config.headers
      } : null
    });
    
    // Handle Flutterwave API specific errors
    if (error.response) {
      const { status, data } = error.response;
      
      // If we get HTML response instead of JSON, it means wrong endpoint or method
      if (typeof data === 'string' && data.includes('<html>')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid Flutterwave API request',
          message: 'The transaction verification request failed. This might be due to an invalid transaction ID or API configuration.',
          suggestion: 'Please verify that the transaction ID is correct and that your Flutterwave API keys are properly configured.',
          transactionId: flutterwaveTransactionId
        });
      }
      
      switch (status) {
        case 404:
          return res.status(404).json({
            success: false,
            error: 'Transaction not found',
            message: `Transaction ID ${flutterwaveTransactionId} was not found with Flutterwave. This could mean the transaction doesn't exist or has expired.`,
            transactionId: flutterwaveTransactionId
          });
          
        case 401:
          return res.status(500).json({
            success: false,
            error: 'Authentication failed',
            message: 'Invalid Flutterwave API credentials. Please check your API keys configuration.'
          }); 
          
        case 400:
          return res.status(400).json({
            success: false,
            error: 'Invalid request',
            message: data?.message || 'The transaction verification request was invalid.',
            details: data
          });
          
        default:
          return res.status(500).json({
            success: false,
            error: 'Flutterwave API error',
            message: `Flutterwave returned status ${status}`,
            details: data
          });
      }
    } else if (error.request) {
      return res.status(500).json({
        success: false,
        error: 'Network error',
        message: 'Unable to connect to Flutterwave API. Please check your internet connection and try again.'
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Payment verification failed',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? {
          stack: error.stack,
          config: error.config
        } : undefined
      });
    }
  } finally {
    await session.endSession();
  }
});

// Add a test route to verify the server is responding
router.get('/payment/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Payment service is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});