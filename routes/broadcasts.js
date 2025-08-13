var express = require('express');
var router = express.Router();
const { Resend } = require('resend');

/**
 * @swagger
 * /broadcasts:
 *   post:
 *     summary: Create and send a new broadcast
 *     description: Creates and sends a new broadcast email to an audience using Resend
 *     tags: [Broadcasts]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateBroadcastRequest'
 *     responses:
 *       201:
 *         description: Broadcast created and sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"
 *                 name: "Weekly Newsletter #47"
 *                 audience_id: "78261eea-8f8b-4381-83c6-79fa7120f1cf"
 *                 from: "newsletter@company.com"
 *                 subject: "Weekly Updates - March 2024"
 *                 created_at: "2023-04-26T20:21:26.347412+00:00"
 *                 status: "sent"
 *               message: "Broadcast created and sent successfully"
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
 *       422:
 *         description: Unprocessable Entity - Invalid email format or data
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
 *               error: "Internal server error during broadcast creation"
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

    // Extract broadcast data from request body
    const { 
      name,
      audience_id,
      from, 
      subject, 
      html, 
      text, 
      reply_to,
      attachments,
      tags,
      headers
    } = req.body;

    // Validate required fields
    if (!audience_id) {
      return res.status(400).json({
        success: false,
        error: 'audience_id is required'
      });
    }

    if (!from) {
      return res.status(400).json({
        success: false,
        error: 'from email address is required'
      });
    }

    if (!subject) {
      return res.status(400).json({
        success: false,
        error: 'subject is required'
      });
    }

    if (!html && !text) {
      return res.status(400).json({
        success: false,
        error: 'Either html or text content is required'
      });
    }

    // Email format validation
    const isValidEmail = (email) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    };

    if (!isValidEmail(from)) {
      return res.status(422).json({
        success: false,
        error: `Invalid from email address: ${from}`
      });
    }

    if (reply_to && !isValidEmail(reply_to)) {
      return res.status(422).json({
        success: false,
        error: `Invalid reply_to email address: ${reply_to}`
      });
    }

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Prepare broadcast data
    const broadcastData = {
      audience_id,
      from,
      subject
    };

    // Add optional fields if provided
    if (name) broadcastData.name = name;
    if (html) broadcastData.html = html;
    if (text) broadcastData.text = text;
    if (reply_to) broadcastData.reply_to = reply_to;
    if (attachments && Array.isArray(attachments)) broadcastData.attachments = attachments;
    if (tags && Array.isArray(tags)) broadcastData.tags = tags;
    if (headers && typeof headers === 'object') broadcastData.headers = headers;

    // Create and send broadcast using Resend API
    const result = await resend.broadcasts.send(broadcastData);

    // Return success response
    res.status(201).json({
      success: true,
      data: result,
      message: 'Broadcast created and sent successfully'
    });

  } catch (error) {
    console.error('Broadcast creation error:', error);
    
    // Handle different types of errors
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    if (error.message && (error.message.includes('email') || error.message.includes('validation') || error.message.includes('audience'))) {
      return res.status(422).json({
        success: false,
        error: error.message
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      error: 'Internal server error during broadcast creation',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /broadcasts:
 *   get:
 *     summary: List all broadcasts
 *     description: Retrieves a list of all broadcasts from Resend
 *     tags: [Broadcasts]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of broadcasts to return (1-100)
 *         example: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of broadcasts to skip
 *         example: 0
 *     responses:
 *       200:
 *         description: Broadcasts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 object: "list"
 *                 data:
 *                   - id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"
 *                     name: "Weekly Newsletter #47"
 *                     audience_id: "78261eea-8f8b-4381-83c6-79fa7120f1cf"
 *                     from: "newsletter@company.com"
 *                     subject: "Weekly Updates - March 2024"
 *                     created_at: "2023-04-26T20:21:26.347412+00:00"
 *                     status: "sent"
 *                     sent_count: 1250
 *                   - id: "59b4888d-1df2-5fb7-bc79-bged7ed3f805"
 *                     name: "Product Launch Announcement"
 *                     audience_id: "89372ffb-9g9c-5492-94d7-80gb8231f2dg"
 *                     from: "announcements@company.com"
 *                     subject: "Introducing Our New Product!"
 *                     created_at: "2023-04-25T15:30:12.123456+00:00"
 *                     status: "sent"
 *                     sent_count: 2100
 *               message: "Broadcasts retrieved successfully"
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
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Internal server error during broadcasts retrieval"
 */
