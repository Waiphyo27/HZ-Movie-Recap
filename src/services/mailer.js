let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch (e) {
  nodemailer = null;
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function buildTransport() {
  if (!nodemailer) {
    throw new Error("nodemailer is not installed. Run: npm install nodemailer");
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendLoginCode(email, code, expiresInMinutes) {
  // Dev escape hatch: print the code to the container log instead of emailing.
  if (process.env.AUTH_DEV_ECHO_CODE === "1") {
    console.log(`[auth] login code for ${email}: ${code}`);
    return { delivered: "console" };
  }

  if (!smtpConfigured()) {
    throw new Error(
      "Email sending is not configured. Set SMTP_USER and SMTP_PASS in .env " +
        "(Gmail address + App Password), or set AUTH_DEV_ECHO_CODE=1 to print codes to the log."
    );
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const transport = buildTransport();

  await transport.sendMail({
    from: `"HZ Movie Recap" <${from}>`,
    to: email,
    subject: `${code} is your HZ Movie Recap sign-in code`,
    text:
      `Your sign-in code is ${code}\n\n` +
      `It expires in ${expiresInMinutes} minutes.\n` +
      `Signing in here will sign you out on any other device.\n\n` +
      `If you did not request this, you can ignore this email.`,
    html:
      `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px">` +
      `<p style="margin:0 0 16px;color:#444">Your sign-in code for <strong>HZ Movie Recap</strong>:</p>` +
      `<p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:0 0 16px;color:#111">${code}</p>` +
      `<p style="margin:0 0 8px;color:#666;font-size:14px">Expires in ${expiresInMinutes} minutes.</p>` +
      `<p style="margin:0 0 8px;color:#666;font-size:14px">Signing in here will sign you out on any other device.</p>` +
      `<p style="margin:16px 0 0;color:#999;font-size:12px">If you did not request this, you can ignore this email.</p>` +
      `</div>`,
  });

  return { delivered: "smtp" };
}

module.exports = { sendLoginCode, smtpConfigured };
