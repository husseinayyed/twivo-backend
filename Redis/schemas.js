class SchemaClass {
  constructor() {}

  //  ### User ###
  createUserCacheData(user, _cache = false) {
    return {
      _id: user._id.toString(),
      username: user.username,
      email: user.email,
      isVerified:_cache ? user.isVerified.toString() : user.isVerified || false,
      image: user.image,
      bio: user.bio,
      refreshToken:user.refreshToken || null,
      createdAt: user.createdAt?.toISOString() || new Date().toISOString(),
    };
  }

  // ### Twi ###
  createTwiCacheData(twi, _cache = false) {
    const text = twi.text?.trim() || "";
    const likes = twi.likes ?? 0;
    const comments = twi.comments ?? 0;
    const attachment = twi.attachment ?? false;
    const createdAt = twi.createdAt || new Date();

    return {
      id: _cache ? twi._id?.toString() : twi._id || "",
      madeBy: _cache ? twi.madeBy?.toString() : twi.madeBy || "",
      text,
      likes: _cache ? likes.toString() : likes,
      comments: _cache ? comments.toString() : comments,
      attachment: _cache ? attachment.toString() : attachment,
      image: twi.image || "",
      aspectClass: twi.aspectClass || "",
      createdAt: createdAt.toISOString() || new Date(),
    };
  }
}
const SchemaCache = new SchemaClass();
export default SchemaCache;
