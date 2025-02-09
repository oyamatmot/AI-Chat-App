import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const ADMIN_EMAIL = "oyamatmot86@gmail.com";

export async function sendVerificationEmail(email: string, code: string) {
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: email,
    subject: "Verify your email",
    html: `
      <h1>Email Verification</h1>
      <p>Your verification code is: <strong>${code}</strong></p>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, code: string) {
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: email,
    subject: "Password Reset Request",
    html: `
      <h1>Password Reset</h1>
      <p>Your password reset code is: <strong>${code}</strong></p>
      <p>This code will expire in 1 hour.</p>
    `,
  });
}

export async function sendAdminNotification(type: "new_user" | "reset_request", email: string) {
  const subjects = {
    new_user: "New User Registration",
    reset_request: "Password Reset Request",
  };

  const messages = {
    new_user: `A new user has registered with email: ${email}`,
    reset_request: `A password reset was requested for user: ${email}`,
  };

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: ADMIN_EMAIL,
    subject: subjects[type],
    text: messages[type],
  });
}
