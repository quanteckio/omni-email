var express = require('express');
var router = express.Router();
const { Resend } = require('resend');

/**
 * @swagger
 * /audiences:
 *   post:
 *     summary: Create a new audience
 *     description: Creates a new audience in Resend
 *     tags: [Audiences]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateAudienceRequest'
 *     responses:
 *       201:
 *         description: Audience created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 id: "78261eea-8f8b-4381-83c6-79fa7120f1cf"
 *                 name: "Newsletter Subscribers"
 *                 created_at: "2023-04-26T20:21:26.347412+00:00"
 *               message: "Audience created successfully"
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
 *         description: Conflict - Audience already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Audience already exists"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Internal server error during audience creation"
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

    // Extract audience data from request body
    const { name } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Audience name is required'
      });
    }

    // Validate name length and format
    if (name.length < 1 || name.length > 255) {
      return res.status(400).json({
        success: false,
        error: 'Audience name must be between 1 and 255 characters'
      });
    }

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Create audience using Resend API
    const result = await resend.audiences.create({
      name: name
    });

    // Return success response
    res.status(201).json({
      success: true,
      data: result,
      message: 'Audience created successfully'
    });

  } catch (error) {
    console.error('Audience creation error:', error);
    
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
        error: 'Audience already exists'
      });
    }

    if (error.message && error.message.includes('validation')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      error: 'Internal server error during audience creation',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /audiences:
 *   get:
 *     summary: List all audiences
 *     description: Retrieves a list of all audiences from Resend
 *     tags: [Audiences]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Audiences retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 object: "list"
 *                 data:
 *                   - id: "78261eea-8f8b-4381-83c6-79fa7120f1cf"
 *                     name: "Newsletter Subscribers"
 *                     created_at: "2023-04-26T20:21:26.347412+00:00"
 *                   - id: "89372ffb-9g9c-5492-94d7-80gb8231f2dg"
 *                     name: "Product Updates"
 *                     created_at: "2023-04-26T20:22:26.347412+00:00"
 *               message: "Audiences retrieved successfully"
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
 *               error: "Internal server error during audiences retrieval"
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

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Get audiences using Resend API
    const result = await resend.audiences.list();

    // Return success response
    res.json({
      success: true,
      data: result,
      message: 'Audiences retrieved successfully'
    });

  } catch (error) {
    console.error('Audiences retrieval error:', error);
    
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
      error: 'Internal server error during audiences retrieval',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /audiences/{audienceId}:
 *   get:
 *     summary: Get an audience by ID
 *     description: Retrieves a specific audience from Resend by its ID
 *     tags: [Audiences]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: audienceId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the audience
 *         example: "78261eea-8f8b-4381-83c6-79fa7120f1cf"
 *     responses:
 *       200:
 *         description: Audience retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 id: "78261eea-8f8b-4381-83c6-79fa7120f1cf"
 *                 name: "Newsletter Subscribers"
 *                 created_at: "2023-04-26T20:21:26.347412+00:00"
 *               message: "Audience retrieved successfully"
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
 *         description: Audience not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Audience not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Internal server error during audience retrieval"
 */
router.get('/:audienceId', async function(req, res, next) {
  try {
    // Get API key from header
    const apiKey = req.headers['resend_api_key'];
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing resend_api_key in headers'
      });
    }

    // Get audience ID from URL parameters
    const { audienceId } = req.params;

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Get audience using Resend API
    const result = await resend.audiences.get(audienceId);

    // Return success response
    res.json({
      success: true,
      data: result,
      message: 'Audience retrieved successfully'
    });

  } catch (error) {
    console.error('Audience retrieval error:', error);
    
    // Handle different types of errors
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    if (error.message && (error.message.includes('audience') || error.message.includes('not found'))) {
      return res.status(404).json({
        success: false,
        error: 'Audience not found'
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      error: 'Internal server error during audience retrieval',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /audiences/{audienceId}:
 *   delete:
 *     summary: Delete an audience
 *     description: Remove an existing audience from Resend
 *     tags: [Audiences]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: audienceId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the audience to delete
 *         example: "78261eea-8f8b-4381-83c6-79fa7120f1cf"
 *     responses:
 *       200:
 *         description: Audience deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 object: "audience"
 *                 id: "78261eea-8f8b-4381-83c6-79fa7120f1cf"
 *                 deleted: true
 *               message: "Audience deleted successfully"
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
 *         description: Audience not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Audience not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Internal server error during audience deletion"
 */
router.delete('/:audienceId', async function(req, res, next) {
  try {
    // Get API key from header
    const apiKey = req.headers['resend_api_key'];
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing resend_api_key in headers'
      });
    }

    // Get audience ID from URL parameters
    const { audienceId } = req.params;

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Delete audience using Resend API
    const result = await resend.audiences.remove(audienceId);

    // Return success response
    res.json({
      success: true,
      data: result,
      message: 'Audience deleted successfully'
    });

  } catch (error) {
    console.error('Audience deletion error:', error);
    
    // Handle different types of errors
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    if (error.message && (error.message.includes('audience') || error.message.includes('not found'))) {
      return res.status(404).json({
        success: false,
        error: 'Audience not found'
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      error: 'Internal server error during audience deletion',
      details: error.message
    });
  }
});

module.exports = router;
