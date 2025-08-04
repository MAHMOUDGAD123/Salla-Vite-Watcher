export class CSSHotReloader {
  private readonly loadingLinks = new Map();
  private readonly cssFileName = "app.css";

  async reloadCSS() {
    HMRLoading.showLoading();
    const timer = new Timer();

    const existingLink = document.head.querySelector(
      `link[rel='stylesheet'][href*='${this.cssFileName}']`
    ) as HTMLLinkElement;

    // If not exists | Prevent multiple reloads of same file
    if (!existingLink || this.loadingLinks.has(this.cssFileName)) return;

    this.loadingLinks.set(this.cssFileName, true);

    const newLink = document.createElement("link");
    newLink.rel = "stylesheet";

    // Just copy the href of the old style link
    const originalUrl = new URL(existingLink.href);
    originalUrl.searchParams.set("v", Date.now().toString());
    newLink.href = originalUrl.toString();

    newLink.onload = () => {
      // Successfully loaded new CSS
      existingLink.remove();
      this.loadingLinks.delete(this.cssFileName);
      HMRLoading.hideLoading();

      console.log(
        `%cSalla HMR%c app.css %chot reloaded %c(${duration}) ⚡`,
        "border: 1px solid #ffd52d; color: #ffd52d; padding: 2px 5px; border-radius: 5px;",
        "color: #BD34FE;",
        "color: #FFDD35;",
        "color: #FFA800;"
      );
    };

    // Insert new link after existing one
    existingLink.parentNode!.insertBefore(newLink, existingLink.nextSibling);

    const duration = timer.duration;

    return duration;
  }
}

// Timer
export class Timer {
  #start: number;

  constructor() {
    this.#start = performance.now();
  }

  private formatDuration(ms: number) {
    if (ms < 1000) {
      return ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(1)}ms`;
    }

    const seconds = (ms / 1000).toFixed(2);
    return `${seconds}s`;
  }

  get duration(): string {
    return this.formatDuration(performance.now() - this.#start);
  }
}

class HMRLoading {
  private static loadingIconEle: HTMLDivElement;

  static showLoading() {
    if (document.querySelector(".hmr-loader")) return;

    this.loadingIconEle = document.createElement("div");

    this.loadingIconEle.innerHTML = `<svg width="35px" height="35px" viewBox="0 0 24.00 24.00" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="24.00" height="24.00" rx="12" fill="#41D1FF30"></rect><path d="M11.5 13.8H10.1299C8.72143 13.8 8.01721 13.8 7.72228 13.3385C7.42735 12.8769 7.72321 12.2379 8.31493 10.9597L11.0463 5.06006C11.4205 4.25182 11.6075 3.8477 11.8038 3.89091C12 3.93413 12 4.37946 12 5.27013V9.7C12 9.9357 12 10.0536 12.0732 10.1268C12.1464 10.2 12.2643 10.2 12.5 10.2H13.8701C15.2786 10.2 15.9828 10.2 16.2777 10.6615C16.5726 11.1231 16.2768 11.7621 15.6851 13.0402L12.9537 18.9399C12.5795 19.7482 12.3925 20.1523 12.1962 20.1091C12 20.0659 12 19.6205 12 18.7299V14.3C12 14.0643 12 13.9464 11.9268 13.8732C11.8536 13.8 11.7357 13.8 11.5 13.8Z" fill="#FFA800"><animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite"/></path></svg>`;
    this.loadingIconEle.style.position = "fixed";
    this.loadingIconEle.style.bottom = "10px";
    this.loadingIconEle.style.right = "10px";
    this.loadingIconEle.className = "hmr-loader";

    document.body.appendChild(this.loadingIconEle);
  }

  static hideLoading() {
    setTimeout(() => this.loadingIconEle.remove(), 100);
  }
}

type ClientPorts = { assetsPort: number; hmrPort: number };
type EventMessage = {
  action: "setup-hmr" | "css-hmr" | "js-hmr";
  data: unknown;
};

/**
 * This funciton will setup the HMR WebSocket
 * to receive HMR message from the server
 */
export const prepareHMRWS = async () => {
  const wsPort = 55555;
  const connection = new WebSocket(`ws://localhost:${wsPort}`);
  const cssreHotReloader = new CSSHotReloader();
  const clientPorts: ClientPorts = {
    assetsPort: 0,
    hmrPort: 0,
  };

  connection.addEventListener(
    "open",
    (_event) => {
      console.log(
        `%cSalla HMR%c Connected to WebSocket on port -> %c${wsPort}`,
        "border: 1px solid #ffd52d; color: #ffd52d; padding: 2px 5px; border-radius: 5px;",
        "color: #ffd52d;",
        "color: #ff822d;"
      );

      // Close the ws on page unload
      window.addEventListener(
        "beforeunload",
        () => {
          connection.close();
        },
        { once: true }
      );

      // connection.send(`HMR Client ws connected`);
    },
    { once: true }
  );

  connection.addEventListener("message", async (event) => {
    const eventMsg: EventMessage = JSON.parse(event.data);

    switch (eventMsg.action) {
      case "setup-hmr": {
        const ports = eventMsg.data as ClientPorts;
        clientPorts.assetsPort = ports.assetsPort;
        clientPorts.hmrPort = ports.hmrPort;
        connection.send("Client HMR setup is done ⚡");
        break;
      }
      case "css-hmr": {
        // const timer = new Timer();
        await cssreHotReloader.reloadCSS();
        // connection.send(`Client HMR ⚡ done in -> (${timer.duration})`);
        break;
      }
      case "js-hmr": {
        break;
      }
    }
  });

  connection.addEventListener(
    "close",
    (_event) => {
      console.log(
        "%cSalla HMR%c Connection to HMR WebSocket has closed",
        "border: 1px solid #ffd52d; color: #ffd52d; padding: 2px 5px; border-radius: 5px;",
        "color: #ffd52d;"
      );
    },
    { once: true }
  );
};
