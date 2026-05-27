/**
 * Utility for sending emails (Magic Links, Notifications, etc.)
 * For MVP/Local development, it logs to the console.
 * Easily switch to Resend, SendGrid, or AWS SES.
 */
export const testEmailInbox = {
  lastToken: null
};

import { Resend } from "resend";

export const sendMagicLink = async (email, username, magicUrl) => {
  if (process.env.NODE_ENV === "test") {
   testEmailInbox.lastToken = magicUrl;
   return true;
 }
  const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?token=${magicUrl}`;
  const emailContent = {
    from: 'onboarding@resend.dev',
    to: email,
    subject: 'Your Twivo Magic Link',
    text: `Hello ${username || 'there'},\n\nClick the link below to sign in to Twivo:\n\n${loginUrl}\n\nThis link will expire in 15 minutes.`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Twivo</h2>
        <p>Hello ${username || 'there'},</p>
        <p>Click the button below to sign in to your account. This magic link will expire in 15 minutes.</p>
        <a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background-color: #1DA1F2; color: white; text-decoration: none; border-radius: 9999px; font-weight: bold;">Sign in to Twivo</a>
        <p style="margin-top: 24px; font-size: 12px; color: #657786;">If you didn't request this email, you can safely ignore it.</p>
      </div>
    `
  };

  // LOGIC FOR PRODUCTION (e.g., Resend)
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send(emailContent);
      console.log(`[Email Service] Production email sent to ${email} via Resend`);
      return true;
    } catch (error) {
      console.error('[Email Service] Failed to send production email:', error);
      // fall back to log in dev
    }
  }

  // DEFAULT: Development Logging
  console.log('---------------------------------------');
  console.log(`📧 [EMAIL SENT TO: ${email}]`);
  console.log(`Subject: ${emailContent.subject}`);
  console.log(`Magic URL Token: ${magicUrl}`);
  console.log(`Full Link: ${loginUrl}`);
  console.log('---------------------------------------');
  
  return true;
};
