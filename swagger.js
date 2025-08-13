const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Omni Email API',
      version: '1.0.0',
      description: 'API documentation for Omni Email service with Resend integration',
      contact: {
        name: 'API Support',
        email: 'support@omnienmail.com'
      }
    },
    tags: [
      {
        name: 'Domains',
        description: 'Domain verification and management endpoints using Resend API'
      },
      {
        name: 'Emails',
        description: 'Email sending and management endpoints using Resend API'
      },
      {
        name: 'Contacts',
        description: 'Contact management endpoints using Resend API'
      },
      {
        name: 'Audiences',
        description: 'Audience management endpoints using Resend API'
      },
      {
        name: 'Broadcasts',
        description: 'Broadcast email management endpoints using Resend API'
      }
    ],
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'resend_api_key',
          description: 'Resend API key for authentication'
        }
      },
      schemas: {
        CreateDomainRequest: {
          type: 'object',
          required: ['name'],
          properties: {
            name: {
              type: 'string',
              description: 'The domain name to add',
              example: 'example.com'
            }
          }
        },
        DomainVerificationRequest: {
          type: 'object',
          required: ['domain'],
          properties: {
            domain: {
              type: 'string',
              description: 'The domain ID to verify',
              example: 'your-domain-id'
            }
          }
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'object',
              description: 'Response data from the API'
            },
            message: {
              type: 'string',
              description: 'Success message'
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'string',
              description: 'Error message'
            },
            details: {
              type: 'string',
              description: 'Additional error details'
            }
          }
        },
        EmailSendRequest: {
          type: 'object',
          required: ['from', 'to', 'subject'],
          properties: {
            from: {
              type: 'string',
              format: 'email',
              description: 'Sender email address',
              example: 'noreply@yourdomain.com'
            },
            to: {
              oneOf: [
                {
                  type: 'string',
                  format: 'email'
                },
                {
                  type: 'array',
                  items: {
                    type: 'string',
                    format: 'email'
                  }
                }
              ],
              description: 'Recipient email address(es)',
              example: ['recipient@example.com']
            },
            subject: {
              type: 'string',
              description: 'Email subject line',
              example: 'Welcome to our service!'
            },
            html: {
              type: 'string',
              description: 'HTML content of the email',
              example: '<h1>Welcome!</h1><p>Thank you for joining us.</p>'
            },
            text: {
              type: 'string',
              description: 'Plain text content of the email',
              example: 'Welcome! Thank you for joining us.'
            },
            cc: {
              oneOf: [
                {
                  type: 'string',
                  format: 'email'
                },
                {
                  type: 'array',
                  items: {
                    type: 'string',
                    format: 'email'
                  }
                }
              ],
              description: 'CC recipient email address(es)',
              example: ['cc@example.com']
            },
            bcc: {
              oneOf: [
                {
                  type: 'string',
                  format: 'email'
                },
                {
                  type: 'array',
                  items: {
                    type: 'string',
                    format: 'email'
                  }
                }
              ],
              description: 'BCC recipient email address(es)',
              example: ['bcc@example.com']
            },
            reply_to: {
              type: 'string',
              format: 'email',
              description: 'Reply-to email address',
              example: 'support@yourdomain.com'
            },
            attachments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  filename: {
                    type: 'string',
                    example: 'document.pdf'
                  },
                  content: {
                    type: 'string',
                    description: 'Base64 encoded file content'
                  },
                  path: {
                    type: 'string',
                    description: 'File path (alternative to content)'
                  }
                }
              },
              description: 'Email attachments'
            },
            tags: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    example: 'category'
                  },
                  value: {
                    type: 'string',
                    example: 'welcome'
                  }
                }
              },
              description: 'Email tags for tracking and categorization'
            },
            headers: {
              type: 'object',
              additionalProperties: {
                type: 'string'
              },
              description: 'Custom email headers',
              example: {
                'X-Custom-Header': 'value'
              }
            }
          }
        },
        EmailBatchRequest: {
          type: 'object',
          required: ['emails'],
          properties: {
            emails: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/EmailSendRequest'
              },
              description: 'Array of emails to send in batch',
              minItems: 1,
              example: [
                {
                  from: 'noreply@yourdomain.com',
                  to: ['recipient1@example.com'],
                  subject: 'Welcome User 1!',
                  html: '<h1>Welcome User 1!</h1>'
                },
                {
                  from: 'noreply@yourdomain.com', 
                  to: ['recipient2@example.com'],
                  subject: 'Welcome User 2!',
                  html: '<h1>Welcome User 2!</h1>'
                }
              ]
            }
          }
        },
        ResendWebhookEvent: {
          type: 'object',
          required: ['type', 'created_at', 'data'],
          properties: {
            type: {
              type: 'string',
              enum: [
                'email.sent',
                'email.delivered',
                'email.delivery_delayed',
                'email.complained',
                'email.bounced',
                'email.opened',
                'email.clicked',
                'contact.created',
                'contact.updated',
                'contact.deleted'
              ],
              description: 'The type of webhook event',
              example: 'email.delivered'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'When the event occurred',
              example: '2024-01-01T12:00:00Z'
            },
            data: {
              type: 'object',
              description: 'Event-specific data payload',
              oneOf: [
                {
                  $ref: '#/components/schemas/EmailEventData'
                },
                {
                  $ref: '#/components/schemas/ContactEventData'
                }
              ]
            }
          }
        },
        EmailEventData: {
          type: 'object',
          properties: {
            email_id: {
              type: 'string',
              description: 'Unique identifier for the email',
              example: 'email_123456'
            },
            from: {
              type: 'string',
              format: 'email',
              description: 'Sender email address',
              example: 'noreply@yourdomain.com'
            },
            to: {
              type: 'string',
              format: 'email',
              description: 'Recipient email address',
              example: 'recipient@example.com'
            },
            subject: {
              type: 'string',
              description: 'Email subject line',
              example: 'Welcome to our service!'
            },
            bounce_type: {
              type: 'string',
              enum: ['hard', 'soft'],
              description: 'Type of bounce (for bounced emails)',
              example: 'hard'
            },
            reason: {
              type: 'string',
              description: 'Reason for bounce or delay',
              example: 'Invalid recipient address'
            },
            link: {
              type: 'string',
              format: 'uri',
              description: 'Clicked link URL (for click events)',
              example: 'https://example.com/link'
            },
            user_agent: {
              type: 'string',
              description: 'User agent string (for open/click events)',
              example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            ip: {
              type: 'string',
              format: 'ipv4',
              description: 'IP address (for open/click events)',
              example: '192.168.1.1'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'When the event occurred',
              example: '2024-01-01T12:00:00Z'
            }
          }
        },
        ContactEventData: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique identifier for the contact',
              example: 'contact_123456'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Contact email address',
              example: 'contact@example.com'
            },
            first_name: {
              type: 'string',
              description: 'Contact first name',
              example: 'John'
            },
            last_name: {
              type: 'string',
              description: 'Contact last name',
              example: 'Doe'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'When the contact was created',
              example: '2024-01-01T12:00:00Z'
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'When the contact was last updated',
              example: '2024-01-01T12:00:00Z'
            },
            unsubscribed: {
              type: 'boolean',
              description: 'Whether the contact is unsubscribed',
              example: false
            }
          }
        },
        CreateContactRequest: {
          type: 'object',
          required: ['email'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'Contact email address',
              example: 'user@example.com'
            },
            first_name: {
              type: 'string',
              description: 'Contact first name',
              example: 'John'
            },
            last_name: {
              type: 'string',
              description: 'Contact last name',
              example: 'Doe'
            },
            audience_id: {
              type: 'string',
              description: 'Audience ID to add the contact to',
              example: '78261eea-8f8b-4381-83c6-79fa7120f1cf'
            }
          }
        },
        UpdateContactRequest: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'Contact email address',
              example: 'user@example.com'
            },
            first_name: {
              type: 'string',
              description: 'Contact first name',
              example: 'John'
            },
            last_name: {
              type: 'string',
              description: 'Contact last name',
              example: 'Doe'
            },
            unsubscribed: {
              type: 'boolean',
              description: 'Whether the contact is unsubscribed',
              example: false
            }
          }
        },
        CreateAudienceRequest: {
          type: 'object',
          required: ['name'],
          properties: {
            name: {
              type: 'string',
              description: 'Audience name',
              example: 'Newsletter Subscribers',
              minLength: 1,
              maxLength: 255
            }
          }
        },
        CreateBroadcastRequest: {
          type: 'object',
          required: ['audience_id', 'from', 'subject'],
          properties: {
            name: {
              type: 'string',
              description: 'Broadcast name for internal reference',
              example: 'Weekly Newsletter #47'
            },
            audience_id: {
              type: 'string',
              description: 'The audience ID to send the broadcast to',
              example: '78261eea-8f8b-4381-83c6-79fa7120f1cf'
            },
            from: {
              type: 'string',
              format: 'email',
              description: 'Sender email address',
              example: 'newsletter@company.com'
            },
            subject: {
              type: 'string',
              description: 'Email subject line',
              example: 'Weekly Updates - March 2024'
            },
            html: {
              type: 'string',
              description: 'HTML content of the broadcast email',
              example: '<h1>Weekly Updates</h1><p>Here are this week\'s highlights...</p>'
            },
            text: {
              type: 'string',
              description: 'Plain text content of the broadcast email',
              example: 'Weekly Updates\n\nHere are this week\'s highlights...'
            },
            reply_to: {
              type: 'string',
              format: 'email',
              description: 'Reply-to email address',
              example: 'support@company.com'
            },
            attachments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  filename: {
                    type: 'string',
                    example: 'newsletter.pdf'
                  },
                  content: {
                    type: 'string',
                    description: 'Base64 encoded file content'
                  },
                  path: {
                    type: 'string',
                    description: 'File path (alternative to content)'
                  }
                }
              },
              description: 'Email attachments'
            },
            tags: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    example: 'campaign'
                  },
                  value: {
                    type: 'string',
                    example: 'newsletter'
                  }
                }
              },
              description: 'Broadcast tags for tracking and categorization'
            },
            headers: {
              type: 'object',
              additionalProperties: {
                type: 'string'
              },
              description: 'Custom email headers',
              example: {
                'X-Campaign-Type': 'newsletter'
              }
            }
          }
        }
      }
    },
    security: [
      {
        ApiKeyAuth: []
      }
    ]
  },
  apis: ['./routes/*.js', './app.js'], // Path to the API files
};

const specs = swaggerJSDoc(options);

module.exports = {
  specs,
  swaggerUi
};
