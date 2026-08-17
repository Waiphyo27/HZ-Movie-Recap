FROM node:20-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    unzip \
    python3 \
    fonts-dejavu-core \
    fonts-noto-cjk \
    fonts-noto-core \
    fonts-noto-unhinted \
    fontconfig \
    && fc-cache -f -v \
    && rm -rf /var/lib/apt/lists/*

RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

RUN curl -fsSL https://deno.land/install.sh | sh -s -- -y \
    && mv /root/.deno/bin/deno /usr/local/bin/deno

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 4000

CMD ["node", "src/server.js"]