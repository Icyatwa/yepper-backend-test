// emailService.js
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);  // Use your Resend API Key

const sendEmailNotification = async (to, subject, body) => {
  try {
    const response = await resend.emails.send({
      from: 'Yepper <noreply@dostrides.com>', // Resend requires an email domain, adjust accordingly
      to,
      subject,
      html: body,
    });
    console.log('Email sent:', response);
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

module.exports = sendEmailNotification;
