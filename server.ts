import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";

// Services (Dummy)
class CameraService {
  private interval: NodeJS.Timeout | null = null;
  private delay: number = 0;

  setDelay(delay: number) {
    this.delay = delay;
    console.log(`[CameraService] Delay set to ${delay}s`);
  }

  startStreaming(ws: WebSocket) {
    console.log("[CameraService] Starting stream simulation");
    if (this.interval) clearInterval(this.interval);
    
    // Simulate WebCodecs chunks
    this.interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        // Create a dummy binary payload that mimics a small VP8 frame
        const dummyFrameSize = 512 + Math.floor(Math.random() * 512);
        const data = Buffer.alloc(dummyFrameSize);
        // Fill some data to avoid empty chunks
        data.fill(0xAA, 0, 10); 

        const chunk = {
          type: "video-chunk",
          timestamp: Date.now(),
          data: data,
          isKey: Math.random() > 0.95, // Rare keyframes
        };
        ws.send(JSON.stringify(chunk));
      }
    }, 33); // ~30fps simulation
  }

  stopStreaming() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  triggerCapture(callback: () => void) {
    console.log(`[CameraService] Capture triggered with ${this.delay}s delay`);
    setTimeout(() => {
      console.log("[CameraService] Capturing image...");
      callback();
    }, this.delay * 1000);
  }
}

class GenAIService {
  process(callback: (step: number, batch: number, data: string) => void, final: (variants: string[]) => void) {
    console.log("[GenAIService] Starting post-processing simulation");
    const n_batch = 3;
    const n_step = 4;

    let step = 0;
    const interval = setInterval(() => {
      if (step < n_step) {
        for (let b = 0; b < n_batch; b++) {
          // Send dummy preview URL (placeholder)
          callback(step, b, `https://picsum.photos/seed/${step}-${b}/400/600`);
        }
        step++;
      } else {
        clearInterval(interval);
        console.log("[GenAIService] Final results ready");
        final([
          "https://picsum.photos/seed/final-0/800/1200",
          "https://picsum.photos/seed/final-1/800/1200",
          "https://picsum.photos/seed/final-2/800/1200",
        ]);
      }
    }, 1500);
  }
}

class PrinterService {
  print(variantId: number) {
    console.log(`[PrinterService] Printing variant ${variantId}`);
    return true;
  }
}

const cameraService = new CameraService();
const genAiService = new GenAIService();
const printerService = new PrinterService();

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  const PORT = 3000;

  wss.on("connection", (ws) => {
    console.log("[WS] Client connected");
    
    // Start streaming by default for View 1
    cameraService.startStreaming(ws);

    // Demonstrate remote countdown after 15 seconds
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log("[WS] Pushing remote-countdown command");
        ws.send(JSON.stringify({ type: "remote-countdown", duration: 5 }));
      }
    }, 15000);

    ws.on("message", (message) => {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case "set-delay":
          cameraService.setDelay(data.delay);
          break;
        
        case "trigger-countdown":
          console.log("[WS] Trigger received");
          // Logic for countdown could be client-side or server-pushed
          break;

        case "capture":
          console.log("[WS] Capture command received from client");
          genAiService.process(
            (step, batch, preview) => {
              ws.send(JSON.stringify({ type: "preview", step, batch, preview }));
            },
            (variants) => {
              ws.send(JSON.stringify({ type: "final", variants }));
            }
          );
          break;

        case "print":
          printerService.print(data.variantId);
          ws.send(JSON.stringify({ type: "print-confirm", success: true }));
          break;

        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;
      }
    });

    ws.on("close", () => {
      console.log("[WS] Client disconnected");
      cameraService.stopStreaming();
    });
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
