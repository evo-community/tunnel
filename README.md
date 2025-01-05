# Local Tunnel Server

This project provides a TypeScript-based Express server with tunneling capabilities to expose your localhost to the internet.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure your environment:
```bash
cp .env.example .env
```
Edit the `.env` file with your desired configuration:
- `PORT`: The port your local server runs on (default: 3000)
- `TUNNEL_SUBDOMAIN`: Custom subdomain for your tunnel URL (optional)
- `TUNNEL_HOST`: Custom tunnel host (optional, default: https://loca.lt)
- `LOCAL_HTTPS`: Enable HTTPS for local server (optional, default: false)
- `ALLOW_INVALID_CERT`: Allow invalid certificates (optional, default: false)

3. Start the development server with hot reload:
```bash
npm run dev
```

4. In a separate terminal, start the tunnel:
```bash
npm run tunnel
```

The tunnel script will provide you with a public URL that you can use to access your local server from anywhere.

## Scripts

- `npm run dev` - Start the development server with hot reload
- `npm start` - Same as dev
- `npm run tunnel` - Start the tunnel
- `npm run build` - Build the TypeScript code to JavaScript

## Features

- TypeScript support for better type safety and development experience
- Express server running on port 3000 (configurable via PORT environment variable)
- Custom subdomain support for tunnel URLs
- HTTPS support for secure connections
- JSON body parsing middleware
- Basic GET and POST endpoints for testing
- Secure tunneling using localtunnel
- Hot reload during development using tsx
- Environment-based configuration with dotenv
