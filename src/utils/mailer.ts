import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
  port: parseInt(process.env.SMTP_PORT || '2525'),
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

export const sendEmail = async (to: string, subject: string, htmlContent: string) => {
  try {
    const fromEmail = process.env.SMTP_FROM || 'support@accessnationalltd.online';
    const mailOptions = {
      from: `"Access National Bank" <${fromEmail}>`,
      to,
      subject,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Mailer error: ', error);
    return false;
  }
};

export const sendAlertEmail = async (
  email: string,
  fullName: string,
  type: 'CREDIT' | 'DEBIT',
  amount: number,
  currency: string,
  symbol: string,
  description: string,
  accountNo: string,
  currentBalance: number
) => {
  const dateStr = new Date().toLocaleString();
  const alertTypeStr = type === 'CREDIT' ? 'Transaction Alert [CREDIT]' : 'Transaction Alert [DEBIT]';
  const color = type === 'CREDIT' ? '#2f855a' : '#c53030';
  const statusStr = type === 'CREDIT' ? 'Credited to' : 'Debited from';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <div style="background-color: ${color}; color: white; padding: 15px; text-align: center; border-radius: 6px 6px 0 0;">
        <h2>Access National Bank</h2>
        <p style="margin: 0; font-weight: bold;">${alertTypeStr}</p>
      </div>
      <div style="padding: 20px; color: #2d3748; line-height: 1.6;">
        <p>Dear ${fullName},</p>
        <p>This is to notify you of a transaction on your account with details below:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #edf2f7; font-weight: bold;">Account Number:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #edf2f7; text-align: right;">${accountNo.substring(0, 3)}******${accountNo.substring(accountNo.length - 3)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #edf2f7; font-weight: bold;">Amount:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #edf2f7; text-align: right; color: ${color}; font-weight: bold;">${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #edf2f7; font-weight: bold;">Transaction Type:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #edf2f7; text-align: right; font-weight: bold; color: ${color};">${type}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #edf2f7; font-weight: bold;">Description:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #edf2f7; text-align: right;">${description}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #edf2f7; font-weight: bold;">Date/Time:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #edf2f7; text-align: right;">${dateStr}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #4a5568;">Available Balance:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #2b6cb0; font-size: 1.1em;">${symbol}${currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        </table>
        
        <p style="margin-top: 25px;">If you did not authorize this transaction, please contact support immediately or lock your card from the dashboard.</p>
        <p>Thank you for choosing Access National.</p>
      </div>
      <div style="background-color: #f7fafc; padding: 15px; text-align: center; font-size: 12px; color: #718096; border-radius: 0 0 6px 6px;">
        &copy; ${new Date().getFullYear()} Access National Bank. All rights reserved.
      </div>
    </div>
  `;

  return sendEmail(email, alertTypeStr, html);
};
