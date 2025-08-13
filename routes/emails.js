var express = require('express');
var router = express.Router();
const { Resend } = require('resend');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * @swagger
 * /emails/send:
 *   post:
 *     summary: Send an email using Resend API
 *     description: Sends an email with support for HTML content, attachments, CC, BCC, and other email features
 *     tags: [Emails]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmailSendRequest'
 *     responses:
 *       200:
 *         description: Email sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 id: "email-id-123"
 *                 from: "noreply@yourdomain.com"
 *                 to: ["recipient@example.com"]
 *                 created_at: "2024-01-01T00:00:00Z"
 *               message: "Email sent successfully"
 *       400:
 *         description: Bad request - Missing required parameters or invalid email format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Missing required field: to"
 *       401:
 *         description: Unauthorized - Invalid API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Invalid API key"
 *       422:
 *         description: Unprocessable Entity - Email validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Invalid email address format"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Internal server error during email sending"
 */
router.post('/send', async function(req, res, next) {
  try {
    // Get API key from header
    const apiKey = req.headers['resend_api_key'];
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing resend_api_key in headers'
      });
    }

    // Extract email data from request body
    const { 
      from, 
      to, 
      subject, 
      html, 
      text, 
      cc, 
      bcc, 
      reply_to, 
      attachments,
      tags,
      headers
    } = req.body;

    // Validate required fields
    if (!from) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: from'
      });
    }

    if (!to || (Array.isArray(to) && to.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: to'
      });
    }

    if (!subject) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: subject'
      });
    }

    if (!html && !text) {
      return res.status(400).json({
        success: false,
        error: 'Either html or text content is required'
      });
    }

    // Email format validation function
    const isValidEmail = (email) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    };

    // Validate email addresses
    const validateEmailList = (emails, fieldName) => {
      if (!emails) return true;
      
      const emailList = Array.isArray(emails) ? emails : [emails];
      for (const email of emailList) {
        if (!isValidEmail(email)) {
          throw new Error(`Invalid email address in ${fieldName}: ${email}`);
        }
      }
      return true;
    };

    // Validate all email fields
    try {
      if (!isValidEmail(from)) {
        return res.status(422).json({
          success: false,
          error: `Invalid from email address: ${from}`
        });
      }

      validateEmailList(to, 'to');
      validateEmailList(cc, 'cc');
      validateEmailList(bcc, 'bcc');
      validateEmailList(reply_to, 'reply_to');
    } catch (validationError) {
      return res.status(422).json({
        success: false,
        error: validationError.message
      });
    }

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Prepare email data
    const emailData = {
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
    };

    // Add optional fields if provided
    if (html) emailData.html = html;
    if (text) emailData.text = text;
    if (cc) emailData.cc = Array.isArray(cc) ? cc : [cc];
    if (bcc) emailData.bcc = Array.isArray(bcc) ? bcc : [bcc];
    if (reply_to) emailData.reply_to = reply_to;
    if (attachments && Array.isArray(attachments)) emailData.attachments = attachments;
    if (tags && Array.isArray(tags)) emailData.tags = tags;
    if (headers && typeof headers === 'object') emailData.headers = headers;

    // Send email using Resend API
    const result = await resend.emails.send(emailData);

    // Return success response
    res.json({
      success: true,
      data: result,
      message: 'Email sent successfully'
    });

  } catch (error) {
    console.error('Email sending error:', error);
    
    // Handle different types of errors
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    if (error.message && (error.message.includes('email') || error.message.includes('validation'))) {
      return res.status(422).json({
        success: false,
        error: error.message
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      error: 'Internal server error during email sending',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /emails/batch:
 *   post:
 *     summary: Send multiple emails in batch using Resend API
 *     description: Sends multiple emails at once for improved performance
 *     tags: [Emails]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmailBatchRequest'
 *     responses:
 *       200:
 *         description: Batch emails sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 - id: "email-id-123"
 *                   from: "noreply@yourdomain.com"
 *                   to: ["recipient1@example.com"]
 *                 - id: "email-id-124"
 *                   from: "noreply@yourdomain.com"
 *                   to: ["recipient2@example.com"]
 *               message: "Batch emails sent successfully"
 *       400:
 *         description: Bad request - Missing required parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - Invalid API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/batch', async function(req, res, next) {
  try {
    // Get API key from header
    const apiKey = req.headers['resend_api_key'];
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing resend_api_key in headers'
      });
    }

    const { emails } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'emails array is required and must contain at least one email'
      });
    }

    // Validate each email in the batch
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      
      if (!email.from || !email.to || !email.subject || (!email.html && !email.text)) {
        return res.status(400).json({
          success: false,
          error: `Email at index ${i} is missing required fields (from, to, subject, and html/text)`
        });
      }
    }

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Send batch emails using Resend API
    const result = await resend.batch.send(emails);

    // Return success response
    res.json({
      success: true,
      data: result,
      message: 'Batch emails sent successfully'
    });

  } catch (error) {
    console.error('Batch email sending error:', error);
    
    // Handle different types of errors
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      error: 'Internal server error during batch email sending',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /emails/webhook:
 *   post:
 *     summary: Handle incoming webhooks from Resend
 *     description: Receives and processes webhook events from Resend including delivery status, bounces, complaints, and inbound emails
 *     tags: [Emails]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResendWebhookEvent'
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Webhook processed successfully"
 *       400:
 *         description: Bad request - Invalid webhook payload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Invalid webhook payload"
 *       401:
 *         description: Unauthorized - Invalid webhook signature
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Invalid webhook signature"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// Custom middleware to capture raw body for webhook signature verification
const captureRawBody = (req, res, next) => {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', chunk => {
    data += chunk;
  });
  req.on('end', () => {
    req.rawBody = data;
    try {
      req.body = JSON.parse(data);
    } catch (err) {
      req.body = {};
    }
    next();
  });
};

