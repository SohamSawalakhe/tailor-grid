require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Resend } = require("resend");

let resendClient = null;

/**
 * Returns a singleton instance of Resend client.
 */
function getResendClient() {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[EMAIL] RESEND_API_KEY is not defined in environment variables.",
    );
    return null;
  }
  resendClient = new Resend(apiKey);
  return resendClient;
}

/**
 * Normalizes sender address from environment or fallback.
 */
function getFromEmail() {
  return (
    process.env.DEFAULT_FROM_EMAIL || "IGTF <no-reply@indoglobaltradefair.com>"
  );
}

/**
 * Renders individual digit boxes:
 * [ 6 ] [ 1 ] [ 6 ] [ 3 ]
 * All boxes share identical clean styling.
 */
function renderDigitBoxes(otpCode) {
  const cleanCode = String(otpCode || "1234")
    .trim()
    .slice(0, 6);
  const digits = cleanCode.split("");

  return digits
    .map((digit) => {
      return `
        <td style="padding: 0 5px;" align="center" valign="middle">
          <div style="width: 54px; height: 60px; line-height: 60px; background-color: #F3F4F6; border: 1.5px solid #E5E7EB; border-radius: 12px; font-size: 26px; font-weight: 800; color: #1E2024; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; display: inline-block;">
            ${digit}
          </div>
        </td>
      `;
    })
    .join("");
}

/**
 * Builds the HTML email matching user specifications:
 * - NO cross sign (✕)
 * - NO image field or broken image placeholders
 * - NO verify or resend code buttons
 * - All digit boxes uniform in color
 * - Short, clean order details summary
 * - Important notice strip
 */
