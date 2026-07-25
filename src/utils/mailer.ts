import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import EmailTemplate from '../models/EmailTemplate';

dotenv.config();

export const COMPANY_DOMAIN = process.env.APP_DOMAIN || 'https://accessnationals.com';
export const COMPANY_LOGO = process.env.COMPANY_LOGO_URL || `${COMPANY_DOMAIN}/logo.png`;
export const COMPANY_NAME = 'Access National Bank';
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@accessnationalltd.online';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
  port: parseInt(process.env.SMTP_PORT || '2525'),
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

/**
 * Master Responsive HTML Email Template Wrapper
 * Features clickable logo pointing to accessnationals.com,
 * professional bank header, clean typography, and domain footer.
 */
export const wrapInMasterEmailTemplate = (
  title: string,
  bodyHtml: string,
  badgeText: string = 'Official Clearance Notice'
): string => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: 'Segoe UI', Arial, sans-serif; color: #2d3748;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f4f6f9; padding: 25px 10px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          
          <!-- Header with Clickable Company Logo & Domain Link -->
          <tr>
            <td align="center" style="background-color: #0f172a; padding: 28px 20px; border-bottom: 4px solid #a80909;">
              <a href="${COMPANY_DOMAIN}" target="_blank" style="text-decoration: none; display: inline-block;">
                <img src="${COMPANY_LOGO}" alt="${COMPANY_NAME}" style="max-height: 54px; width: auto; max-width: 240px; display: block; border: 0; margin: 0 auto;" />
                <span style="color: #ffffff; font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 8px; display: block;">${COMPANY_NAME}</span>
              </a>
              <div style="margin-top: 10px;">
                <span style="background-color: rgba(168, 9, 9, 0.3); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.35); font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 4px 14px; border-radius: 12px; letter-spacing: 1px; display: inline-block;">${badgeText}</span>
              </div>
            </td>
          </tr>

          <!-- Main Email Body Area -->
          <tr>
            <td style="padding: 32px 28px 28px 28px; line-height: 1.6; font-size: 14px; color: #334155;">
              <h2 style="color: #0f172a; font-size: 18px; font-weight: 700; margin-top: 0; margin-bottom: 18px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">${title}</h2>
              
              <div style="color: #334155; font-size: 14px; line-height: 1.6;">
                ${bodyHtml}
              </div>

              <!-- Support Contact Box -->
              <div style="margin-top: 30px; padding: 14px 16px; background-color: #f8fafc; border-left: 3px solid #a80909; border-radius: 6px; font-size: 12px; color: #64748b;">
                If you did not request this email or have questions regarding your account, please contact our 24/7 helpdesk at <a href="mailto:${SUPPORT_EMAIL}" style="color: #a80909; text-decoration: none; font-weight: 600;">${SUPPORT_EMAIL}</a> or visit <a href="${COMPANY_DOMAIN}" target="_blank" style="color: #a80909; text-decoration: underline; font-weight: 600;">${COMPANY_DOMAIN}</a>.
              </div>
            </td>
          </tr>

          <!-- Footer with Domain Link & Copyright -->
          <tr>
            <td align="center" style="background-color: #f8fafc; padding: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
              <p style="margin: 0 0 6px 0; font-weight: 700;">
                <a href="${COMPANY_DOMAIN}" target="_blank" style="color: #0f172a; text-decoration: none;">${COMPANY_DOMAIN.replace('https://', '').replace('http://', '')}</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                &copy; ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.<br/>
                Global Banking & International Wire Clearance Network.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * Base email sender function using Nodemailer transporter
 */
export const sendEmail = async (to: string, subject: string, htmlContent: string): Promise<boolean> => {
  try {
    const fromEmail = process.env.SMTP_FROM || 'support@accessnationalltd.online';
    const mailOptions = {
      from: `"${COMPANY_NAME}" <${fromEmail}>`,
      to,
      subject,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email dispatched successfully: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Mailer error: ', error);
    return false;
  }
};

/**
 * Reusable helper function to send branded custom emails wrapped with logo & template
 */
export const sendCustomEmail = async (
  toEmail: string,
  subject: string,
  bodyHtml: string,
  title?: string,
  badgeText?: string
): Promise<boolean> => {
  const masterTitle = title || subject;
  const wrappedHtml = wrapInMasterEmailTemplate(masterTitle, bodyHtml, badgeText || 'Security Alert');
  return sendEmail(toEmail, subject, wrappedHtml);
};

/**
 * Reusable function to fetch an EmailTemplate from MongoDB by name/title,
 * replace dynamic variables, wrap inside logo HTML template, and send via SMTP.
 */
export const sendTemplateEmail = async (
  toEmail: string,
  templateName: string,
  variables: Record<string, string> = {}
): Promise<boolean> => {
  try {
    const template = await EmailTemplate.findOne({
      $or: [
        { name: templateName },
        { name: { $regex: new RegExp(`^${templateName}$`, 'i') } },
        { title: templateName }
      ]
    });

    let subject = template?.title || template?.name || 'Access National Bank Notice';
    let body = template?.content || 'Thank you for choosing Access National Bank.';

    Object.keys(variables).forEach((key) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
      subject = subject.replace(regex, variables[key]);
      body = body.replace(regex, variables[key]);
    });

    const bodyHtml = `
      <div style="margin-top: 10px; color: #334155;">
        ${body.replace(/\n/g, '<br/>')}
      </div>
    `;

    const formattedHtml = wrapInMasterEmailTemplate(subject, bodyHtml, 'Official Notice');
    return await sendEmail(toEmail, subject, formattedHtml);
  } catch (error) {
    console.error('Error sending template email:', error);
    return false;
  }
};

/**
 * Reusable function to format and send branded Transaction Credit / Debit Alerts with logo
 */
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
): Promise<boolean> => {
  const dateStr = new Date().toLocaleString();
  const alertTypeStr = type === 'CREDIT' ? 'Transaction Alert [CREDIT]' : 'Transaction Alert [DEBIT]';
  const color = type === 'CREDIT' ? '#059669' : '#dc2626';

  const maskedAccount = accountNo
    ? `${accountNo.substring(0, 3)}******${accountNo.substring(Math.max(0, accountNo.length - 3))}`
    : 'Primary Vault Account';

  const alertBodyHtml = `
    <p style="margin-top: 0;">Dear <strong>${fullName}</strong>,</p>
    <p>This is an automated notification to confirm a financial transaction on your account:</p>
    
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-top: 18px; margin-bottom: 20px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b;">Account Number:</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace; font-weight: 700; color: #0f172a;">${maskedAccount}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b;">Transaction Type:</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: ${color};">${type}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b;">Amount:</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; text-align: right; color: ${color}; font-weight: 800; font-size: 16px;">${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b;">Description / Memo:</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600; color: #334155;">${description}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b;">Timestamp:</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 12px; color: #475569;">${dateStr}</td>
      </tr>
      <tr>
        <td style="padding: 14px 16px; font-weight: 700; color: #0f172a;">Available Balance:</td>
        <td style="padding: 14px 16px; text-align: right; font-weight: 800; color: #1e40af; font-size: 17px; font-family: monospace;">${symbol}${currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}</td>
      </tr>
    </table>
  `;

  const formattedHtml = wrapInMasterEmailTemplate(alertTypeStr, alertBodyHtml, type === 'CREDIT' ? 'Credit Advice' : 'Debit Advice');
  return sendEmail(email, alertTypeStr, formattedHtml);
};
