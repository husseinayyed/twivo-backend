import jwt from "jsonwebtoken";
import bcrypt from "bcrypt"
function isTokenValid(token, secret) {
  try {
    const pay = jwt.verify(token, secret);
    return [true, pay];
  } catch {
    return [false];
  }
}
/**
 * Generates recovery keys with better randomness and format
 * @param {number} count - Number of keys to generate (default: 10)
 * @returns {Promise<string[]>} Array of hashed recovery keys
 */
async function createRecoveryKeys(count = 10) {
  const keys = [];
  
  for (let i = 0; i < count; i++) {
    // Generate more random 10-digit number using multiple methods
    const timestamp = Date.now().toString();
    const randomPart = Math.floor(Math.random() * 1000000);
    
    // Create a more unique seed
    const seed = parseInt(
      timestamp.slice(-6) + 
      randomPart.toString().padStart(6, '0') + 
      i.toString().padStart(2, '0')
    );
    
    // Generate 10-digit number
    const num = (seed % 9000000000) + 1000000000;
    
    // Create a more complex string to hash
    const keyString = `${num}-${timestamp}-${i}-${Math.random().toString(36).substring(2, 10)}`;
    
    // Hash with bcrypt (async version)
    const hashedKey = await bcrypt.hash(keyString, 10);
    keys.push(hashedKey);
  }
  
  return keys;
}
async function jwtMaker(payload) {
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "10m",
  });
  const refreshToken = jwt.sign(payload, process.env.REFRESH_SECRET, {
    expiresIn: "7d",
  });
  const hashToken = await bcrypt.hash(refreshToken, 10);

  const recoveryKeys = await createRecoveryKeys()
  return { accessToken, refreshToken, hashToken, recoveryKeys }
}
export {isTokenValid,jwtMaker}