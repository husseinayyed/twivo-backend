// routes/schemas/authSchemas.js
const success = {
  200: {
    type: "object",
    properties: {
      success: { type: "boolean" },
    },
  },
};
export const signupSchema = {
  body: {
    type: "object",
    required: ["name", "username", "email"],
    properties: {
      name: { type: "string" },
      username: { type: "string" },
      email: { type: "string" },
    },
  },
  response: {
    ...success,
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
  response: {
    ...success,
  },
};
export const logoutSchema = {
  response: {
    ...success,
  },
};
