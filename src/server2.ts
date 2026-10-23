import express from "express";
import type { Request, Response, NextFunction } from "express";

const app = express();
const port = 3000;

interface Todo {
  text: string;
  done: boolean;
}

const todos: Todo[] = [];
app.use(express.json({ limit: "4mb" }));

// --- 1. Logger Middleware ---
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    console.log(
      `[${req.method}] ${req.path} Status: ${res.statusCode} ${duration}ms`,
    );
  });

  next();
});

// --- Content-Type Checker Middleware ---
app.use((req: Request, res: Response, next: NextFunction) => {
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const contentType = req.headers["content-type"];

    if (!contentType || !contentType.includes("application/json")) {
      return res.status(415).json({
        error: "Unsupported Media Type",
        message:
          "This server requires the 'Content-Type: application/json' header.",
      });
    }
  }

  next();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

app.get("/block", async (req: Request, res: Response) => {
  console.log("🔴 Blocking request started... Server thread is frozen.");
  await sleep(15000);
  console.log("🟢 Blocking request finished!");
  res.send("Finished 15-second blocking test!");
});

// --- Route Grouping for /todos ---
app
  .route("/todos")
  .get((req: Request, res: Response) => {
    let result = [...todos];

    const doneQuery = req.query.done as string | undefined;
    if (doneQuery !== undefined) {
      const isDone = doneQuery === "true";
      result = result.filter((t) => t.done === isDone);
    }

    const limitQuery = req.query.limit as string | undefined;
    if (limitQuery !== undefined) {
      const limit = parseInt(limitQuery, 10);
      if (!isNaN(limit) && limit >= 0) {
        result = result.slice(0, limit);
      }
    }

    res.status(200).json({ todos: result });
  })
  .post((req: Request, res: Response) => {
    const { text, done } =
      (req.body as { text?: string; done?: boolean }) || {};

    if (!text) {
      return res.status(400).json({ error: "Todo text is required" });
    }
    if (typeof done !== "boolean") {
      return res
        .status(400)
        .json({ error: "Wrong input, done can only be true or false" });
    }
    const newTodo: Todo = {
      text,
      done: done ?? false,
    };

    todos.push(newTodo);

    res.status(201).json({
      message: "Todo added successfully!",
      todo: newTodo,
    });
  })
  .all((req: Request, res: Response) => {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({
      error: "Method Not Allowed",
      message: `The ${req.method} method is not supported on /todos. Allowed methods: GET, POST`,
    });
  });

// --- Route Grouping for /todos/:id ---
app
  .route("/todos/:id")
  .get((req: Request, res: Response) => {
    const index = parseInt(req.params.id, 10);

    if (isNaN(index) || index < 0 || index >= todos.length) {
      return res.status(404).json({ error: "Todo not found" });
    }

    res.status(200).json({ id: index, todo: todos[index] });
  })
  .patch((req: Request, res: Response) => {
    const index = parseInt(req.params.id, 10);

    if (isNaN(index) || index < 0 || index >= todos.length) {
      return res.status(404).json({ error: "Todo not found" });
    }

    const { text, done } = req.body as { text?: string; done?: boolean };
    const currentTodo = todos[index];

    if (text !== undefined) {
      currentTodo.text = text;
    }
    if (done !== undefined) {
      currentTodo.done = done;
    }

    res.status(200).json({
      message: "Todo updated successfully!",
      todo: currentTodo,
    });
  })
  .delete((req: Request, res: Response) => {
    const index = parseInt(req.params.id, 10);

    if (isNaN(index) || index < 0 || index >= todos.length) {
      return res.status(404).json({ error: "Todo not found" });
    }

    const deletedTodo = todos.splice(index, 1)[0];

    res.status(200).json({
      message: "Todo deleted successfully!",
      deletedTodo,
    });
  })
  .all((req: Request, res: Response) => {
    res.setHeader("Allow", "GET, PATCH, DELETE");
    res.status(405).json({
      error: "Method Not Allowed",
      message: `The ${req.method} method is not supported on /todos/:id. Allowed methods: GET, PATCH, DELETE`,
    });
  });

// --- 404 Fallback Middleware ---
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Not Found" });
});

// --- Global Error Handler ---
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && "body" in err && err.status === 400) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Invalid JSON format. Please check your syntax and try again.",
    });
  }
  if (err.type === "entity.too.large" || err.status === 413) {
    return res.status(413).json({
      error: "Payload Too Large",
      message: "The request body exceeds the maximum allowed size limit.",
    });
  }
  if (err.type === "request.aborted" || err.code === "ECONNABORTED") {
    console.warn("⚠️ Client aborted request mid-stream.");
    return; // Do nothing else, connection is already dead
  }
  console.error("Unhandled error:", err);
  return res.status(500).json({
    error: "Internal Server Error",
    message: err.message || "Something went wrong on the server.",
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://127.0.0.1:${port}/`);
});