router.post('/webhook', captureRawBody, async function(req, res, next) {
  try {
    // Get webhook signature from headers
    const signature = req.headers['resend-signature'] || req.headers['x-resend-signature'];
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    
    // Verify webhook signature if secret is configured
    if (webhookSecret && signature) {
      const body = req.rawBody || JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body, 'utf8')
        .digest('hex');
      
      const receivedSignature = signature.replace('sha256=', '');
      
      if (expectedSignature !== receivedSignature) {
        console.error('Webhook signature verification failed');
        console.error('Expected:', expectedSignature);
        console.error('Received:', receivedSignature);
        return res.status(401).json({
          success: false,
          error: 'Invalid webhook signature'
        });
      }
    }

    // Use the parsed webhook data
    const webhookData = req.body;

    if (!webhookData || typeof webhookData !== 'object') {
      console.error('Invalid webhook payload:', webhookData);
      return res.status(400).json({
        success: false,
        error: 'Invalid JSON payload'
      });
    }

    // Extract event details
    const { type, data, created_at } = webhookData;

    if (!type || !data) {
      return res.status(400).json({
        success: false,
        error: 'Missing required webhook fields: type and data'
      });
    }

    console.log(`Received webhook event: ${type} at ${created_at}`);

    // Process different webhook event types
    switch (type) {
      case 'email.sent':
        await handleEmailSent(data);
        break;
      
      case 'email.delivered':
        await handleEmailDelivered(data);
        break;
      
      case 'email.delivery_delayed':
        await handleEmailDelayed(data);
        break;
      
      case 'email.complained':
        await handleEmailComplained(data);
        break;
      
      case 'email.bounced':
        await handleEmailBounced(data);
        break;
      
      case 'email.opened':
        await handleEmailOpened(data);
        break;
      
      case 'email.clicked':
        await handleEmailClicked(data);
        break;
      
      case 'contact.created':
        await handleContactCreated(data);
        break;
      
      case 'contact.updated':
        await handleContactUpdated(data);
        break;
      
      case 'contact.deleted':
        await handleContactDeleted(data);
        break;
      
      default:
        console.log(`Unhandled webhook event type: ${type}`);
        // Still return success for unknown event types to avoid retries
        break;
    }

    // Log successful webhook processing
    console.log(`Successfully processed webhook event: ${type}`);

    // Forward webhook data to external application
    await forwardWebhookToApp(webhookData);

    // Return success response
    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error during webhook processing',
      details: error.message
    });
  }
});