function buildOtpEmailHtml({
  greeting = "",
  title = "Here is your Order Confirmation PIN",
  subtitle = "Your garment alteration request has been scheduled. Please share the PIN below with your tailor to authenticate and confirm your order drop-off.",
  otp = "1234",
  details = [],
  importantNote = "Give this PIN to the tailor for confirming the order upon drop-off, or when collecting your finished bespoke alteration.",
}) {
  const digitBoxes = renderDigitBoxes(otp);

  const detailsRows = details
    .filter((d) => d && d.label && d.value)
    .map((d) => {
      return `
        <tr>
          <td style="padding: 5px 0; font-size: 12.5px; color: #6B7280; font-weight: 600;">${d.label}:</td>
          <td align="right" style="padding: 5px 0; font-size: 12.5px; color: #111827; font-weight: 700;">${d.value}</td>
        </tr>
      `;
    })
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F5EFE6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E2024; -webkit-font-smoothing: antialiased;">
  <!-- Canvas Backdrop -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F5EFE6; padding: 40px 16px;">
    <tr>
      <td align="center" valign="middle">
        
        <!-- White Rounded Card -->
        <table role="presentation" width="100%" style="max-width: 480px; background-color: #FFFFFF; border-radius: 24px; box-shadow: 0 12px 36px rgba(0, 0, 0, 0.07); border: 1px solid #ECE5D8; padding: 32px 28px;">
          
          <!-- Greeting Header -->
          ${
            greeting
              ? `
          <tr>
            <td style="padding-bottom: 6px;">
              <span style="font-size: 11px; font-weight: 800; color: #8C9099; text-transform: uppercase; letter-spacing: 1px; display: block;">
                ${greeting}
              </span>
            </td>
          </tr>
          `
              : ""
          }

          <!-- Title -->
          <tr>
            <td style="padding-bottom: 10px;">
              <h1 style="margin: 0; font-size: 21px; font-weight: 800; color: #1E2024; letter-spacing: -0.3px; line-height: 1.3;">
                ${title}
              </h1>
            </td>
          </tr>

          <!-- Subtitle / Explanation -->
          <tr>
            <td style="padding-bottom: 22px;">
              <p style="margin: 0; font-size: 13px; line-height: 1.55; color: #6B7280;">
                ${subtitle}
              </p>
            </td>
          </tr>

          <!-- Uniform Digit Boxes -->
          <tr>
            <td align="center" style="padding-bottom: 22px;">
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                <tr>
                  ${digitBoxes}
                </tr>
              </table>
            </td>
          </tr>

          <!-- Short Details Card -->
          ${
            detailsRows
              ? `
          <tr>
            <td style="padding-bottom: 18px;">
              <table role="presentation" width="100%" style="background-color: #F9FAFB; border-radius: 14px; border: 1px solid #E5E7EB; padding: 12px 16px;">
                ${detailsRows}
              </table>
            </td>
          </tr>
          `
              : ""
          }

          <!-- Important Note Strip -->
          ${
            importantNote
              ? `
          <tr>
            <td style="padding-bottom: 14px;">
              <table role="presentation" width="100%" style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; border-radius: 6px; padding: 10px 14px;">
                <tr>
                  <td style="font-size: 11.5px; color: #92400E; line-height: 1.5;">
                    <strong style="color: #78350F;">Important:</strong> ${importantNote}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          `
              : ""
          }

          <!-- Discreet Footer -->
          <tr>
            <td align="center" style="padding-top: 4px;">
              <p style="margin: 0; font-size: 11px; color: #9CA3AF;">
                Raffu &bull; On-Demand Bespoke Alterations
              </p>
            </td>
          </tr>

        </table>
        <!-- End White Rounded Card -->

      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// Deduplication registry: tracks which stage emails have already been dispatched for each order
// Guarantees only 1 drop-off email and 1 pickup email per order in total.
const sentOrderEmailTracker = new Set();

/**
 * Sends an Order Confirmation PIN / OTP email to the customer with short order details.
 * Deduplicates automatically to ensure maximum 1 drop-off email and 1 pickup email per order.
 */
async function sendOrderOtpEmail({
  toEmail,
  otp,
  orderId,
  customerName = "Valued Customer",
  garmentName = "Garment Alteration",
  serviceName = "Standard Hemming",
  storeName = "Partner Atelier",
  storeAddress = "",
  storePhone = "",
  isPickup = false,
  force = false,
}) {
  if (!orderId) {
    return { success: false, reason: "Missing orderId" };
  }

  const emailStage = isPickup ? "pickup" : "dropoff";
  const dedupKey = `${orderId}:${emailStage}`;

  // Strict deduplication: Each order receives at most 1 drop-off email and 1 pickup email
  if (!force && sentOrderEmailTracker.has(dedupKey)) {
    console.log(
      `[EMAIL DEDUPLICATION] Skipped redundant ${emailStage} email for order #${orderId} (already delivered).`,
    );
    return {
      success: true,
      deduplicated: true,
      message: `Already delivered ${emailStage} email`,
    };
  }

  if (!toEmail || !toEmail.includes("@")) {
    console.warn(
      `[EMAIL] Skipped sending Order OTP: Invalid or missing email address (${toEmail})`,
    );
    return { success: false, reason: "Invalid email address" };
  }

  const client = getResendClient();
  if (!client) {
    console.warn(
      `[EMAIL] Resend client not configured. Order PIN for ${orderId}: ${otp}`,
    );
    return { success: false, reason: "RESEND_API_KEY missing" };
  }

  const subject = isPickup
    ? `Your Raffu Order #${orderId} is Ready for Pickup! PIN: ${otp}`
    : `Your Raffu Order #${orderId} Drop-Off PIN: ${otp}`;

  const title = isPickup
    ? "Your Garment is Ready for Pickup!"
    : "Here is your Order Drop-Off PIN";

  const subtitle = isPickup
    ? `Your bespoke alteration is complete and ready on the rack at ${storeName}. Please share the PIN below with your tailor to collect your garment.`
    : `Your garment alteration request has been scheduled with ${storeName}. Please share the PIN below with your tailor to authenticate and confirm your order drop-off.`;

  const importantNote = isPickup
    ? "Give this PIN to the tailor for collecting your completed garment."
    : "Give this PIN to the tailor for confirming your garment drop-off.";

  const details = [
    { label: "Order ID", value: `#${orderId}` },
    { label: "Garment Type", value: garmentName },
    { label: "Alteration Service", value: serviceName },
    { label: "Partner Studio", value: storeName },
    storeAddress ? { label: "Studio Address", value: storeAddress } : null,
    storePhone ? { label: "Studio Phone", value: storePhone } : null,
  ].filter(Boolean);

  const html = buildOtpEmailHtml({
    greeting:
      customerName && customerName !== "Valued Customer"
        ? `HELLO ${customerName.toUpperCase()},`
        : "HELLO,",
    title,
    subtitle,
    otp,
    details,
    importantNote,
  });

  const text = `
Raffu - On-Demand Alterations
${isPickup ? "YOUR ORDER IS READY FOR PICKUP!" : `ORDER #${orderId} CONFIRMATION PIN`}

Hello ${customerName},

${subtitle}

PIN: ${otp}

Order Details:
- Order ID: #${orderId}
- Garment Type: ${garmentName}
- Alteration Service: ${serviceName}
- Partner Studio: ${storeName}
${storeAddress ? `- Address: ${storeAddress}\n` : ""}${storePhone ? `- Phone: ${storePhone}\n` : ""}

${importantNote}
  `.trim();

  try {
    const fromAddress = getFromEmail();
    const result = await client.emails.send({
      from: fromAddress,
      to: toEmail,
      subject,
      html,
      text,
    });

    if (result.error) {
      console.error(
        `[EMAIL ERROR] Resend rejected order OTP email to ${toEmail}:`,
        result.error,
      );
      return { success: false, error: result.error };
    }

    sentOrderEmailTracker.add(dedupKey);
    console.log(
      `[EMAIL] Order OTP email sent successfully to ${toEmail} for #${orderId} (Resend ID: ${result.data?.id})`,
    );
    return { success: true, id: result.data?.id };
  } catch (err) {
    console.error(
      `[EMAIL ERROR] Failed to send order OTP email to ${toEmail}:`,
      err.message || err,
    );
    return { success: false, error: err.message };
  }
}

