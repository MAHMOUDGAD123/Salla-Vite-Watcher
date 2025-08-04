import { _public } from "./globals.ts";
import { Logger } from "./logger.ts";
import { WebSocketServer } from "ws";

export class HMRClient {
  /**
   * This port by default is `55555` as a free temporary port
   * then it will be set to the `sallaCli.wsport` after the
   * connection on the server is done.
   */
  private wsPort: number = 55555;
  private wss: WebSocketServer | null = null;
  private clientPorts: HMRClientWebSocketPorts;

  constructor(clientPorts: HMRClientWebSocketPorts) {
    this.setupWSS();
    this.clientPorts = clientPorts;
  }

  private setupWSS() {
    try {
      this.wss = new WebSocketServer({ port: this.wsPort });

      this.wss.on("connection", (ws) => {
        // send the CLI ports to the client
        const clientMsg: HMRClientWebSocketMessage = {
          action: "setup-hmr",
          data: this.clientPorts,
        };
        ws.send(JSON.stringify(clientMsg));

        // Listen for messages from client
        ws.on("message", (_msg) => {
          Logger.debug(_msg.toString());
        });

        // Handle client disconnection
        ws.once("close", () => {
          ws.removeAllListeners();
          Logger.debug("HMR ⚡ Client WS disconnected");
        });

        ws.once("error", () => {
          ws.removeAllListeners();
          ws.close();
          Logger.error("Failed to connect HMR ⚡ client");
        });
      });

      Logger.success("HMR ⚡ client WSS configured");
    } catch (err) {
      Logger.error("Failed to start HMR ⚡ client WSS");
      console.error(err);
    }
  }

  async close() {
    try {
      this.wss!.clients.forEach((client) => {
        client.removeAllListeners();
      });
      this.wss!.removeAllListeners();
      this.wss!.close();
      Logger.info("HMR ⚡ client WSS closed successfully");
    } catch (err) {
      Logger.error("Failed to close HMR ⚡ client WSS");
      console.error(err);
    }
  }

  private sendToClient(data: HMRClientWebSocketMessage) {
    if (!this.wss?.clients.size) {
      Logger.warning("No client connected to HMR ⚡ WSS");
    }
    // Hot reload all client including the Salla control & preview page
    [...this.wss!.clients].forEach((client, i) => {
      if (client.OPEN) {
        client.send(JSON.stringify(data), (err) => {
          if (err) {
            Logger.error(`[c${i}] Failed to hot reload ⚡ (app.css)`);
          } else {
            Logger.success(`[c${i}] (app.css) hot reloaded ⚡`);
          }
        });
      }
    });
  }

  async cssHMR() {
    this.sendToClient({ action: "css-hmr", data: null });
  }

  // async jsHMR(data: unknown) {
  //   this.sendToClient({ action: "js-hmr", data });
  // }
}
