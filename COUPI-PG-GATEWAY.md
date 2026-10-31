# COUPI PG V2 — E-Commerce Payment Gateway Integration

Version: 1.0
Environment: Production
Currency: INR
Gateway: CouPI PG V2
Hosting: Render Docker
Domain: smtools.eu.cc

---

## 1. Production Gateway URLs

| Service | URL |
|---|---|
| Checkout Portal | https://pay.smtools.eu.cc |
| Payment Core API | https://pay-api.smtools.eu.cc |
| Merchant Admin | https://pay-admin.smtools.eu.cc |
| Gmail Observer | https://pay-gmail.smtools.eu.cc |
| Demo Store | https://pay-store.smtools.eu.cc |

### API configuration

Preferred production API base URL:

https://pay.smtools.eu.cc

Payment API direct hostname:

https://pay-api.smtools.eu.cc

Checkout URL:

https://pay.smtools.eu.cc

Use HTTPS for all production requests.

The checkout portal is the preferred integration entry point because it is documented as the transparent API proxy.

---

## 2. Gateway Service Architecture

| Component | Internal Port |
|---|---:|
| Payment Core API | 6100 |
| Checkout Portal | 7000 |
| Merchant Admin | 6001 |
| Gmail Observer | 6003 |
| Demo Store | 5000 |
| Control Center | 8090 |

All services run inside the deployed Docker application.

Public traffic is routed through Cloudflare Tunnel.

---

## 3. E-Commerce Gateway Settings

Configure the following in your e-commerce backend.

```env
PAYMENT_PROVIDER=coupi

COUPI_ENVIRONMENT=production

COUPI_CHECKOUT_URL=https://pay.smtools.eu.cc

COUPI_API_URL=https://pay.smtools.eu.cc

COUPI_DIRECT_API_URL=https://pay-api.smtools.eu.cc

COUPI_CURRENCY=INR

COUPI_RETURN_URL=https://YOUR-STORE-DOMAIN.com/payment/complete

COUPI_WEBHOOK_URL=https://YOUR-STORE-DOMAIN.com/api/webhooks/coupi

COUPI_MERCHANT_ID=YOUR_MERCHANT_ID

COUPI_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET
```

IMPORTANT:

- Replace YOUR-STORE-DOMAIN.com with your actual e-commerce domain.
- Obtain the merchant identifier from the gateway's merchant configuration.
- Obtain or configure the webhook signing secret using the gateway's supported merchant configuration.
- Never expose webhook secrets in browser JavaScript.
- Do not assume the gateway automatically creates these merchant credentials.

These are variables for your e-commerce application. They are not additional Render variables to copy blindly into the gateway.

---

## 4. Payment Creation API

Endpoint:

POST https://pay.smtools.eu.cc/api/v1/payments

Headers:

```http
Content-Type: application/json
X-Merchant-Id: YOUR_MERCHANT_ID
Idempotency-Key: UNIQUE_ORDER_PAYMENT_KEY
```

Request:

```json
{
  "orderId": "ORD-10001",
  "amount": "499.00",
  "currency": "INR",
  "customer": {
    "name": "Customer Name",
    "email": "customer@example.com",
    "phoneNumber": "9876543210"
  },
  "description": "Order ORD-10001",
  "returnUrl": "https://YOUR-STORE-DOMAIN.com/payment/complete",
  "metadata": {
    "orderId": "ORD-10001",
    "source": "ecommerce"
  }
}
```

Expected response structure:

```json
{
  "paymentId": "PAYMENT_UUID",
  "orderId": "ORD-10001",
  "amount": "499.00",
  "amountPaise": "49900",
  "currency": "INR",
  "status": "INITIATED",
  "checkoutUrl": "https://pay.smtools.eu.cc/checkout/PAYMENT_UUID"
}
```

The response fields and actual checkout URL should be read from the API response, not constructed manually.

Redirect the customer to the returned checkoutUrl.

---

## 5. Recommended E-Commerce Checkout Flow

1. Customer adds products to cart.
2. Customer enters shipping and billing information.
3. E-commerce backend creates an order.
4. Backend calculates the final payable amount.
5. Backend creates a CouPI payment session.
6. CouPI returns a payment ID and checkout URL.
7. Customer is redirected to CouPI checkout.
8. Customer completes UPI payment.
9. CouPI receives and processes the bank credit observation.
10. CouPI sends the signed payment webhook to the store.
11. Store verifies the webhook signature.
12. Store marks the order as paid only after successful verification.