router.get('/', async function(req, res, next) {
  try {
    // Get API key from header
    const apiKey = req.headers['resend_api_key'];
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing resend_api_key in headers'
      });
    }

    // Get query parameters
    const { limit, offset } = req.query;

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Prepare query parameters
    const queryParams = {};
    if (limit) queryParams.limit = parseInt(limit);
    if (offset) queryParams.offset = parseInt(offset);

    // Get broadcasts using Resend API
    const result = await resend.broadcasts.list(queryParams);

    // Return success response
    res.json({
      success: true,
      data: result,
      message: 'Broadcasts retrieved successfully'
    });

  } catch (error) {
    console.error('Broadcasts retrieval error:', error);
    
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
      error: 'Internal server error during broadcasts retrieval',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /broadcasts/{broadcastId}:
 *   get:
 *     summary: Get a broadcast by ID
 *     description: Retrieves a specific broadcast from Resend by its ID
 *     tags: [Broadcasts]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: broadcastId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the broadcast
 *         example: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"
 *     responses:
 *       200:
 *         description: Broadcast retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"
 *                 name: "Weekly Newsletter #47"
 *                 audience_id: "78261eea-8f8b-4381-83c6-79fa7120f1cf"
 *                 from: "newsletter@company.com"
 *                 subject: "Weekly Updates - March 2024"
 *                 html: "<h1>Weekly Updates</h1><p>Here are this week's highlights...</p>"
 *                 created_at: "2023-04-26T20:21:26.347412+00:00"
 *                 sent_at: "2023-04-26T20:21:30.123456+00:00"
 *                 status: "sent"
 *                 sent_count: 1250
 *                 open_count: 875
 *                 click_count: 123
 *               message: "Broadcast retrieved successfully"
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
 *         description: Broadcast not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Broadcast not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Internal server error during broadcast retrieval"
 */
router.get('/:broadcastId', async function(req, res, next) {
  try {
    // Get API key from header
    const apiKey = req.headers['resend_api_key'];
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing resend_api_key in headers'
      });
    }

    // Get broadcast ID from URL parameters
    const { broadcastId } = req.params;

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Get broadcast using Resend API
    const result = await resend.broadcasts.get(broadcastId);

    // Return success response
    res.json({
      success: true,
      data: result,
      message: 'Broadcast retrieved successfully'
    });

  } catch (error) {
    console.error('Broadcast retrieval error:', error);
    
    // Handle different types of errors
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    if (error.message && (error.message.includes('broadcast') || error.message.includes('not found'))) {
      return res.status(404).json({
        success: false,
        error: 'Broadcast not found'
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      error: 'Internal server error during broadcast retrieval',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /broadcasts/{broadcastId}:
 *   delete:
 *     summary: Delete a broadcast
 *     description: Remove an existing broadcast from Resend
 *     tags: [Broadcasts]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: broadcastId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the broadcast to delete
 *         example: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"
 *     responses:
 *       200:
 *         description: Broadcast deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 object: "broadcast"
 *                 id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"
 *                 deleted: true
 *               message: "Broadcast deleted successfully"
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
 *         description: Broadcast not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Broadcast not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Internal server error during broadcast deletion"
 */
router.delete('/:broadcastId', async function(req, res, next) {
  try {
    // Get API key from header
    const apiKey = req.headers['resend_api_key'];
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing resend_api_key in headers'
      });
    }

    // Get broadcast ID from URL parameters
    const { broadcastId } = req.params;

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Delete broadcast using Resend API
    const result = await resend.broadcasts.remove(broadcastId);

    // Return success response
    res.json({
      success: true,
      data: result,
      message: 'Broadcast deleted successfully'
    });

  } catch (error) {
    console.error('Broadcast deletion error:', error);
    
    // Handle different types of errors
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    if (error.message && (error.message.includes('broadcast') || error.message.includes('not found'))) {
      return res.status(404).json({
        success: false,
        error: 'Broadcast not found'
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      error: 'Internal server error during broadcast deletion',
      details: error.message
    });
  }
});

module.exports = router;