// Webhook event handlers
async function handleEmailSent(data) {
  console.log('Email sent:', {
    emailId: data.email_id,
    to: data.to,
    from: data.from,
    subject: data.subject,
    createdAt: data.created_at
  });
  
  // Add your custom logic here:
  // - Update database with email status
  // - Send notifications
  // - Update analytics
}

async function handleEmailDelivered(data) {
  console.log('Email delivered:', {
    emailId: data.email_id,
    to: data.to,
    deliveredAt: data.created_at
  });
  
  // Add your custom logic here:
  // - Mark email as delivered in database
  // - Update delivery analytics
  // - Trigger follow-up actions
}

async function handleEmailDelayed(data) {
  console.log('Email delivery delayed:', {
    emailId: data.email_id,
    to: data.to,
    reason: data.reason,
    delayedAt: data.created_at
  });
  
  // Add your custom logic here:
  // - Log delivery delays
  // - Alert if delays exceed threshold
  // - Update delivery metrics
}

async function handleEmailComplained(data) {
  console.log('Email complaint received:', {
    emailId: data.email_id,
    to: data.to,
    complainedAt: data.created_at
  });
  
  // Add your custom logic here:
  // - Add email to suppression list
  // - Update sender reputation metrics
  // - Review email content for compliance
}

async function handleEmailBounced(data) {
  console.log('Email bounced:', {
    emailId: data.email_id,
    to: data.to,
    bounceType: data.bounce_type,
    reason: data.reason,
    bouncedAt: data.created_at
  });
  
  // Add your custom logic here:
  // - Handle hard vs soft bounces differently
  // - Update email validity status
  // - Remove invalid emails from lists
}

async function handleEmailOpened(data) {
  console.log('Email opened:', {
    emailId: data.email_id,
    to: data.to,
    openedAt: data.created_at,
    userAgent: data.user_agent,
    ip: data.ip
  });
  
  // Add your custom logic here:
  // - Track engagement metrics
  // - Update user activity
  // - Trigger engagement-based workflows
}

async function handleEmailClicked(data) {
  console.log('Email link clicked:', {
    emailId: data.email_id,
    to: data.to,
    link: data.link,
    clickedAt: data.created_at,
    userAgent: data.user_agent,
    ip: data.ip
  });
  
  // Add your custom logic here:
  // - Track click-through rates
  // - Update user engagement scores
  // - Trigger conversion tracking
}

async function handleContactCreated(data) {
  console.log('Contact created:', {
    contactId: data.id,
    email: data.email,
    createdAt: data.created_at
  });
  
  // Add your custom logic here:
  // - Sync with CRM
  // - Send welcome email
  // - Update contact lists
}

async function handleContactUpdated(data) {
  console.log('Contact updated:', {
    contactId: data.id,
    email: data.email,
    updatedAt: data.created_at
  });
  
  // Add your custom logic here:
  // - Sync updated contact data
  // - Update segmentation
  // - Trigger data validation
}

async function handleContactDeleted(data) {
  console.log('Contact deleted:', {
    contactId: data.id,
    email: data.email,
    deletedAt: data.created_at
  });
  
  // Add your custom logic here:
  // - Remove from all lists
  // - Update analytics
  // - Comply with data retention policies
}

// Function to forward webhook data to external application
async function forwardWebhookToApp(webhookData) {
  const appWebhookUrl = process.env.APP_WEBHOOK_URL;
  
  if (!appWebhookUrl) {
    console.log('APP_WEBHOOK_URL not configured, skipping webhook forwarding');
    return;
  }

  try {
    console.log(`Forwarding webhook to: ${appWebhookUrl}`);
    
    const url = new URL(appWebhookUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const postData = JSON.stringify(webhookData);
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'omni-email-webhook-forwarder/1.0'
      },
      timeout: 10000 // 10 second timeout
    };

    const req = client.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`Webhook forwarded successfully. Status: ${res.statusCode}`);
        } else {
          console.error(`Webhook forwarding failed. Status: ${res.statusCode}, Response: ${responseData}`);
        }
      });
    });

    req.on('error', (error) => {
      console.error('Error forwarding webhook:', error.message);
    });

    req.on('timeout', () => {
      console.error('Webhook forwarding timed out');
      req.destroy();
    });

    req.write(postData);
    req.end();

  } catch (error) {
    console.error('Error setting up webhook forwarding:', error.message);
  }
}

module.exports = router;
