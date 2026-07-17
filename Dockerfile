FROM node:20-alpine
WORKDIR /app
COPY server/ .
RUN npm install
EXPOSE 10000
CMD ["node", "index.js"]
