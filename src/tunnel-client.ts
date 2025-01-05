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
      this.ws = new WebSocket(this.tunnelServerUrl);
      this.setupWebSocketHandlers();
    } catch (error) {
      console.error("Failed to connect to tunnel server:", error);
      this.handleReconnect();
    }
  }

  private setupWebSocketHandlers() {
    if (!this.ws) return;

    this.ws.on("open", () => {
      console.log("🔌 Connected to tunnel server");
      this.register();
      this.reconnectAttempts = 0;
    });

    this.ws.on("message", (data: string) => {
      try {
        const message: TunnelMessage = JSON.parse(data);
        this.handleMessage(message);
      } catch (error) {
        console.error("Error handling message:", error);
      }
    });

    this.ws.on("close", () => {
      console.log("📴 Disconnected from tunnel server");
      this.handleReconnect();
    });

    this.ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      this.handleReconnect();
    });
  }

  private register() {
    if (!this.ws) return;

    const registration = {
      type: "register",
      subdomain: this.subdomain,
      clientId: uuidv4(),
    };

    this.ws.send(JSON.stringify(registration));
  }

  private async handleMessage(message: TunnelMessage) {
    switch (message.type) {
      case "register_response":
        if (message.success) {
          console.log(
            `✅ Successfully registered with subdomain: ${this.subdomain}`
          );
          console.log(`🌍 Your server is accessible at: ${message.url}`);
        } else {
          console.error(`❌ Registration failed: ${message.message}`);
          process.exit(1);
        }
        break;

      case "request":
        await this.handleRequest(message as TunnelRequest);
        break;
    }
  }

  private async handleRequest(request: TunnelRequest) {
    try {
      const response = await this.forwardRequestToLocalServer(request);
      if (this.ws) {
        this.ws.send(JSON.stringify(response));
      }
    } catch (error) {
      console.error("Error forwarding request to local server:", error);
      if (this.ws) {
        this.ws.send(
          JSON.stringify({
            type: "response",
            id: request.id,
            statusCode: 500,
            headers: { "content-type": "application/json" },
            body: { error: "Internal server error" },
          })
        );
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

      const httpModule = this.localServerUrl.startsWith("https") ? https : http;
      const req = httpModule.request(options, (res) => {
        console.log("res", res.statusCode, res.headers);
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          console.log(
            "📡 Received response from local server",
            body,
            res.headers,
            res.statusCode
          );
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
        reject(error);
      });

      if (request.body) {
        req.write(request.body);
      }
      req.end();
    });
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
      );
      setTimeout(
        () => this.connect(),
        this.reconnectDelay * this.reconnectAttempts
      );
    } else {
      console.error("❌ Max reconnection attempts reached. Exiting...");
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