/**
 * Sends an Authentication Verification Code OTP email.
 */
async function sendAuthOtpEmail({ toEmail, otp, customerName = "Raffu User" }) {
  if (!toEmail || !toEmail.includes("@")) {
    return { success: false, reason: "Invalid email address" };
  }

  const client = getResendClient();
  if (!client) {
    return { success: false, reason: "RESEND_API_KEY missing" };
  }

  const subject = `Your Raffu Verification Code: ${otp}`;

  const details = [
    { label: "Purpose", value: "Account Sign-In Verification" },
    { label: "Valid For", value: "10 Minutes" },
  ];

  const html = buildOtpEmailHtml({
    greeting: customerName ? `HELLO ${customerName.toUpperCase()},` : "HELLO,",
    title: "Verify Your Email Address",
    subtitle:
      "Please use the 4-digit verification code below to complete your sign-in to Raffu.",
    otp,
    details,
    importantNote:
      "This code is valid for 10 minutes. Do not share this code with anyone.",
  });

  const text = `Your Raffu verification code is: ${otp}. Valid for 10 minutes. Do not share this code with anyone.`;

  try {
    const fromAddress = getFromEmail();
    const result = await client.emails.send({
      from: fromAddress,
      to: toEmail,
      subject,
      html,
      text,
    });

    if (result.error) {
      console.error(
        `[EMAIL ERROR] Resend rejected auth OTP email to ${toEmail}:`,
        result.error,
      );
      return { success: false, error: result.error };
    }

    console.log(
      `[EMAIL] Auth OTP email dispatched to ${toEmail} (Resend ID: ${result.data?.id})`,
    );
    return { success: true, id: result.data?.id };
  } catch (err) {
    console.error(
      `[EMAIL ERROR] Failed to send auth OTP email to ${toEmail}:`,
      err.message || err,
    );
    return { success: false, error: err.message };
  }
}

/**
 * Builds the Welcome HTML email matching user specifications exactly:
 * - Outer neutral backdrop (#EFEFEF / #F0F0F0)
 * - Two-tone card:
 *   - Dark navy / slate top header (#373C52)
 *   - Coral / orange-red circular badge (#F05B48) with white handshake icon
 *   - Elegant cursive "Welcome!" script heading in white
 *   - Crisp white body with exact paragraph layout and line spacing
 *   - "By the way," note
 *   - Vibrant grass-green button (#76BC43) "Head to your Raffu" / "Head to your Raffu Studio"
 *   - "Team Raffu" sign-off
 * - Centered muted grey logo and copyright footer below card
 */
