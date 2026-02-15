// routes/schemas/authSchemas.js

export const signupSchema = {
  body: {
    type: 'object',
    required: ['name','username', 'email'],
    properties: {
        name: { type: 'string' },   
        username: { type: 'string' },
      email: { type: 'string' },
    }
  },
response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' }
      }
    }
  }
};


export const logoutSchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' }
      }
    }
  }
};