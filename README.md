# HTTP From Scratch: To-do API

A to-do REST API built to understand what a web server does underneath a framework. It exists in two versions:

- **Raw:** only Node's built-in `node:http` module. Routing, JSON body parsing, status codes and error handling are all written by hand.
- **Express:** the same API rebuilt with Express, to show exactly what a framework removes.

Data is stored in memory, so it resets when the server restarts.

## What it does

| Method | Path         | Purpose                                            |
| ------ | ------------ | -------------------------------------------------- |
| GET    | `/todos`     | List to-dos. Supports `?done=true` and `?limit=10` |
| POST   | `/todos`     | Create a to-do                                     |
| GET    | `/todos/:id` | Get one to-do                                      |
| PATCH  | `/todos/:id` | Update part of a to-do                             |
| DELETE | `/todos/:id` | Delete a to-do                                     |

Also included:

- CORS headers and `OPTIONS` preflight handling, tested from a small React page
- A request logger that prints `method path status duration` for every request
- One consistent JSON error shape: `{ "error": "message" }`

## Run it

Requires Node.js LTS, pnpm, and a bash shell with curl (Git Bash on Windows).

```bash
pnpm install
pnpm tsx src/server.ts
```

The server listens on http://127.0.0.1:3000

```bash
curl localhost:3000/todos

curl -X POST localhost:3000/todos \
  -H "Content-Type: application/json" \
  -d '{"text":"learn http"}'

curl -X PATCH localhost:3000/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"done":true}'

curl -X DELETE localhost:3000/todos/1
```

## Hardening: how the server handles hostile input

After the API worked, I attacked it on purpose with eight kinds of bad input. A server should answer each with a clear client error and keep running. All eight are in the reproduce script below.

| #   | Attack                                        | Why it matters                                                                 | Response                                   |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------ |
| 1   | POST with no body                             | Handlers that assume a body exists crash on `undefined`                        | `400` with a JSON error                    |
| 2   | Wrong types, e.g. `{"text":123,"done":"yes"}` | A TypeScript type is not a runtime check, so bad data would be stored silently | `400`, validated field by field            |
| 3   | Invalid JSON, e.g. `{bad`                     | `JSON.parse` throws, and an uncaught throw can take the process down           | `400` with a JSON error, not a stack trace |
| 4   | Wrong `Content-Type` (`text/plain`)           | The server should only parse bodies it was told are JSON                       | `415 Unsupported Media Type`               |
| 5   | Wrong method, e.g. `PUT /todos`               | The path exists but not for that method, which is different from "not found"   | `405 Method Not Allowed`                   |
| 6   | 5 MB body                                     | Without a limit, one client can exhaust memory                                 | `413 Payload Too Large`, limit set to 1 MB |
| 7   | 100 requests in a loop                        | Checks for crashes, leaks or odd statuses under a burst                        | All `200`, no slowdown                     |
| 8   | Client disconnects mid-upload                 | A request that never finishes must not hang or leave half-saved data           | Server stays up, nothing is stored         |

### Reproduce it

Start the server, then run:

```bash
URL=localhost:3000/todos
JSON="Content-Type: application/json"
code() { curl -s -o /dev/null -w "%{http_code}\n" "$@"; }

echo "1 no body (expect 400):";        code -X POST $URL -H "$JSON"
echo "2 wrong types (expect 400):";    code -X POST $URL -H "$JSON" -d '{"text":123,"done":"yes"}'
echo "3 invalid JSON (expect 400):";   code -X POST $URL -H "$JSON" -d '{bad'
echo "4 wrong type (expect 415):";     code -X POST $URL -H "Content-Type: text/plain" -d 'hello'
echo "5 wrong method (expect 405):";   code -X PUT $URL

head -c 5M /dev/zero > big.json
echo "6 5 MB body (expect 413):";      code -X POST $URL -H "$JSON" --data-binary @big.json
rm big.json

echo "7 100 requests (expect: 100 200):"
for i in {1..100}; do code $URL; done | sort | uniq -c

echo "8 disconnect mid-body:"
head -c 500K /dev/zero | tr '\0' 'a' > slow.json
curl -s --limit-rate 1k --max-time 3 -X POST $URL -H "$JSON" --data-binary @slow.json
rm slow.json
echo "server still alive (expect 200):"; code $URL
```

For attack 8, curl uploads at about 1 KB/s and gives up after 3 seconds. The server must survive, and `curl localhost:3000/todos` must not show a half-received item.

## Event loop experiment

Node runs JavaScript on a single thread. I tested what that means in practice with two routes that both take 5 seconds:

- **Synchronous busy-wait:** every other request waited until the loop finished, so the whole server was frozen.
- **`await` on a timer:** other requests were served normally in the meantime.

To reproduce it, add a route that calls a synchronous 5-second loop and run:

```bash
# terminal A
curl localhost:3000/block-sync

# terminal B, immediately after
time curl localhost:3000/todos
```

With the sync loop, terminal B waits about 5 seconds. With `await sleep(5000)` it answers instantly. The takeaway: CPU-heavy work inside a request handler blocks every other user, which is why later projects move such work into background workers.

## Raw vs Express

Rebuilding the API in Express showed what a framework removes: manual route matching, reading the body from the request stream chunk by chunk, JSON parsing and size limits, setting `Content-Type` and `Content-Length`, and writing status lines. The full comparison and my design choices are in [DECISIONS.md](DECISIONS.md).

## What I learned

- What an HTTP request and response look like on the wire (`curl -v`, browser DevTools)
- Why status codes and one consistent error shape matter to API clients
- How to enforce limits and validate input at the server boundary
- How the single-threaded event loop behaves under blocking and non-blocking work
