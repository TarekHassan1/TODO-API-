import { createServer, IncomingMessage, ServerResponse } from "node:http";

const hostname = "127.0.0.1";
const port = 3000;

interface todo {
  text: string;
  done: boolean;
}

const todos: todo[] = [];

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  // --- Logger Middleware Setup ---
  const startTime = Date.now();
  const parsedUrl = new URL(req.url || "", `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  const searchParams = parsedUrl.searchParams;
  const method = req.method;

  // This event triggers automatically once the response has been fully sent to the client
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    console.log(
      `[${method}] ${pathname} - Status: ${res.statusCode} - ${duration}ms`,
    );
  });

  // -----------------------------

  // --- 1. GET /todos (Get all todos with optional query params) ---
  if (method === "GET" && pathname === "/todos") {
    let result = [...todos];

    const doneQuery = searchParams.get("done");
    if (doneQuery !== null) {
      const isDone = doneQuery === "true";
      result = result.filter((t) => t.done === isDone);
    }

    const limitQuery = searchParams.get("limit");
    if (limitQuery !== null) {
      const limit = parseInt(limitQuery, 10);
      if (!isNaN(limit) && limit >= 0) {
        result = result.slice(0, limit);
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ todos: result }));
    return;
  }

  // --- 2. GET /todos/:id (Get a single todo) ---
  const getMatch = pathname.match(/^\/todos\/(\d+)$/);
  if (method === "GET" && getMatch) {
    const index = parseInt(getMatch[1], 10);

    if (index >= 0 && index < todos.length) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: index, todo: todos[index] }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Todo not found" }));
    }
    return;
  }

  // --- 3. POST /todos (Create a todo) ---
  if (method === "POST" && pathname === "/todos") {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const parsedData: { text?: string; done?: boolean } = JSON.parse(body);

        if (!parsedData.text) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Todo text is required" }));
          return;
        }

        const newTodo: todo = {
          text: parsedData.text,
          done: parsedData.done ?? false,
        };

        todos.push(newTodo);

        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "Todo added successfully!",
            todo: newTodo,
          }),
        );
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON payload" }));
      }
    });
    return;
  }

  // --- 4. PATCH /todos/:id (Update a todo partially) ---
  const patchMatch = pathname.match(/^\/todos\/(\d+)$/);
  if (method === "PATCH" && patchMatch) {
    const index = parseInt(patchMatch[1], 10);

    if (index < 0 || index >= todos.length) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Todo not found" }));
      return;
    }

    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const parsedData: { text?: string; done?: boolean } = JSON.parse(body);
        const currentTodo = todos[index];

        if (parsedData.text !== undefined) {
          currentTodo.text = parsedData.text;
        }
        if (parsedData.done !== undefined) {
          currentTodo.done = parsedData.done;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "Todo updated successfully!",
            todo: currentTodo,
          }),
        );
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON payload" }));
      }
    });
    return;
  }

  // --- 5. DELETE /todos/:id (Delete a todo) ---
  const deleteMatch = pathname.match(/^\/todos\/(\d+)$/);
  if (method === "DELETE" && deleteMatch) {
    const index = parseInt(deleteMatch[1], 10);

    if (index < 0 || index >= todos.length) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Todo not found" }));
      return;
    }

    const deletedTodo = todos.splice(index, 1)[0];

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        message: "Todo deleted successfully!",
        deletedTodo,
      }),
    );
    return;
  }

  // --- 6. 404 Fallback ---
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
