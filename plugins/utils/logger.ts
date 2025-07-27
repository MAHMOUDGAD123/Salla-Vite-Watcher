export class Logger {
  private static readonly colorMap = new Map([
    ["info", 46],
    ["success", 42],
    ["warning", 43],
    ["error", 41],
    ["debug", 45],
  ]);

  private static logMsg(
    type: "info" | "success" | "warning" | "error" | "debug",
    msg: string,
    clear: boolean
  ) {
    const notDebug = process.env.NODE_ENV !== "debug";
    if (type === "debug" && notDebug) return;
    if (clear && notDebug) console.clear();

    const col = this.colorMap.get(type)!;

    console.log(
      `\n\x1b[1m\x1b[${col}m SALLA VITE \x1b[0m \x1b[30m[${new Date().toLocaleTimeString()}]\x1b[0m \x1b[${col - 10}m${msg}\x1b[0m`
    );
  }

  static info(msg: string, clear: boolean = false) {
    this.logMsg("info", msg, clear);
  }

  static success(msg: string, clear: boolean = false) {
    this.logMsg("success", msg, clear);
  }

  static warning(msg: string, clear: boolean = false) {
    this.logMsg("warning", msg, clear);
  }

  static error(msg: string, clear: boolean = false) {
    this.logMsg("error", msg, clear);
  }

  static debug(msg: string, clear: boolean = false) {
    this.logMsg("debug", msg, clear);
  }

  static line() {
    // Print only on debug mode
    if (process.env.NODE_ENV === "debug") {
      console.log(
        "\n\x1b[37m-----------------------------------------------------------------\x1b[0m"
      );
    }
  }
}