Flow:

```text
CUSTOMER
   |
   v
ECOMMERCE STORE
   |
   v
CREATE ORDER
   |
   v
STORE BACKEND
   |
   v
COUPI PAYMENT API
   |
   v
CHECKOUT URL
   |
   v
CUSTOMER UPI PAYMENT
   |
   v
BANK CREDIT OBSERVER
   |
   v
COUPI VERIFICATION
   |
   v
SIGNED WEBHOOK
   |
   v
ECOMMERCE BACKEND
   |
   v
VERIFY SIGNATURE
   |
   v
MARK ORDER PAID
   |
   v
FULFIL ORDER
```

---

## 6. Node.js Payment Creation Example

The following example runs on your e-commerce backend.

```javascript
async function createCoupiPayment(order) {
  const response = await fetch(
    `${process.env.COUPI_API_URL}/api/v1/payments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Merchant-Id": process.env.COUPI_MERCHANT_ID,
        "Idempotency-Key": `order-${order.id}`
      },
      body: JSON.stringify({
        orderId: String(order.id),
        amount: Number(order.total).toFixed(2),
        currency: "INR",
        customer: {
          name: order.customer.name,
          email: order.customer.email,
          phoneNumber: order.customer.phone
        },
        description: `Order ${order.id}`,
        returnUrl: process.env.COUPI_RETURN_URL,
        metadata: {
          orderId: String(order.id)
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `CouPI payment creation failed: ${response.status}`
    );
  }

  const payment = await response.json();

  if (!payment.paymentId || !payment.checkoutUrl) {
    throw new Error("Invalid CouPI payment response");
  }

  // Save paymentId against the existing local order.
  // Keep the order pending until signed webhook verification.

  return payment;
}
```

Your store should generate its own unique order IDs and never accept
the final amount from an untrusted browser request.

---

## 7. Payment Status API

Endpoint:

GET https://pay.smtools.eu.cc/api/v1/payments/{PAYMENT_ID}

Example:

```http
GET /api/v1/payments/PAYMENT_UUID
```

Possible payment states:

| Status | Meaning |
|---|---|
| INITIATED | Payment session created |
| ACTIVE | Payment is active |
| QUEUED | Waiting for a payment slot |
| PROCESSING | Verification in progress |
| SUCCESS | Payment verified |
| FAILED | Payment failed |
| EXPIRED | Payment session expired |
| CANCELLED | Payment cancelled |

Use this endpoint for server-side reconciliation.

Do not mark an order as paid merely because the customer returns to the success page.

---

## 8. Webhook Integration

Configure the store's webhook URL:

https://YOUR-STORE-DOMAIN.com/api/webhooks/coupi

Method:

POST

Expected headers:

```http
Content-Type: application/json
X-Gateway-Event: SUCCESS
X-Gateway-Signature: sha256=SIGNATURE
X-Gateway-Delivery-Id: DELIVERY_UUID
```

Example event:

```json
{
  "event": "SUCCESS",
  "paymentId": "PAYMENT_UUID",
  "orderId": "ORD-10001",
  "amount": "499.00",
  "amountPaise": 49900,
  "currency": "INR",
  "method": "UPI",
  "utr": "123456789012",
  "completedAt": "2026-10-30T10:00:00.000Z"
}
```

Other events:

- SUCCESS
- FAILED
- EXPIRED
- CANCELLED

### Webhook signature verification

CouPI uses HMAC-SHA256.

Node.js / Express example:

```javascript
import crypto from "node:crypto";
import express from "express";

const app = express();

