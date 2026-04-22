import { SignJWT, importPKCS8 } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
let privateKey;
async function Initialize() {
    try {
        // Define path - ideally passed via env, e.g., /run/secrets/ed25519_key
        const keyPath = process.env.ED25519_KEY_PATH || path.join(process.cwd(), 'private.pem');

        console.log(`Loading Ed25519 private key from: ${keyPath}`);
        
        // Read file as a string directly
        const rawKey = await readFile(keyPath, 'utf8');
        
        // jose.importPKCS8 handles the PEM headers and line breaks automatically
        privateKey = await importPKCS8(rawKey.trim(), 'EdDSA');

        console.log("✅ Ed25519 token maker initialized via filesystem");
    } catch (error) {
        // Detailed logging for performance monitoring
        console.error("❌ Failed to initialize Ed25519:", error.code === 'ENOENT' 
            ? "File not found" 
            : error.message);
        throw error;
    }
}

async function signEd25519Token(userId, action = 'uploadImage', expiresIn = 5, id) {
    if (!privateKey) {
        throw new Error("Token maker not initialized. Call Initialize() first.");
    }
    
    const payload = { action };
    if (id !== undefined && id !== null) {
        payload.id = id;
    }
    
    return new SignJWT(payload)
        .setProtectedHeader({ alg: 'EdDSA' })
        .setIssuer('twivo-backend')
        .setSubject(String(userId))
        .setAudience('twivo-media')
        .setJti(uuidv4())
        .setIssuedAt()
        .setExpirationTime(`${expiresIn}m`)
        .sign(privateKey);
}

export default signEd25519Token;
export { Initialize };