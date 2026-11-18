// src/mail.js
// Sends emails (only "forgot password" links for now).
//
// Switched on by setting ONE of these on Render -> Environment:
//   BREVO_API_KEY   (brevo.com, free: 300 emails a day, works with just a verified Gmail sender)
//   RESEND_API_KEY  (resend.com, free: 100 a day, needs your own domain to email anyone but you)
// plus MAIL_FROM: the sender address, e.g. "Chapterhive <yourname@gmail.com>",
// and CONTACT_EMAIL: where contact-form messages are delivered (usually your own inbox).
// With Brevo, that address must be added under Senders & IP -> Senders and verified.

function mailProvider() {
  if (!process.env.MAIL_FROM) return null;
  if (process.env.BREVO_API_KEY) return "brevo";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

function mailEnabled() {
  return Boolean(mailProvider());
}

// "Chapterhive <me@gmail.com>" -> { name: "Chapterhive", email: "me@gmail.com" }
function parseFrom(value) {
  const match = String(value).match(/^\s*(.*?)\s*<\s*([^>\s]+@[^>\s]+)\s*>\s*$/);
  if (match) return { name: match[1].replace(/^"|"$/g, "") || "Chapterhive", email: match[2] };
  return { name: "Chapterhive", email: String(value).trim() };
}

// Sends one email. Resolves when the provider accepted it; rejects otherwise.
// options.replyTo: { email, name } -> pressing Reply answers that person.
async function sendMail(to, subject, text, html, options) {
  options = options || {};
  const provider = mailProvider();
  if (!provider) throw new Error("Email is not set up.");
  const from = parseFrom(process.env.MAIL_FROM);

  let response;
  if (provider === "brevo") {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(Object.assign(
        { sender: from, to: [{ email: to }], subject: subject, textContent: text, htmlContent: html },
        options.replyTo ? { replyTo: options.replyTo } : {}
      ))
    });
  } else {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: "Bearer " + process.env.RESEND_API_KEY, "content-type": "application/json" },
      body: JSON.stringify(Object.assign(
        { from: from.name + " <" + from.email + ">", to: [to], subject: subject, text: text, html: html },
        options.replyTo ? { reply_to: options.replyTo.email } : {}
      ))
    });
  }

  if (!response.ok) {
    const detail = await response.text().catch(function () { return ""; });
    throw new Error(provider + " refused the email (" + response.status + "): " + detail.slice(0, 200));
  }
}

module.exports = { mailEnabled, mailProvider, sendMail };
