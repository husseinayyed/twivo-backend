import { readFileSync } from 'fs';
import { SignJWT, importPKCS8 } from 'jose';   // 👈 Add importPKCS8
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const privateKeyPath = resolve(__dirname, '..','keys', 'ed25519_private.pem');
const privateKeyPem = readFileSync(privateKeyPath, 'utf8');

// Convert PEM to CryptoKey (do this once at startup)
const privateKey = await importPKCS8(privateKeyPem, 'EdDSA');
function Initialize() { 
    console.log("EdsaToken maker is ready...")
 }
async function signEd25519Token(userId, action = 'uploadImage', expiresIn = 5) {
  return new SignJWT({ action })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuer('twivo-backend')
    .setSubject(userId)
    .setAudience('twivo-media')
    .setJti(uuidv4())
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}m`)
    .sign(privateKey);
}

export default signEd25519Token;
export {Initialize};