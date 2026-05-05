#include <iostream>
#include <string>
#include "twivo.user.pb.h"

using namespace twivo::v1::user;

extern "C" {
    /**
     * Optimized serialization for PublicUser.
     * Returns bytes written, or 0 on failure/overflow.
     */
    size_t serializePublicUser(
        uint8_t* out_buf,
        size_t out_limit,
        const char* id,
        const char* username,
        bool isverified,
        const char* bio,
        const char* createdAt 
    ) {
        PublicUser user;

        if (id) user.set_id(id);
        if (username) user.set_username(username);
        user.set_isverified(isverified);
        if (bio) user.set_bio(bio);
        if (createdAt) user.set_created_at(createdAt);

        const size_t actual_size = user.ByteSizeLong();
        if (actual_size > out_limit) return 0;

        return user.SerializeToArray(out_buf, actual_size) ? actual_size : 0;
    }

    /**
     * Optimized serialization for Internal User.
     */
    size_t serializeInternalUser(
        uint8_t* out_buf,
        size_t out_limit,
        const char* id,
        const char* username,
        const char* email,
        bool isverified,
        const char* bio,
        const char* refreshToken,
        const char* createdAt
    ) {
        User user;

        if (id) user.set_id(id);
        if (username) user.set_username(username);
        if (email) user.set_email(email);
        user.set_isverified(isverified);
        if (bio) user.set_bio(bio);
        if (refreshToken) user.set_refresh_token(refreshToken);
        if (createdAt) user.set_created_at(createdAt);

        const size_t actual_size = user.ByteSizeLong();
        if (actual_size > out_limit) return 0;

        return user.SerializeToArray(out_buf, actual_size) ? actual_size : 0;
    }
}