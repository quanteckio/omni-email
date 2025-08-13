var express = require('express');
var router = express.Router();
const { Resend } = require('resend');

/**
 * @swagger
 * /domains:
 *   post:
 *     summary: Create a new domain
 *     description: Creates a new domain in Resend for email sending
 *     tags: [Domains]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateDomainRequest'
 *     responses:
 *       201:
 *         description: Domain created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 id: "4dd369bc-aa82-4ff3-97de-514ae3000ee0"
 *                 name: "example.com"
 *                 created_at: "2023-03-28T17:12:02.059593+00:00"
 *                 status: "not_started"
 *                 records:
 *                   - record: "SPF"
 *                     name: "send"
 *                     type: "MX"
 *                     ttl: "Auto"
 *                     status: "not_started"
 *                     value: "feedback-smtp.us-east-1.amazonses.com"
 *                     priority: 10
 *                   - record: "SPF"
 *                     name: "send"
 *                     value: "v=spf1 include:amazonses.com ~all"
 *                     type: "TXT"
 *                     ttl: "Auto"
 *                     status: "not_started"
 *                   - record: "DKIM"
 *                     name: "nhapbbryle57yxg3fbjytyodgbt2kyyg._domainkey"
 *                     value: "nhapbbryle57yxg3fbjytyodgbt2kyyg.dkim.amazonses.com."
 *                     type: "CNAME"
 *                     status: "not_started"
 *                     ttl: "Auto"
 *                 region: "us-east-1"
 *               message: "Domain created successfully"
 *       400:
 *         description: Bad request - Missing required parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Missing resend_api_key in headers"
 *       401:
 *         description: Unauthorized - Invalid API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Invalid API key"
 *       409:
 *         description: Conflict - Domain already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Domain already exists"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Internal server error during domain creation"
 */
