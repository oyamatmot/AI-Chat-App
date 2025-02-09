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
      <h1>Welcome to AI Chat!</h1>
      <p>Your verification code is: <strong>${code}</strong></p>
      <p>Enter this code to verify your account.</p>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, code: string) {
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: email,
    subject: "Reset your password",
    html: `
      <h1>Password Reset Requested</h1>
      <p>Your password reset code is: <strong>${code}</strong></p>
      <p>Enter this code to reset your password.</p>
    `,
  });
}

export async function notifyAdminNewUser(username: string, email: string) {
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: ADMIN_EMAIL,
    subject: "New User Registration",
    html: `
      <h1>New User Registered</h1>
      <p>Username: ${username}</p>
      <p>Email: ${email}</p>
    `,
  });
}

export async function notifyAdminPasswordReset(email: string) {
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: ADMIN_EMAIL,
    subject: "Password Reset Requested",
    html: `
      <h1>Password Reset Requested</h1>
      <p>User email: ${email}</p>
    `,
  });
}
