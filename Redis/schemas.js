class SchemaClass {
  constructor() {}
  
  getPublicUserData(user) {
  // Don't use createTwiCacheData - that's for tweets!
  // Use createUserCacheData but exclude sensitive fields
  
  const fullData = this.createUserCacheData(user);
  
  // Remove sensitive fields for public view
  const { email, refreshToken, isVerified, ...publicData } = fullData;
  
  return publicData;
}
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
    if (!twi) return null;

    // Handle potential double transformation or different ID field names
    const id = twi._id || twi.id || "";
    const madeBy = twi.madeBy || "";
    
    const text = twi.text?.trim() || "";
    const attachment = !!(twi.attachment);

    const createdAt = (() => {
      const d = twi.createdAt || twi.created_at;

      if (!d) return new Date().toISOString();

      const date = d instanceof Date ? d : new Date(d);

      if (isNaN(date.getTime())) {
        return new Date().toISOString();
      }

      return date.toISOString();
    })();

    return {
      id: String(id),
      madeBy: String(madeBy),
      text,
      attachment,
      image: twi.image || "",
      aspectClass: twi.aspectClass || "",
      createdAt,
      created_at: createdAt, // For Protobuf compatibility
    };
  }
}
const SchemaCache = new SchemaClass();
export default SchemaCache;