router.post('/', async function(req, res, next) {
  try {
    // Get API key from header
    const apiKey = req.headers['resend_api_key'];
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing resend_api_key in headers'
      });
    }

    // Get domain name from request body
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Domain name is required in request body'
      });
    }

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Create domain using Resend API
    const result = await resend.domains.add({
      name: name
    });

    // Return success response
    res.status(201).json({
      success: true,
      data: result,
      message: 'Domain created successfully'
    });

  } catch (error) {
    console.error('Domain creation error:', error);
    
    // Handle different types of errors
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    if (error.message && (error.message.includes('already exists') || error.message.includes('duplicate'))) {
      return res.status(409).json({
        success: false,
        error: 'Domain already exists'
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      error: 'Internal server error during domain creation',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /domains/verify:
 *   post:
 *     summary: Verify a domain using Resend API
 *     description: Initiates domain verification process through Resend's domain verification service
 *     tags: [Domains]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DomainVerificationRequest'
 *     responses:
 *       200:
 *         description: Domain verification initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: {}
 *               message: "Domain verification initiated successfully"
 *       400:
 *         description: Bad request - Missing required parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Missing resend_api_key in headers"
 *       401:
 *         description: Unauthorized - Invalid API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Invalid API key"
 *       404:
 *         description: Domain not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Domain not found or invalid"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Internal server error during domain verification"
 */
router.post('/verify', async function(req, res, next) {
  try {
    // Get API key from header
    const apiKey = req.headers['resend_api_key'];
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing resend_api_key in headers'
      });
    }

    // Get domain from request body
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'Domain is required in request body'
      });
    }

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Verify domain using Resend API
    const result = await resend.domains.verify({
      id: domain
    });

    // Return success response
    res.json({
      success: true,
      data: result,
      message: 'Domain verification initiated successfully'
    });

  } catch (error) {
    console.error('Domain verification error:', error);
    
    // Handle different types of errors
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    if (error.message && error.message.includes('domain')) {
      return res.status(404).json({
        success: false,
        error: 'Domain not found or invalid'
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      error: 'Internal server error during domain verification',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /domains/status/{domainId}:
 *   get:
 *     summary: Get domain verification status
 *     description: Retrieves the current verification status of a domain from Resend
 *     tags: [Domains]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: domainId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the domain
 *         example: "your-domain-id"
 *     responses:
 *       200:
 *         description: Domain status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 object: "domain"
 *                 id: "d91cd9bd-1176-453e-8fc1-35364d380206"
 *                 name: "example.com"
 *                 status: "not_started"
 *                 created_at: "2023-04-26T20:21:26.347412+00:00"
 *                 region: "us-east-1"
 *                 records:
 *                   - record: "SPF"
 *                     name: "send"
 *                     type: "MX"
 *                     ttl: "Auto"
 *                     status: "not_started"
 *                     value: "feedback-smtp.us-east-1.amazonses.com"
 *                     priority: 10
 *                   - record: "SPF"
 *                     name: "send"
 *                     value: "v=spf1 include:amazonses.com ~all"
 *                     type: "TXT"
 *                     ttl: "Auto"
 *                     status: "not_started"
 *                   - record: "DKIM"
 *                     name: "resend._domainkey"
 *                     value: "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDsc4Lh8xilsngyKEgN2S84+21gn+x6SEXtjWvPiAAmnmggr5FWG42WnqczpzQ/mNblqHz4CDwUum6LtY6SdoOlDmrhvp5khA3cd661W9FlK3yp7+jVACQElS7d9O6jv8VsBbVg4COess3gyLE5RyxqF1vYsrEXqyM8TBz1n5AGkQIDAQA2"
 *                     type: "TXT"
 *                     status: "not_started"
 *                     ttl: "Auto"
 *               message: "Domain status retrieved successfully"
 *       400:
 *         description: Bad request - Missing API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Missing resend_api_key in headers"
 *       401:
 *         description: Unauthorized - Invalid API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Invalid API key"
 *       404:
 *         description: Domain not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Domain not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Internal server error during domain status check"
 */
router.get('/status/:domainId', async function(req, res, next) {
  try {
    // Get API key from header
    const apiKey = req.headers['resend_api_key'];
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing resend_api_key in headers'
      });
    }

    // Get domain ID from URL parameters
    const { domainId } = req.params;

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Get domain status using Resend API
    const result = await resend.domains.get(domainId);

    // Return success response
    res.json({
      success: true,
      data: result,
      message: 'Domain status retrieved successfully'
    });

  } catch (error) {
    console.error('Domain status error:', error);
    
    // Handle different types of errors
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    if (error.message && error.message.includes('domain')) {
      return res.status(404).json({
        success: false,
        error: 'Domain not found'
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      error: 'Internal server error during domain status check',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /domains/{domainId}:
 *   delete:
 *     summary: Delete a domain
 *     description: Remove an existing domain from Resend
 *     tags: [Domains]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: domainId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the domain to delete
 *         example: "d91cd9bd-1176-453e-8fc1-35364d380206"
 *     responses:
 *       200:
 *         description: Domain deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 object: "domain"
 *                 id: "d91cd9bd-1176-453e-8fc1-35364d380206"
 *                 deleted: true
 *               message: "Domain deleted successfully"
 *       400:
 *         description: Bad request - Missing API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Missing resend_api_key in headers"
 *       401:
 *         description: Unauthorized - Invalid API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Invalid API key"
 *       404:
 *         description: Domain not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Domain not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Internal server error during domain deletion"
 */
router.delete('/:domainId', async function(req, res, next) {
  try {
    // Get API key from header
    const apiKey = req.headers['resend_api_key'];
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing resend_api_key in headers'
      });
    }

    // Get domain ID from URL parameters
    const { domainId } = req.params;

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Delete domain using Resend API
    const result = await resend.domains.remove(domainId);

    // Return success response
    res.json({
      success: true,
      data: result,
      message: 'Domain deleted successfully'
    });

  } catch (error) {
    console.error('Domain deletion error:', error);
    
    // Handle different types of errors
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    if (error.message && error.message.includes('domain')) {
      return res.status(404).json({
        success: false,
        error: 'Domain not found'
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      error: 'Internal server error during domain deletion',
      details: error.message
    });
  }
});

module.exports = router;
