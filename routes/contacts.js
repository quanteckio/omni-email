var express = require('express');
var router = express.Router();
const { Resend } = require('resend');

/**
 * @swagger
 * /contacts:
 *   post:
 *     summary: Create a new contact
 *     description: Creates a new contact in Resend
 *     tags: [Contacts]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateContactRequest'
 *     responses:
 *       201:
 *         description: Contact created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 id: "479e3145-dd38-476b-932c-529ceb705947"
 *                 email: "user@example.com"
 *                 first_name: "John"
 *                 last_name: "Doe"
 *                 created_at: "2023-04-26T20:21:26.347412+00:00"
 *                 unsubscribed: false
 *               message: "Contact created successfully"
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
 *         description: Conflict - Contact already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Contact already exists"
 *       422:
 *         description: Unprocessable Entity - Invalid email format
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
 *               error: "Internal server error during contact creation"
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

    // Extract contact data from request body
    const { 
      email, 
      first_name, 
      last_name, 
      audience_id 
    } = req.body;

    // Validate required fields
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Email format validation
    const isValidEmail = (email) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    };

    if (!isValidEmail(email)) {
      return res.status(422).json({
        success: false,
        error: `Invalid email address format: ${email}`
      });
    }

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Prepare contact data
    const contactData = {
      email
    };

    // Add optional fields if provided
    if (first_name) contactData.first_name = first_name;
    if (last_name) contactData.last_name = last_name;
    if (audience_id) contactData.audience_id = audience_id;

    // Create contact using Resend API
    const result = await resend.contacts.create(contactData);

    // Return success response
    res.status(201).json({
      success: true,
      data: result,
      message: 'Contact created successfully'
    });

  } catch (error) {
    console.error('Contact creation error:', error);
    
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
        error: 'Contact already exists'
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
      error: 'Internal server error during contact creation',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /contacts:
 *   get:
 *     summary: List all contacts
 *     description: Retrieves a list of all contacts from Resend
 *     tags: [Contacts]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: audience_id
 *         schema:
 *           type: string
 *         description: Filter contacts by audience ID
 *         example: "78261eea-8f8b-4381-83c6-79fa7120f1cf"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of contacts to return (1-100)
 *         example: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of contacts to skip
 *         example: 0
 *     responses:
 *       200:
 *         description: Contacts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 object: "list"
 *                 data:
 *                   - id: "479e3145-dd38-476b-932c-529ceb705947"
 *                     email: "user@example.com"
 *                     first_name: "John"
 *                     last_name: "Doe"
 *                     created_at: "2023-04-26T20:21:26.347412+00:00"
 *                     unsubscribed: false
 *                   - id: "579e3145-dd38-476b-932c-529ceb705948"
 *                     email: "jane@example.com"
 *                     first_name: "Jane"
 *                     last_name: "Smith"
 *                     created_at: "2023-04-26T20:22:26.347412+00:00"
 *                     unsubscribed: false
 *               message: "Contacts retrieved successfully"
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
 *               error: "Internal server error during contacts retrieval"
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
    const { audience_id, limit, offset } = req.query;

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Prepare query parameters
    const queryParams = {};
    if (audience_id) queryParams.audience_id = audience_id;
    if (limit) queryParams.limit = parseInt(limit);
    if (offset) queryParams.offset = parseInt(offset);

    // Get contacts using Resend API
    const result = await resend.contacts.list(queryParams);

    // Return success response
    res.json({
      success: true,
      data: result,
      message: 'Contacts retrieved successfully'
    });

  } catch (error) {
    console.error('Contacts retrieval error:', error);
    
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
      error: 'Internal server error during contacts retrieval',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /contacts/{contactId}:
 *   get:
 *     summary: Get a contact by ID
 *     description: Retrieves a specific contact from Resend by its ID
 *     tags: [Contacts]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the contact
 *         example: "479e3145-dd38-476b-932c-529ceb705947"
 *     responses:
 *       200:
 *         description: Contact retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 id: "479e3145-dd38-476b-932c-529ceb705947"
 *                 email: "user@example.com"
 *                 first_name: "John"
 *                 last_name: "Doe"
 *                 created_at: "2023-04-26T20:21:26.347412+00:00"
 *                 unsubscribed: false
 *               message: "Contact retrieved successfully"
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
 *         description: Contact not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Contact not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Internal server error during contact retrieval"
 */
