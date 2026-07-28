import WebSocket from "ws";

const targets = await fetch("http://127.0.0.1:9333/json/list").then((response) => response.json());
const page = targets.find((target) => target.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => ws.once("open", resolve));
let id = 0;
const pending = new Map();
ws.on("message", (raw) => {
  const message = JSON.parse(String(raw));
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, (message) => {
      if (message.error) {
        reject(new Error(message.error.message));
        return;
      }
      resolve(message.result);
    });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
}
await send("Runtime.enable");
const body = await send("Runtime.evaluate", { expression: "document.body.innerText.slice(0, 5000)", returnByValue: true });
const buttons = await send("Runtime.evaluate", {
  expression: `JSON.stringify(Array.from(document.querySelectorAll("button")).map((button) => ({ text: button.textContent?.trim(), label: button.getAttribute("aria-label") })))`,
  returnByValue: true
});
const status = await send("Runtime.evaluate", {
  expression: "window.levi.execution.getStatus()",
  awaitPromise: true,
  returnByValue: true
});
console.log(JSON.stringify({ body: body.result.value, buttons: JSON.parse(buttons.result.value), status: status.result.value }, null, 2));
ws.close();
