import express from "express";
import { config } from "./config";

const app = express();
const port = config.port;

// Middleware to parse JSON and raw body
app.use(express.json());
app.use(express.raw({ type: "*/*" }));

// Basic GET endpoint
app.get("/", (req, res) => {
  console.log("📥 GET / - Headers:", req.headers);
  res.json({
    message: "Hello from test server!",
    timestamp: new Date().toISOString(),
  });
});

// Echo endpoint - returns whatever is sent
app.post("/echo", (req, res) => {
  console.log("📥 POST /echo");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  res.json({
    message: "Echo response",
    method: req.method,
    headers: req.headers,
    body: req.body,
    timestamp: new Date().toISOString(),
  });
});

// Stream test endpoint - sends chunks of data
app.get("/stream", (req, res) => {
  console.log("📥 GET /stream");
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Transfer-Encoding", "chunked");

  let count = 0;
  const interval = setInterval(() => {
    if (count >= 5) {
      clearInterval(interval);
      res.end("\nStream ended");
      return;
    }
    res.write(`Chunk ${count + 1}\n`);
    count++;
  }, 1000);

  // Clean up if client disconnects
  req.on("close", () => {
    clearInterval(interval);
  });
});

// File upload test endpoint
app.post("/upload", express.raw({ type: "application/octet-stream" }), (req, res) => {
  console.log("📥 POST /upload");
  console.log("Headers:", req.headers);
  console.log("File size:", req.body.length, "bytes");

  res.json({
    message: "File received",
    size: req.body.length,
    timestamp: new Date().toISOString(),
  });
});

// Error test endpoint
app.get("/error", (req, res) => {
  console.log("📥 GET /error");
  res.status(500).json({
    error: "Test error response",
    timestamp: new Date().toISOString(),
  });
});

// Start the server
app.listen(port, () => {
  console.log(`🚀 Test server running at http://localhost:${port}`);
  console.log("Available endpoints:");
  console.log("  GET  /         - Basic response");
  console.log("  POST /echo     - Echo request");
  console.log("  GET  /stream   - Streaming response");
  console.log("  POST /upload   - File upload");
  console.log("  GET  /error    - Error response");
});
