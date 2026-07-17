FROM node:24.5.0 AS builder

WORKDIR /home/uttaram

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000

COPY tsconfig.json next.config.mjs next-env.d.ts postcss.config.js drizzle.config.ts tailwind.config.ts ./
COPY src ./src
COPY public ./public
COPY drizzle ./drizzle

RUN mkdir -p /home/uttaram/data
RUN yarn build
RUN yarn install --frozen-lockfile --production

FROM node:24.5.0-slim

RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/uttaram

COPY --from=builder /home/uttaram/public ./public
COPY --from=builder /home/uttaram/.next/static ./public/_next/static
COPY --from=builder /home/uttaram/.next/standalone ./
COPY --from=builder /home/uttaram/node_modules ./node_modules
COPY --from=builder /home/uttaram/data ./data
COPY drizzle ./drizzle

RUN mkdir /home/uttaram/uploads

RUN npx playwright install --with-deps --only-shell chromium \
    && rm -rf /root/.cache/puppeteer /root/.cache/ms-playwright/firefox-* /root/.cache/ms-playwright/webkit-* /tmp/*

WORKDIR /home/uttaram
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
RUN sed -i 's/\r$//' ./entrypoint.sh || true

EXPOSE 3000

CMD ["/home/uttaram/entrypoint.sh"]
