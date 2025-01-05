import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  port: number;
  subdomain: string;
  tunnelServerUrl: string;
  tunnelServerPort: number;
  useHttps: boolean;
}

export const config: Config = {
  port: Number(process.env.PORT) || 3000,
  subdomain: process.env.TUNNEL_SUBDOMAIN || 'default',
  tunnelServerUrl: process.env.TUNNEL_SERVER_URL || 'ws://localhost:8000',
  tunnelServerPort: Number(process.env.TUNNEL_SERVER_PORT) || 8000,
  useHttps: process.env.USE_HTTPS === 'true'
};
