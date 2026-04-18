// routes/schemas/authSchemas.js
const success = {
  200: {
    type: "object",
    properties: {
      success: { type: "boolean" },
    },
  },
};
export // In your schema definition
const signupSchema = {
  body: {
    type: "object",
    required: ["name", "email", "username"],
    properties: {
      name: { type: "string", minLength: 2, maxLength: 100 },
      email: {
        type: "string",
        format: "email", // Add email format validation
        pattern: "^[^\\s@]+@([^\\s@]+\\.)+[^\\s@]+$", // Email regex
      },
      // In your schema, change the pattern to allow more characters:
      username: {
        type: "string",
        minLength: 3,
        maxLength: 30,
        pattern: "^[a-zA-Z0-9_.-]+$", // Allow dots, hyphens, underscores
      },
    },
  },
};
export const loginSchema = {
  body: {
    type: "object",
    required: ["magicUrl"],
    properties: {
      magicUrl: {
        type: "string",
      },
    },
  },
};
export const logoutSchema = {
  response: {
    ...success,
  },
};