router.get('/:contactId', async function(req, res, next) {
  try {
    // Get API key from header
    const apiKey = req.headers['resend_api_key'];
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing resend_api_key in headers'
      });
    }

    // Get contact ID from URL parameters
    const { contactId } = req.params;

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Get contact using Resend API
    const result = await resend.contacts.get(contactId);

    // Return success response
    res.json({
      success: true,
      data: result,
      message: 'Contact retrieved successfully'
    });

  } catch (error) {
    console.error('Contact retrieval error:', error);
    
    // Handle different types of errors
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    if (error.message && (error.message.includes('contact') || error.message.includes('not found'))) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      error: 'Internal server error during contact retrieval',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /contacts/{contactId}:
 *   put:
 *     summary: Update a contact
 *     description: Updates an existing contact in Resend
 *     tags: [Contacts]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the contact to update
 *         example: "479e3145-dd38-476b-932c-529ceb705947"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateContactRequest'
 *     responses:
 *       200:
 *         description: Contact updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 id: "479e3145-dd38-476b-932c-529ceb705947"
 *                 email: "user@example.com"
 *                 first_name: "John"
 *                 last_name: "Doe"
 *                 updated_at: "2023-04-26T20:21:26.347412+00:00"
 *                 unsubscribed: false
 *               message: "Contact updated successfully"
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
 *         description: Contact not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Contact not found"
 *       422:
 *         description: Unprocessable Entity - Invalid email format
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
 *               error: "Internal server error during contact update"
 */
router.put('/:contactId', async function(req, res, next) {
  try {
    // Get API key from header
    const apiKey = req.headers['resend_api_key'];
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing resend_api_key in headers'
      });
    }

    // Get contact ID from URL parameters
    const { contactId } = req.params;

    // Extract contact data from request body
    const { 
      email, 
      first_name, 
      last_name, 
      unsubscribed 
    } = req.body;

    // Email format validation if email is provided
    if (email) {
      const isValidEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      };

      if (!isValidEmail(email)) {
        return res.status(422).json({
          success: false,
          error: `Invalid email address format: ${email}`
        });
      }
    }

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Prepare update data (only include provided fields)
    const updateData = {};
    if (email !== undefined) updateData.email = email;
    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined) updateData.last_name = last_name;
    if (unsubscribed !== undefined) updateData.unsubscribed = unsubscribed;

    // Check if there's actually data to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No update data provided'
      });
    }

    // Update contact using Resend API
    const result = await resend.contacts.update(contactId, updateData);

    // Return success response
    res.json({
      success: true,
      data: result,
      message: 'Contact updated successfully'
    });

  } catch (error) {
    console.error('Contact update error:', error);
    
    // Handle different types of errors
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    if (error.message && (error.message.includes('contact') || error.message.includes('not found'))) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
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
      error: 'Internal server error during contact update',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /contacts/{contactId}:
 *   delete:
 *     summary: Delete a contact
 *     description: Remove an existing contact from Resend
 *     tags: [Contacts]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the contact to delete
 *         example: "479e3145-dd38-476b-932c-529ceb705947"
 *     responses:
 *       200:
 *         description: Contact deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               data: 
 *                 object: "contact"
 *                 id: "479e3145-dd38-476b-932c-529ceb705947"
 *                 deleted: true
 *               message: "Contact deleted successfully"
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
 *         description: Contact not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Contact not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               error: "Internal server error during contact deletion"
 */
router.delete('/:contactId', async function(req, res, next) {
  try {
    // Get API key from header
    const apiKey = req.headers['resend_api_key'];
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing resend_api_key in headers'
      });
    }

    // Get contact ID from URL parameters
    const { contactId } = req.params;

    // Initialize Resend with API key
    const resend = new Resend(apiKey);

    // Delete contact using Resend API
    const result = await resend.contacts.remove(contactId);

    // Return success response
    res.json({
      success: true,
      data: result,
      message: 'Contact deleted successfully'
    });

  } catch (error) {
    console.error('Contact deletion error:', error);
    
    // Handle different types of errors
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    if (error.message && (error.message.includes('contact') || error.message.includes('not found'))) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      error: 'Internal server error during contact deletion',
      details: error.message
    });
  }
});

module.exports = router;
