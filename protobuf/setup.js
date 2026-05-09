import protobuf from "protobufjs";
import path from "path";

// 1. Path to your .proto file
const PROTO_PATH = path.join(process.cwd(), "protobuf","twivo.user.proto");

// 2. Load the root synchronously or once at startup
// In a high-performance backend, we cache this 'root' object
const root = await protobuf.load(PROTO_PATH);

// 3. Lookup all message types defined in your schema
// Use the full namespace: package twivo.v1.user;
const User = root.lookupType("twivo.v1.user.User");
const PublicUser = root.lookupType("twivo.v1.user.PublicUser");

/**
 * Serializes a user object into a Protobuf binary buffer
 */
export default function protoSerializeUser(data, isPublic = true) {
    // Select the correct pre-loaded Type
    const UserType = isPublic ? PublicUser : User;

    // Map fields
  


    // Validation
    const verifyError = UserType.verify(data);
    if (verifyError) {
        throw new Error(`Protobuf validation failed: ${verifyError}`);
    }

    // Create and Encode
    const message = UserType.create(data);
    return UserType.encode(message).finish();
}
export function verifyUserMessage(data, isPublic) {
    const UserType = isPublic ? PublicUser : User;

    try {
        const message = UserType.decode(data);
        const object = UserType.toObject(message);
        
        // If verify returns null, the message is valid
    
      return UserType.verify(object) === null;
  
    } catch (e) {
        // If decode fails or throws, it's invalid
           return false;
    }
}

// Export the types in case you need them for .decode() elsewhere