function buildWelcomeEmailHtml({
  name = "Valued Member",
  email = "member@raffu.com",
  role = "CUSTOMER", // 'CUSTOMER' | 'STUDIO'
  studioName = "",
  phone = "",
  portalUrl = "",
  loginUrl = "",
}) {
  const isStudio = role === "STUDIO" || role === "TEMP_STUDIO";
  const defaultCustomerUrl = process.env.FRONTEND_URL || "";
  const defaultStudioUrl = process.env.STUDIO_URL || "";

  const effectivePortalUrl =
    portalUrl || (isStudio ? defaultStudioUrl : defaultCustomerUrl);
  const effectiveLoginUrl = loginUrl || effectivePortalUrl;

  const contactUrl = `${effectivePortalUrl.replace(/\/$/, "")}/contact`;
  const buttonText = isStudio
    ? "Head to your Raffu Studio"
    : "Head to your Raffu";
  const teamText = isStudio ? "Team Raffu Studio" : "Team Raffu";

  const paragraph1 = isStudio
    ? "Woo! Your studio is active - your atelier is now onboarded with us and, we will be sending you bite-sized tips in your email over the coming weeks to help you grow your bespoke alteration business too."
    : "Woo! Your account is active - you have full access with us and, we will be sending you bite-sized tips in your email over the coming weeks to help you get the most out of your bespoke garment alterations too.";

  const paragraph2 = isStudio
    ? "Reach out at any time with questions! Right now, head into the workbench, set up your tailor machines and view your incoming orders. We will be happy to help with the rest."
    : "Reach out at any time with questions! Right now, head into the app, explore nearby partner studios and place your first alteration order. We will be happy to help with the rest.";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Raffu</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Dancing+Script:wght@700&display=swap');
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #EFEFEF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333333; -webkit-font-smoothing: antialiased;">
  <!-- Outer Canvas Table -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #EFEFEF; padding: 40px 16px;">
    <tr>
      <td align="center" valign="middle">

        <!-- Main Card Wrapper (max-width: 480px) -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; margin: 0 auto; background-color: #FFFFFF; border-radius: 4px; overflow: hidden; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);">
          
          <!-- Top Dark Navy/Slate Header Section (#373C52) -->
          <tr>
            <td align="center" style="background-color: #373C52; padding: 22px 20px; text-align: center;">
              
              <!-- "Welcome to Raffu" Title -->
              <h1 style="margin: 0; padding: 0; font-family: 'Dancing Script', 'Caveat', 'Brush Script MT', 'Snell Roundhand', 'Segoe Script', cursive; font-size: 34px; font-weight: 600; font-style: italic; color: #FFFFFF; letter-spacing: 0.5px; line-height: 1.2;">
                Welcome to Raffu
              </h1>

            </td>
          </tr>

          <!-- Lower White Card Body Section -->
          <tr>
            <td style="padding: 38px 40px 38px 40px; background-color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13.5px; line-height: 1.62; color: #333333;">
              
              <!-- Paragraph 1 -->
              <p style="margin: 0 0 20px 0; font-size: 13.5px; line-height: 1.62; color: #333333;">
                ${paragraph1}
              </p>

              <!-- Paragraph 2 -->
              <p style="margin: 0 0 20px 0; font-size: 13.5px; line-height: 1.62; color: #333333;">
                ${paragraph2}
              </p>

              <!-- Paragraph 3 -->
              <p style="margin: 0 0 18px 0; font-size: 13.5px; line-height: 1.62; color: #333333;">
                By the way,
              </p>

              <!-- Green Action Button (#76BC43) -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td>
                    <a href="${effectiveLoginUrl}" target="_blank" style="display: inline-block; background-color: #76BC43; color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13.5px; font-weight: 700; text-decoration: none; padding: 11px 22px; border-radius: 3px; line-height: 1.2;">
                      ${buttonText}
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Team Sign-off -->
              <p style="margin: 0; font-size: 13.5px; font-weight: 700; color: #333333;">
                ${teamText}
              </p>

              <!-- Contact Page Link at the end of the card -->
              <div style="border-top: 1px solid #EBEBEB; padding-top: 18px; margin-top: 24px;">
                <p style="margin: 0; font-size: 12.5px; color: #555555; line-height: 1.55;">
                  Have questions or need assistance? Visit our <a href="${contactUrl}" target="_blank" style="color: #2563EB; font-weight: 600; text-decoration: underline;">Contact Page</a>.
                </p>
              </div>

            </td>
          </tr>

        </table>

        <!-- Outer Footer Section Below Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; margin: 24px auto 0 auto; text-align: center;">
          <tr>
            <td align="center">
              
              <!-- Contact Page Link in Footer -->
              <p style="margin: 0 0 10px 0; font-size: 12px; color: #888888; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                Questions? Reach out via our <a href="${contactUrl}" target="_blank" style="color: #2563EB; text-decoration: underline; font-weight: 600;">Contact Page</a>
              </p>

              <!-- Muted Brand Logo -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto 6px auto;">
                <tr>
                  <td align="center" valign="middle">
                    <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 26px; font-weight: 800; color: #9E9E9E; letter-spacing: -0.5px; text-decoration: none;">
                      raffu
                    </span>
                    <span style="display: inline-block; margin-left: 4px; vertical-align: middle; background-color: #BDBDBD; color: #FFFFFF; font-size: 9px; font-weight: 800; padding: 2px 5px; border-radius: 3px; letter-spacing: 0.5px;">
                      APP
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Copyright -->
              <p style="margin: 0; font-size: 11px; color: #B0B0B0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                &copy; Copyright Raffu Labs Ltd, 2026
              </p>

            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// Persistent deduplication registry to guarantee each account receives only 1 welcome email on initial signup
const WELCOME_CACHE_FILE = path.join(__dirname, "../sent_welcome_emails.json");
let sentWelcomeEmails = new Set();
try {
  if (fs.existsSync(WELCOME_CACHE_FILE)) {
    const data = JSON.parse(fs.readFileSync(WELCOME_CACHE_FILE, "utf8"));
    if (Array.isArray(data)) {
      sentWelcomeEmails = new Set(data);
    }
  }
} catch (e) {
  sentWelcomeEmails = new Set();
}

function recordSentWelcomeEmail(key) {
  sentWelcomeEmails.add(key);
  try {
    fs.writeFileSync(
      WELCOME_CACHE_FILE,
      JSON.stringify(Array.from(sentWelcomeEmails), null, 2),
      "utf8",
    );
  } catch (e) {
    console.warn("[WELCOME EMAIL] Failed to save sent email cache file:", e.message);
  }
}

// In-memory cooldown store to prevent rapid duplicate sends during a single signup flow
// Cooldown duration: 2 minutes (120,000ms)
const WELCOME_EMAIL_COOLDOWN_MS = 2 * 60 * 1000;
const welcomeEmailCooldownMap = new Map();

/**
 * Sends a Welcome email to a newly onboarded user or partner studio.
 * Matches the reference card layout with brand-themed terracotta top strip.
 */
async function sendWelcomeEmail({
  toEmail,
  name,
  role = "CUSTOMER",
  studioName = "",
  phone = "",
  portalUrl = "",
  loginUrl = "",
  force = false,
}) {
  if (!toEmail || !toEmail.includes("@") || toEmail.includes("example.com")) {
    console.warn(
      `[WELCOME EMAIL] Skipped: Invalid or missing email address (${toEmail})`,
    );
    return { success: false, reason: "Invalid or missing email address" };
  }

  const cleanEmail = toEmail.trim().toLowerCase();
  const isStudio = role === "STUDIO" || role === "TEMP_STUDIO";
  const dedupKey = `welcome:${cleanEmail}:${isStudio ? "studio" : "customer"}`;

  // Strict deduplication: Welcome email is ONLY sent once on initial signup
  if (!force && sentWelcomeEmails.has(dedupKey)) {
    console.log(
      `[WELCOME EMAIL] Skipped: Welcome email already delivered to ${cleanEmail} for ${isStudio ? "studio" : "customer"}. Only sent once on new signup.`,
    );
    return {
      success: true,
      deduplicated: true,
      message: "Welcome email already delivered for this account.",
    };
  }

  const now = Date.now();
  const lastSentTime = welcomeEmailCooldownMap.get(dedupKey);

  // Debounce check: prevent duplicate dispatches within 2 minutes (e.g., rapid auth steps)
  if (
    !force &&
    lastSentTime &&
    now - lastSentTime < WELCOME_EMAIL_COOLDOWN_MS
  ) {
    const remainingSec = Math.ceil(
      (WELCOME_EMAIL_COOLDOWN_MS - (now - lastSentTime)) / 1000,
    );
    console.log(
      `[WELCOME EMAIL COOLDOWN] Welcome email recently dispatched to ${cleanEmail} as ${role} (${remainingSec}s cooldown remaining). Skipping duplicate.`,
    );
    return {
      success: true,
      deduplicated: true,
      message: `Welcome email recently delivered. Cooldown active for ${remainingSec}s.`,
    };
  }

  const client = getResendClient();
  if (!client) {
    console.warn(
      `[WELCOME EMAIL] Resend client not configured. Welcome email simulated for ${cleanEmail}.`,
    );
    return { success: false, reason: "RESEND_API_KEY missing" };
  }

  const subject = "Welcome!";

  const defaultCustomerUrl = process.env.FRONTEND_URL || "";
  const defaultStudioUrl = process.env.STUDIO_URL || "";
  const effectivePortalUrl =
    portalUrl || (isStudio ? defaultStudioUrl : defaultCustomerUrl);
  const contactUrl = `${effectivePortalUrl.replace(/\/$/, "")}/contact`;

  const html = buildWelcomeEmailHtml({
    name,
    email: cleanEmail,
    role,
    studioName,
    phone,
    portalUrl,
    loginUrl,
  });

  const plainText = `
Welcome!

${
  isStudio
    ? "Woo! Your studio is active - your atelier is now onboarded with us and, we will be sending you bite-sized tips in your email over the coming weeks to help you grow your bespoke alteration business too."
    : "Woo! Your account is active - you have full access with us and, we will be sending you bite-sized tips in your email over the coming weeks to help you get the most out of your bespoke garment alterations too."
}

${
  isStudio
    ? "Reach out at any time with questions! Right now, head into the workbench, set up your tailor machines and view your incoming orders. We will be happy to help with the rest."
    : "Reach out at any time with questions! Right now, head into the app, explore nearby partner studios and place your first alteration order. We will be happy to help with the rest."
}

By the way,

${isStudio ? "Head to your Raffu Studio" : "Head to your Raffu"}: ${loginUrl || portalUrl || "https://raffu.com"}

${isStudio ? "Team Raffu Studio" : "Team Raffu"}

Have questions or need assistance? Visit our Contact Page: ${contactUrl}

© Copyright Raffu Labs Ltd, 2026
  `.trim();

  // Prepare CID attachment for welcome handshake image
  try {
    const fromAddress = getFromEmail();
    const result = await client.emails.send({
      from: fromAddress,
      to: cleanEmail,
      subject,
      html,
      text: plainText,
    });

    if (result.error) {
      console.error(
        `[WELCOME EMAIL ERROR] Resend rejected welcome email to ${cleanEmail}:`,
        result.error,
      );
      return { success: false, error: result.error };
    }

    welcomeEmailCooldownMap.set(dedupKey, Date.now());
    recordSentWelcomeEmail(dedupKey);
    console.log(
      `[WELCOME EMAIL] Successfully delivered welcome email to ${cleanEmail} (${role}) via Resend (ID: ${result.data?.id})`,
    );
    return { success: true, id: result.data?.id };
  } catch (err) {
    console.error(
      `[WELCOME EMAIL ERROR] Failed to send welcome email to ${cleanEmail}:`,
      err.message || err,
    );
    return { success: false, error: err.message };
  }
}

/**
 * Sends a Concierge / Contact Form submission directly to support email (developer.sitarahub@gmail.com).
 */
async function sendConciergeInquiryEmail({
  name,
  email,
  phone,
  topic,
  orderNumber,
  message,
  source = "Customer Concierge Desk",
  priority,
}) {
  const client = getResendClient();
  const recipient = process.env.SUPPORT_EMAIL || "developer.sitarahub@gmail.com";

  const topicLabels = {
    alteration_inquiry: "Question about Garment Alteration & Pinning",
    order_status: "Order Progress & Studio Drop-off Assistance",
    fit_guarantee: "100% Fit Guarantee Adjustment Request",
    bespoke_consultation: "Bespoke Bridal or Suit Tailoring Advice",
    other: "General Inquiries / Feedback",
    payout_query: "Weekly Settlement & Bank Payout Query",
    sla_dispute: "Customer Measurement & Fit Dispute",
    capacity_pause: "Temporary Capacity Pause / Machine Repair",
    profile_specialties: "Atelier Profile & Services Update",
    materials_threads: "OEM Industrial Threads & Hangtag Reorder",
    app_bug: "Workbench Software / Telemetry Assistance",
  };

  const humanTopic = topicLabels[topic] || topic || "General Concierge Request";
  const cleanName = (name || "Customer").trim();
  const cleanPhone = (phone || "").trim();
  const cleanEmail = (email || "").trim();
  const cleanOrder = (orderNumber || "").trim();
  const cleanMessage = (message || "").trim();
  const cleanPriority = (priority || "").trim();

  const subject = `[Raffu Concierge Request] ${humanTopic} - from ${cleanName}`;

  const plainText = `
Raffu Concierge Inquiry
-----------------------
Source: ${source}
Topic: ${humanTopic}
Sender: ${cleanName}
Phone: ${cleanPhone || "Not provided"}
Email: ${cleanEmail || "Not provided"}
Order Reference: ${cleanOrder || "None"}
${cleanPriority ? `Priority: ${cleanPriority}\n` : ""}

Message / Garment Notes:
${cleanMessage}

Submitted: ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata" })} IST
  `.trim();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>New Concierge Inquiry</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FAF8F5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18191B;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #FAF8F5; padding: 40px 16px;">
    <tr>
      <td align="center" valign="middle">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #EBE6DF; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.04);">
          <!-- Top Accent Banner -->
          <tr>
            <td style="background-color: #18191B; padding: 24px 32px; text-align: left;">
              <span style="display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #D88D70; margin-bottom: 6px;">Raffu Client Concierge</span>
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #FFFFFF; font-family: Georgia, serif;">New Concierge Request Received</h1>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 20px; font-size: 14px; color: #5A5D64; line-height: 1.6;">
                A new inquiry has been submitted via <strong>${source}</strong>. You can respond directly to this email if an email address was provided.
              </p>

              <!-- Topic Callout -->
              <table role="presentation" width="100%" style="background-color: #FBF7F4; border-left: 4px solid #9E593B; border-radius: 8px; margin-bottom: 24px; padding: 12px 16px;">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #9E593B;">Topic / Category</div>
                    <div style="font-size: 15px; font-weight: 700; color: #0F1115; margin-top: 2px;">${humanTopic}</div>
                  </td>
                </tr>
              </table>

              <!-- Client Details Table -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #EFEAE3; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 16px; font-size: 12px; font-weight: 600; color: #7A7E85; border-bottom: 1px solid #EFEAE3; width: 140px;">Customer / Contact:</td>
                  <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #0F1115; border-bottom: 1px solid #EFEAE3;">${cleanName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-size: 12px; font-weight: 600; color: #7A7E85; border-bottom: 1px solid #EFEAE3;">Phone Number:</td>
                  <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #0F1115; border-bottom: 1px solid #EFEAE3;">
                    ${cleanPhone ? `<a href="tel:${cleanPhone}" style="color: #9E593B; text-decoration: none;">${cleanPhone}</a>` : '<span style="color: #9CA3AF;">Not provided</span>'}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-size: 12px; font-weight: 600; color: #7A7E85; border-bottom: 1px solid #EFEAE3;">Email Address:</td>
                  <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #0F1115; border-bottom: 1px solid #EFEAE3;">
                    ${cleanEmail ? `<a href="mailto:${cleanEmail}" style="color: #9E593B; text-decoration: none;">${cleanEmail}</a>` : '<span style="color: #9CA3AF;">Not provided</span>'}
                  </td>
                </tr>
                ${cleanOrder ? `
                <tr>
                  <td style="padding: 12px 16px; font-size: 12px; font-weight: 600; color: #7A7E85; border-bottom: 1px solid #EFEAE3;">Order Reference:</td>
                  <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #0F1115; border-bottom: 1px solid #EFEAE3;">${cleanOrder}</td>
                </tr>` : ""}
                ${cleanPriority ? `
                <tr>
                  <td style="padding: 12px 16px; font-size: 12px; font-weight: 600; color: #7A7E85; border-bottom: 1px solid #EFEAE3;">Priority Level:</td>
                  <td style="padding: 12px 16px; font-size: 13px; font-weight: 700; color: #DC2626; border-bottom: 1px solid #EFEAE3;">${cleanPriority.toUpperCase()}</td>
                </tr>` : ""}
                <tr>
                  <td style="padding: 12px 16px; font-size: 12px; font-weight: 600; color: #7A7E85;">Source Channel:</td>
                  <td style="padding: 12px 16px; font-size: 12px; color: #5A5D64;">${source}</td>
                </tr>
              </table>

              <!-- Customer Message Block -->
              <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #7A7E85; margin-bottom: 8px;">
                Message / Garment Notes:
              </div>
              <div style="background-color: #FAF8F5; border: 1px solid #E5DFD7; border-radius: 12px; padding: 18px 20px; font-size: 14px; line-height: 1.6; color: #18191B; white-space: pre-wrap;">${cleanMessage}</div>

              <!-- Quick Reply button if email available -->
              ${cleanEmail ? `
              <div style="margin-top: 24px; text-align: center;">
                <a href="mailto:${cleanEmail}?subject=Re: Raffu Concierge - ${encodeURIComponent(humanTopic)}" style="display: inline-block; background-color: #18191B; color: #FFFFFF; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 12px 24px; border-radius: 50px; text-decoration: none;">Reply to Customer Directly</a>
              </div>` : ""}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F9F7F4; border-top: 1px solid #EBE6DF; padding: 16px 32px; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #7A7E85;">
                Raffu Concierge Notifications &bull; Sent to ${recipient}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  if (!client) {
    console.warn(`[CONCIERGE EMAIL] Resend client not configured. Message from ${cleanName}: ${cleanMessage}`);
    return { success: false, reason: "RESEND_API_KEY missing" };
  }

  try {
    const defaultFrom = getFromEmail();
    const emailMatch = defaultFrom.match(/<([^>]+)>/);
    const pureFromEmail = emailMatch
      ? emailMatch[1]
      : defaultFrom.includes('@')
        ? defaultFrom.trim()
        : 'no-reply@indoglobaltradefair.com';
    const senderDisplayName = cleanName.replace(/["<>\r\n]/g, '').trim() || 'Raffu Concierge';
    const fromAddress = `"${senderDisplayName}" <${pureFromEmail}>`;

    const payload = {
      from: fromAddress,
      to: recipient,
      subject,
      html,
      text: plainText,
    };
    if (cleanEmail && cleanEmail.includes("@")) {
      payload.reply_to = cleanEmail;
    }

    const result = await client.emails.send(payload);

    if (result.error) {
      console.error(
        `[CONCIERGE EMAIL ERROR] Resend rejected email to ${recipient}:`,
        result.error,
      );
      return { success: false, error: result.error };
    }

    console.log(
      `[CONCIERGE EMAIL] Successfully delivered concierge form from ${cleanName} (${cleanEmail || cleanPhone}) to ${recipient} (ID: ${result.data?.id})`,
    );
    return { success: true, id: result.data?.id };
  } catch (err) {
    console.error(
      `[CONCIERGE EMAIL ERROR] Failed to send email to ${recipient}:`,
      err.message || err,
    );
    return { success: false, error: err.message };
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Tell a studio partner the outcome of their one-time studio verification review.
 */
async function sendStudioVerificationEmail({ toEmail, studioName, approved, reason }) {
  const client = getResendClient();
  if (!client || !toEmail) {
    return { success: false, error: "Email client or recipient missing" };
  }

  const studioUrl = (process.env.STUDIO_URL || "").replace(/\/$/, "");
  const cleanName = escapeHtml((studioName || "your studio").trim());
  const cleanReason = escapeHtml((reason || "").trim());

  const subject = approved
    ? "Your studio is verified - you can now receive tailoring requests"
    : "Action needed: your studio verification was not approved";

  const plainText = approved
    ? `Good news! ${studioName || "Your studio"} has been verified on Raffu. You will now receive nearby tailoring requests.\n\n${studioUrl}/dashboard`
    : `We could not approve the verification for ${studioName || "your studio"}.\n\nReason: ${reason || "Not specified"}\n\nPlease upload new files here: ${studioUrl}/verification`;

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1C1917">
  <h2 style="margin:0 0 12px;font-size:20px">${approved ? "Your studio is verified" : "Verification not approved"}</h2>
  ${
    approved
      ? `<p style="font-size:14px;line-height:1.6">Good news! <strong>${cleanName}</strong> has been verified on Raffu. You will now receive nearby tailoring requests in your workbench.</p>`
      : `<p style="font-size:14px;line-height:1.6">We could not approve the verification for <strong>${cleanName}</strong>.</p>
         <p style="font-size:14px;line-height:1.6;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px"><strong>Reason:</strong> ${cleanReason || "Not specified"}</p>
         <p style="font-size:14px;line-height:1.6">Please upload new photos and a machines video so we can review your studio again.</p>`
  }
  ${
    studioUrl
      ? `<p style="margin-top:20px"><a href="${studioUrl}${approved ? "/dashboard" : "/verification"}" style="background:#1C1917;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:bold">${approved ? "Open workbench" : "Upload again"}</a></p>`
      : ""
  }
</div>`;

  try {
    const result = await client.emails.send({
      from: getFromEmail(),
      to: [toEmail],
      subject,
      html,
      text: plainText,
    });
    if (result.error) {
      console.error(`[VERIFICATION EMAIL ERROR] Resend rejected email to ${toEmail}:`, result.error);
      return { success: false, error: result.error };
    }
    return { success: true, id: result.data?.id };
  } catch (err) {
    console.error(`[VERIFICATION EMAIL ERROR] Failed to send email to ${toEmail}:`, err.message || err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  getResendClient,
  sendStudioVerificationEmail,
  sendOrderOtpEmail,
  sendAuthOtpEmail,
  sendWelcomeEmail,
  sendConciergeInquiryEmail,
  buildWelcomeEmailHtml,
  buildOtpEmailHtml,
};
