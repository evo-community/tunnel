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
      console.log("\n🌐 Incoming HTTP Request:");
      console.log("  Method:", req.method);
      console.log("  URL:", req.url);
      console.log("  Headers:", JSON.stringify(req.headers, null, 2));
      console.log("  Body:", req.body);

      const subdomain = req.hostname.split(".")[0];
      console.log("  Subdomain:", subdomain);

      const client = Array.from(this.clients.values()).find(
        (c) => c.subdomain === subdomain
      );

      if (!client) {
        console.log("❌ No client found for subdomain:", subdomain);
        return res.status(404).json({ error: "Tunnel not found" });
      }

      console.log("✅ Found client for subdomain:", subdomain);

      try {
        const response = await this.forwardRequest(client, req);
        console.log("\n📤 Sending response back:");
        console.log("  Status:", response.statusCode);
        console.log("  Headers:", JSON.stringify(response.headers, null, 2));
        console.log("  Body length:", response.body?.length || 0, "bytes");

        res
          .status(response.statusCode)
          .set(response.headers)
          .send(response.body);
      } catch (error) {
        console.error("❌ Error forwarding request:", error);
        res.status(500).json({ error: "Failed to forward request" });
      }
    });
  }

  private setupWebSocket() {
    console.log("\n🚀 WebSocket server ready for connections");

    this.wss.on("connection", (ws: WebSocket) => {
      const clientId = uuidv4();
      console.log("\n🔌 New WebSocket connection:");
      console.log("  Client ID:", clientId);

      ws.on("message", (data: string) => {
        try {
          console.log("\n📥 Received WebSocket message:");
          const message: TunnelMessage = JSON.parse(data);
          console.log("  Type:", message.type);
          console.log("  Content:", JSON.stringify(message, null, 2));
          this.handleMessage(ws, clientId, message);
        } catch (error) {
          console.error("❌ Error handling WebSocket message:", error);
        }
      });

      ws.on("close", () => {
        console.log("\n📴 WebSocket connection closed:");
        console.log("  Client ID:", clientId);
        this.clients.delete(clientId);
        console.log("  Active clients:", this.clients.size);
      });

      ws.on("error", (error) => {
        console.error("\n❌ WebSocket error:");
        console.error("  Client ID:", clientId);
        console.error("  Error:", error);
      });
    });
  }

  private handleMessage(
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
    console.log("\n🔑 Processing registration request:");
    console.log("  Client ID:", clientId);
    console.log("  Requested subdomain:", message.subdomain);

    const isSubdomainTaken = Array.from(this.clients.values()).some(
      (client) => client.subdomain === message.subdomain
    );

    if (isSubdomainTaken) {
      console.log("❌ Subdomain already taken:", message.subdomain);
      ws.send(
        JSON.stringify({
          type: "register_response",
          success: false,
          message: "Subdomain already taken",
        })
      );
      return;
    }

    this.clients.set(clientId, {
      ws,
      subdomain: message.subdomain,
      clientId,
    });

    console.log("✅ Registration successful:");
    console.log("  Client ID:", clientId);
    console.log("  Subdomain:", message.subdomain);
    console.log("  Active clients:", this.clients.size);

    ws.send(
      JSON.stringify({
        type: "register_response",
        success: true,
        message: "Registration successful",
        url: `https://${message.subdomain}.yourdomain.com`,
      })
    );
  }

  private handleResponse(message: TunnelResponse) {
    console.log("\n📤 Handling client response:");
    console.log("  Request ID:", message.id);
    console.log("  Status code:", message.statusCode);
    console.log("  Headers:", JSON.stringify(message.headers, null, 2));
    console.log("  Body length:", message.body?.length || 0, "bytes");

    const pending = this.pendingRequests.get(message.id);
    if (pending) {
      console.log("✅ Found pending request, resolving");
      this.pendingRequests.delete(message.id);
      pending.resolve(message);
    } else {
      console.log("❌ No pending request found for ID:", message.id);
    }
  }

  private forwardRequest(
    client: ConnectedClient,
    req: express.Request
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = uuidv4();
      console.log("\n🔄 Forwarding request to client:");
      console.log("  Request ID:", requestId);
      console.log("  Client ID:", client.clientId);
      console.log("  Method:", req.method);
      console.log("  Path:", req.path);
      console.log("  Headers:", JSON.stringify(req.headers, null, 2));
      console.log("  Body length:", req.body?.length || 0, "bytes");

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
      console.log("✅ Added to pending requests. Total pending:", this.pendingRequests.size);

      try {
        client.ws.send(JSON.stringify(request), (error) => {
          if (error) {
            console.error("❌ Failed to send request to client:", error);
            this.pendingRequests.delete(requestId);
            reject(new Error(`Failed to send request: ${error.message}`));
          } else {
            console.log("✅ Request sent to client successfully");
          }
        });
      } catch (error) {
        console.error("❌ Error sending request to client:", error);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  public start() {
    this.server.listen(this.port, () => {
      console.log("\n🚀 Tunnel server started:");
      console.log("  Port:", this.port);
      console.log("  Time:", new Date().toISOString());
    });
  }
}

// Start the tunnel server
const server = new TunnelServer(Number(process.env.PORT) || 8000);
server.start();
