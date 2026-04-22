FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .


EXPOSE 3000

CMD ["bun", "server.js"]