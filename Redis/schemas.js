class SchemaClass {
  constructor() {}

  //  ### User ###
  createUserCacheData(user, _cache = false) {
    return {
      _id: user._id.toString(),
      username: user.username,
      email: user.email,
      isVerified: _cache
        ? user.isVerified.toString()
        : user.isVerified || false,
      image: user.image,
      bio: user.bio,
      refreshToken: user.refreshToken || null,
      createdAt: (() => {
        const d = user.createdAt;

        if (!d) return new Date().toISOString();

        const date = d instanceof Date ? d : new Date(d);

        return isNaN(date.getTime())
          ? new Date().toISOString()
          : date.toISOString();
      })(),
    };
  }

  // ### Twi ###
  createTwiCacheData(twi, _cache = false) {
    const text = twi.text?.trim() || "";
    const likes = twi.likes ?? 0;
    const comments = twi.comments ?? 0;
    const attachment = twi.attachment ?? false;

    return {
      id: _cache ? twi._id?.toString() : twi._id || "",
      madeBy: _cache ? twi.madeBy?.toString() : twi.madeBy || "",
      text,
      likes: _cache ? likes.toString() : likes,
      comments: _cache ? comments.toString() : comments,
      attachment: _cache ? attachment.toString() : attachment,
      image: twi.image || "",
      aspectClass: twi.aspectClass || "",
      createdAt: (() => {
        const d = twi.createdAt;

        if (!d) return new Date().toISOString();

        const date = d instanceof Date ? d : new Date(d);

        if (isNaN(date.getTime())) {
          return new Date().toISOString();
        }

        return date.toISOString();
      })(),
    };
  }
}
const SchemaCache = new SchemaClass();
export default SchemaCache;
