import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import { TunnelMessage, TunnelRequest, TunnelResponse } from "./tunnel/types";
import http from "http";
import https from "https";
import { config } from "./config";

class TunnelClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;

  constructor(
    private tunnelServerUrl: string,
    private localServerUrl: string,
    private subdomain: string
  ) {}

  public async connect() {
    try {
      console.log("\n🔌 Connecting to tunnel server:", this.tunnelServerUrl);
      this.ws = new WebSocket(this.tunnelServerUrl);
      this.setupWebSocketHandlers();
    } catch (error) {
      console.error("\n❌ Failed to connect to tunnel server:", error);
      this.handleReconnect();
    }
  }

  private setupWebSocketHandlers() {
    if (!this.ws) return;

    this.ws.on("open", () => {
      console.log("\n✅ Connected to tunnel server");
      console.log("  URL:", this.tunnelServerUrl);
      console.log("  Time:", new Date().toISOString());
      this.register();
      this.reconnectAttempts = 0;
    });

    this.ws.on("message", (data: string) => {
      try {
        console.log("\n📥 Received WebSocket message:");
        const message: TunnelMessage = JSON.parse(data);
        console.log("  Type:", message.type);
        console.log("  Content:", JSON.stringify(message, null, 2));
        this.handleMessage(message);
      } catch (error) {
        console.error("\n❌ Error handling WebSocket message:", error);
        console.error("  Raw data:", data);
      }
    });

    this.ws.on("close", () => {
      console.log("\n📴 Disconnected from tunnel server");
      console.log("  Time:", new Date().toISOString());
      this.handleReconnect();
    });

    this.ws.on("error", (error) => {
      console.error("\n❌ WebSocket error:", error);
    });
  }

  private register() {
    if (!this.ws) return;

    console.log("\n🔑 Registering with tunnel server:");
    console.log("  Subdomain:", this.subdomain);

    const registration = {
      type: "register",
      subdomain: this.subdomain,
      clientId: uuidv4(),
    };

    console.log("  Registration data:", JSON.stringify(registration, null, 2));
    this.ws.send(JSON.stringify(registration));
  }

  private async handleMessage(message: TunnelMessage) {
    console.log("\n📨 Processing message:", message.type);

    switch (message.type) {
      case "register_response":
        if (message.success) {
          console.log("\n✅ Registration successful:");
          console.log("  Subdomain:", this.subdomain);
          console.log("  Public URL:", message.url);
        } else {
          console.error("\n❌ Registration failed:");
          console.error("  Reason:", message.message);
          process.exit(1);
        }
        break;

      case "request":
        console.log("\n📥 Received request to forward:");
        console.log("  ID:", message.id);
        console.log("  Method:", message.method);
        console.log("  Path:", message.path);
        await this.handleRequest(message as TunnelRequest);
        break;
    }
  }

  private async handleRequest(request: TunnelRequest) {
    try {
      console.log("\n🔄 Forwarding request to local server:");
      console.log("  ID:", request.id);
      console.log("  Method:", request.method);
      console.log("  Path:", request.path);
      console.log("  Headers:", JSON.stringify(request.headers, null, 2));
      console.log("  Body length:", request.body?.length || 0, "bytes");

      const response = await this.forwardRequestToLocalServer(request);
      
      console.log("\n📤 Sending response back to tunnel server:");
      console.log("  ID:", response.id);
      console.log("  Status:", response.statusCode);
      console.log("  Headers:", JSON.stringify(response.headers, null, 2));
      console.log("  Body length:", response.body?.length || 0, "bytes");

      if (this.ws) {
        this.ws.send(JSON.stringify(response));
        console.log("✅ Response sent successfully");
      }
    } catch (error) {
      console.error("\n❌ Error handling request:", error);
      if (this.ws) {
        const errorResponse = {
          type: "response",
          id: request.id,
          statusCode: 500,
          headers: { "content-type": "application/json" },
          body: { error: "Internal server error" },
        };
        console.log("📤 Sending error response:", errorResponse);
        this.ws.send(JSON.stringify(errorResponse));
      }
    }
  }

  private forwardRequestToLocalServer(
    request: TunnelRequest
  ): Promise<TunnelResponse> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: new URL(this.localServerUrl).hostname,
        port: new URL(this.localServerUrl).port,
        path: request.path,
        method: request.method,
        headers: request.headers,
      };

      console.log("\n📡 Creating request to local server:");
      console.log("  URL:", `${this.localServerUrl}${request.path}`);
      console.log("  Options:", JSON.stringify(options, null, 2));

      const httpModule = this.localServerUrl.startsWith("https") ? https : http;
      const req = httpModule.request(options, (res) => {
        console.log("\n📥 Received response from local server:");
        console.log("  Status:", res.statusCode);
        console.log("  Headers:", JSON.stringify(res.headers, null, 2));

        const chunks: Buffer[] = [];

        res.on("data", (chunk) => {
          console.log("  Received chunk:", chunk.length, "bytes");
          chunks.push(Buffer.from(chunk));
        });

        res.on("end", () => {
          const bodyBuffer = Buffer.concat(chunks);
          let body: string | Buffer = bodyBuffer;

          const contentType = res.headers["content-type"] || "";
          if (contentType.includes("json") || contentType.includes("text")) {
            body = bodyBuffer.toString("utf-8");
            console.log("  Converted body to text (length):", body.length);
          } else {
            console.log("  Kept body as binary (length):", body.length);
          }

          resolve({
            type: "response",
            id: request.id,
            statusCode: res.statusCode || 500,
            headers: res.headers as { [key: string]: string },
            body,
          });
        });
      });

      req.on("error", (error) => {
        console.error("\n❌ Local server request error:", error);
        reject(error);
      });

      if (request.body) {
        console.log("  Writing request body:", request.body.length, "bytes");
        req.write(request.body);
      }

      console.log("  Ending request");
      req.end();
    });
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `\n🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}):`
      );
      console.log("  Next attempt in:", this.reconnectDelay * this.reconnectAttempts, "ms");
      setTimeout(
        () => this.connect(),
        this.reconnectDelay * this.reconnectAttempts
      );
    } else {
      console.error("\n❌ Max reconnection attempts reached. Exiting...");
      process.exit(1);
    }
  }
}

// Start the tunnel client
const tunnelClient = new TunnelClient(
  config.tunnelServerUrl || "ws://localhost:8000",
  `http://localhost:${config.port}`,
  config.subdomain || "default"
);

tunnelClient.connect();
