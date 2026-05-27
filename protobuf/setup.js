import protobuf from "protobufjs";
import path from "path";

// 1. Path to your .proto file
const PROTO_USER_PATH = path.join(process.cwd(), "protobuf","twivo.user.proto");
const PROTO_TWI_PATH = path.join(process.cwd(), "protobuf","twivo.twi.proto");
// 2. Load the root synchronously or once at startup
// In a high-performance backend, we cache this 'root' object
const root = await protobuf.load(PROTO_USER_PATH);
const rootForTwi = await protobuf.load(PROTO_TWI_PATH);

// 3. Lookup all message types defined in your schema
// Use the full namespace: package twivo.v1.user;
const User = root.lookupType("twivo.v1.user.User");
const PublicUser = root.lookupType("twivo.v1.user.PublicUser");

const TwiType = rootForTwi.lookupType("twivo.v1.twi.Twi");
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


export function protoSerializeTwi(data) {
    if (!data) throw new Error("No data provided for Twi serialization");

    // Explicit field mapping to ensure proto3 compatibility
    const mapping = {
        id: String(data.id || data._id || ""),
        madeBy: String(data.madeBy || ""),
        text: String(data.text || ""),
        attachment: Boolean(data.attachment),
        created_at: String(data.created_at || data.createdAt || new Date().toISOString())
    };

    // Optional fields
    if (data.image) mapping.image = String(data.image);
    if (data.aspectClass) mapping.aspectClass = String(data.aspectClass);

    // Validation
    const verifyError = TwiType.verify(mapping);
    if (verifyError) {
        console.error("Failing data:", mapping);
        throw new Error(`Protobuf validation failed: ${verifyError}`);
    }

    // Create and Encode
    const message = TwiType.create(mapping);
    return TwiType.encode(message).finish();
}
export function verifyTwiMessage(data, isPublic) {

    try {
        const message = TwiType.decode(data);
        const object = TwiType.toObject(message);
        
        // If verify returns null, the message is valid
    
      return TwiType.verify(object) === null;
  
    } catch (e) {
        // If decode fails or throws, it's invalid
           return false;
    }
}
// Export the types in case you need them for .decode() elsewhere