app.post(
  "/api/webhooks/coupi",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature =
      req.headers["x-gateway-signature"] || "";

    const secret = process.env.COUPI_WEBHOOK_SECRET;

    if (!secret || !Buffer.isBuffer(req.body)) {
      return res.status(400).send("Invalid configuration");
    }

    const expected =
      "sha256=" +
      crypto
        .createHmac("sha256", secret)
        .update(req.body)
        .digest("hex");

    const receivedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(
        receivedBuffer,
        expectedBuffer
      )
    ) {
      return res.status(401).send("Invalid signature");
    }

    const event = JSON.parse(req.body.toString("utf8"));

    // Find the existing order using event.orderId.
    // Verify its paymentId and expected amount.
    // Check whether this event has already been processed.
    // Update the order transactionally.

    if (event.event === "SUCCESS") {
      // Mark order as PAID only after all checks.
    }

    if (event.event === "FAILED") {
      // Record payment failure.
    }

    if (event.event === "EXPIRED") {
      // Record expiry.
    }

    if (event.event === "CANCELLED") {
      // Record cancellation.
    }

    return res.status(200).json({
      received: true
    });
  }
);
```

IMPORTANT:

- Use the exact raw request body for signature verification.
- Configure the raw-body route before global JSON parsing middleware.
- Never trust a browser-side payment success event.
- Make webhook processing idempotent.
- Verify order ID, payment ID, currency and expected amount.
- Prevent duplicate order fulfilment.
- Persist webhook delivery IDs and processing results.
- Do not acknowledge an event as successfully processed before your
  order update has been committed.

The webhook secret must be the matching secret used by CouPI.
Do not generate an unrelated secret on the store and assume it matches.

---

## 9. Checkout JavaScript SDK

CouPI's repository documents a universal JavaScript checkout SDK.

SDK URL:

https://pay.smtools.eu.cc/coupi.js

The documented integration pattern is:

```html
<script
  src="https://pay.smtools.eu.cc/coupi.js"
  data-coupi-key="YOUR_MERCHANT_KEY">
</script>
```

Example button:

```html
<button
  data-coupi-pay
  data-order-id="ORDER-10001"
  data-amount="499"
  data-customer-name="Customer Name"
  data-customer-email="customer@example.com"
  data-customer-phone="9876543210">
  Pay with UPI
</button>
```

IMPORTANT:

The SDK is an alternative frontend integration method.
For a production e-commerce store, create orders and payment sessions
from your backend so customers cannot manipulate order amounts.

Confirm the SDK's merchant-key requirements and callback behaviour
against your deployed SDK version before enabling this method.

---

## 10. Render Production Configuration

Render project:

My Project

Environment:

Production

Service:

coupi-pg-test

Runtime:

Docker

Region:

Singapore

Start command:

npm start

Expected application environment variables include:

```env
NODE_ENV=production

PAYMENT_API_PORT=6100
CHECKOUT_PORTAL_PORT=7000
MERCHANT_ADMIN_PORT=6001
GMAIL_OBSERVER_PORT=6003
COIN_WALLET_STORE_PORT=5000
HELP_PORTAL_PORT=3000

CLOUDFLARE_DOMAIN=smtools.eu.cc
DEPLOYMENT_PREFIX=pay

SQLITE_DB_PATH=/app/data/coupi_pg.sqlite
USE_SQLITE_FALLBACK=true
```

Existing deployment also uses:

```env
CLOUDFLARE_TUNNEL_TOKEN=YOUR_SECRET
CLOUDFLARE_TUNNEL_COMMAND=YOUR_CONFIGURED_COMMAND

ENCRYPTION_MASTER_KEY=YOUR_32_BYTE_HEX_KEY
JWT_SECRET=YOUR_RANDOM_SECRET

INITIAL_ADMIN_EMAIL=YOUR_ADMIN_EMAIL
INITIAL_ADMIN_PASSWORD=YOUR_STRONG_PASSWORD

