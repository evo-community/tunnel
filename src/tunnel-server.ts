import express from "express";
import { createServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import {
  TunnelMessage,
  TunnelRequest,
  TunnelRegistration,
  TunnelResponse,
} from "./tunnel/types";

interface ConnectedClient {
  ws: WebSocket;
  subdomain: string;
  clientId: string;
}

class TunnelServer {
  private app = express();
  private server = createServer(this.app);
  private wss = new WebSocketServer({ server: this.server });
  private clients = new Map<string, ConnectedClient>();
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (reason: any) => void;
    }
  >();

  constructor(private port: number = 8000) {
    this.setupExpress();
    this.setupWebSocket();
  }

  private setupExpress() {
    // Handle all requests to forward to the appropriate client
    this.app.use(async (req, res) => {
      console.log(`🌐 Received request: ${req.method} ${req.url}`);
      const subdomain = req.hostname.split(".")[0];
      const client = Array.from(this.clients.values()).find(
        (c) => c.subdomain === subdomain
      );

      if (!client) {
        return res.status(404).json({ error: "Tunnel not found" });
      }

      try {
        const response = await this.forwardRequest(client, req);
        res
          .status(response.statusCode)
          .set(response.headers)
          .send(response.body);
      } catch (error) {
        console.error("Error forwarding request:", error);
        res.status(500).json({ error: "Failed to forward request" });
      }
    });
  }

  private setupWebSocket() {
    this.wss.on("connection", (ws: WebSocket) => {
      const clientId = uuidv4();
      console.log(`🔌 New client connected: ${clientId}`);

      ws.on("message", (data: string) => {
        try {
          const message: TunnelMessage = JSON.parse(data);
          this.handleMessage(ws, clientId, message);
        } catch (error) {
          console.error("Error handling message:", error);
        }
      });

      ws.on("close", () => {
        console.log(`📴 Client disconnected: ${clientId}`);
        this.clients.delete(clientId);
      });
    });
  }

  private async handleMessage(
    ws: WebSocket,
    clientId: string,
    message: TunnelMessage
  ) {
    switch (message.type) {
      case "register":
        this.handleRegistration(ws, clientId, message);
        break;
      case "response":
        this.handleResponse(message);
        break;
    }
  }

  private handleRegistration(
    ws: WebSocket,
    clientId: string,
    message: TunnelRegistration
  ) {
    // Check if subdomain is available
    const isSubdomainTaken = Array.from(this.clients.values()).some(
      (client) => client.subdomain === message.subdomain
    );

    if (isSubdomainTaken) {
      ws.send(
        JSON.stringify({
          type: "register_response",
          success: false,
          message: "Subdomain already taken",
        })
      );
      return;
    }

    // Register the client
    this.clients.set(clientId, {
      ws,
      subdomain: message.subdomain,
      clientId,
    });

    ws.send(
      JSON.stringify({
        type: "register_response",
        success: true,
        message: "Registration successful",
        url: `https://${message.subdomain}.yourdomain.com`,
      })
    );

    console.log(
      `✅ Registered client ${clientId} with subdomain: ${message.subdomain}`
    );
  }

  private handleResponse(message: TunnelResponse) {
    const pending = this.pendingRequests.get(message.id);
    if (pending) {
      this.pendingRequests.delete(message.id);
      pending.resolve(message);
    }
  }

  private forwardRequest(
    client: ConnectedClient,
    req: express.Request
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = uuidv4();
      const request: TunnelRequest = {
        type: "request",
        id: requestId,
        method: req.method,
        path: req.path,
        headers: req.headers as { [key: string]: string },
        body: req.body,
      };

      console.log(`🔄 Forwarding request: ${req.method} ${req.path}`);

      this.pendingRequests.set(requestId, { resolve, reject });

      try {
        client.ws.send(JSON.stringify(request), (error) => {
          if (error) {
            this.pendingRequests.delete(requestId);
            reject(new Error(`Failed to send request: ${error.message}`));
          }
        });
      } catch (error) {
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  public start() {
    this.server.listen(this.port, () => {
      console.log(`🚀 Tunnel server running on port ${this.port}`);
    });
  }
}

// Start the tunnel server
const server = new TunnelServer(Number(process.env.PORT) || 8000);
server.start();