ANDROID_ENROLLMENT_SECRET=YOUR_RANDOM_SECRET
```

Do not replace working deployment values without checking the actual
application configuration.

Never put real secrets in this document or GitHub.

### Persistent storage

Configure a Render persistent disk:

Mount path:

/app/data

Ensure the SQLite database path is inside this mounted directory.

Back up the database regularly.

Do not assume a successful deployment means SQLite data is persistent.

---

## 11. Cloudflare Configuration

Tunnel:

coupi-render-tunnel

Status:

Healthy

Expected public hostname routes:

| Hostname | Origin |
|---|---|
| pay.smtools.eu.cc | http://localhost:7000 |
| pay-api.smtools.eu.cc | http://localhost:6100 |
| pay-admin.smtools.eu.cc | http://localhost:6001 |
| pay-gmail.smtools.eu.cc | http://localhost:6003 |
| pay-store.smtools.eu.cc | http://localhost:5000 |

All routes should use the existing Cloudflare Tunnel.

Avoid conflicting direct A or CNAME records.

Do not create an origin loop by pointing the tunnel back to its own
public hostname.

---

## 12. Merchant Admin Configuration

Open:

https://pay-admin.smtools.eu.cc

Configure the merchant's actual receiving account and business details.

Checklist:

- [ ] Merchant profile configured.
- [ ] Merchant identity verified as required by the bank.
- [ ] Receiving UPI VPA configured.
- [ ] Payee name checked against the bank account.
- [ ] Bank Gmail observer connected.
- [ ] Bank credit alerts enabled.
- [ ] Observer connection verified.
- [ ] Webhook destination configured.
- [ ] Webhook signing secret securely configured.
- [ ] Test transaction reconciled successfully.

Only use receiving accounts that your business is authorized to use.

---

## 13. E-Commerce Order Management Rules

Recommended local order states:

| Store order status | Meaning |
|---|---|
| PENDING_PAYMENT | Awaiting payment |
| PAYMENT_PROCESSING | Verification in progress |
| PAID | Authoritatively verified |
| PAYMENT_FAILED | Payment failed |
| PAYMENT_EXPIRED | Checkout expired |
| PAYMENT_CANCELLED | Checkout cancelled |
| REFUND_PENDING | Refund requested |
| REFUNDED | Refund completed and reconciled |

Important business rules:

1. Never fulfil an order based only on a redirect.
2. Never trust an amount submitted by the browser.
3. Verify every payment against the original order.
4. Handle duplicate webhooks safely.
5. Keep payment and order records linked.
6. Do not treat a customer-provided UTR as independent proof.
7. Reconcile unmatched bank credits manually.

---

## 14. Production Testing Checklist

Before accepting real customer payments:

### Infrastructure

- [ ] Render deployment is healthy.
- [ ] Cloudflare Tunnel is connected.
- [ ] Checkout hostname works.
- [ ] Payment API hostname works.
- [ ] Admin hostname works.
- [ ] Gmail observer is connected.
- [ ] SQLite persistent storage is verified.
- [ ] HTTPS works on every public hostname.

### Payment flow

- [ ] Create a test order.
- [ ] Generate a payment session.
- [ ] Open the returned checkout URL.
- [ ] Complete a permitted low-value test transaction.
- [ ] Verify the actual bank credit.
- [ ] Confirm CouPI detects the credit.
- [ ] Confirm the payment reaches SUCCESS.
- [ ] Confirm the signed webhook reaches the store.
- [ ] Confirm the order becomes PAID exactly once.
- [ ] Confirm the customer receives an order confirmation.

### Failure scenarios

- [ ] Customer closes checkout.
- [ ] Customer does not pay.
- [ ] Payment expires.
- [ ] Duplicate webhook received.
- [ ] Invalid webhook signature received.
- [ ] Customer returns before payment verification.
- [ ] Bank observer disconnects.
- [ ] Render restarts during a pending transaction.

---

## 15. Security Requirements

- HTTPS everywhere.
- Strong admin password.
- Secure merchant credentials.
- HMAC webhook verification.
- Server-side order creation.
- Idempotency for payment creation.
- Idempotent webhook handling.
- Persistent payment records.
- Database backups.
- Rate limiting.
- Access controls for admin endpoints.
- Monitoring and alerting.
- No secrets in frontend JavaScript.

Do not expose the following:

- Cloudflare tunnel token.
- JWT secret.
- Encryption master key.
- Webhook secret.
- Admin password.
- Bank email password or OAuth refresh tokens.

---

## 16. Operational Notes

CouPI is a self-hosted UPI payment infrastructure project.

Its use does not automatically establish authorization to operate as
a regulated payment aggregator or guarantee compliance with applicable
bank, NPCI, RBI, tax, consumer-protection or data-protection requirements.

Before using this in a commercial e-commerce business, confirm the
permitted collection and reconciliation arrangement with your bank
and obtain appropriate legal/compliance advice.

Do not advertise a transaction as paid until the payment has been
authoritatively verified.

---

## 17. Official Project References

GitHub:

https://github.com/Shamiltk01/coupi-pg

API specification:

https://github.com/Shamiltk01/coupi-pg/blob/main/openapi.yaml

Environment template:

https://github.com/Shamiltk01/coupi-pg/blob/main/.env.example

Checkout:

https://pay.smtools.eu.cc

Payment API:

https://pay-api.smtools.eu.cc

Merchant Admin:

https://pay-admin.smtools.eu.cc

---

END OF COUPI PG E-COMMERCE GATEWAY DOCUMENT