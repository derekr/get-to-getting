/**
 * Example applicaiton demonstrating the various approaches to managing query params.
 *
 * The goal is to illustrate trade offs implemeting a search or filter UX and sticking
 * with regular server routing all the way through sessionizing a search.
 *
 * We'll reason about things like sharability, bookmarkability and the notion of URL as state.
 *
 * We'll explore the pitfalls of updating the URL based on user interactions and how to
 * avoid accidentally building a Single Page Application.
 */
import { Hono } from "hono";
import type { PropsWithChildren } from "hono/jsx";

import { Database } from "bun:sqlite";

type Size = "small" | "medium" | "large";

function parseFilterInput(input: {
  size?: string | null;
  query?: string | null;
}) {
  let size: Size = "small";

  if (input.size) {
    const isValid =
      input.size === "small" ||
      input.size === "medium" ||
      input.size === "large";
    if (isValid) {
      size = input.size as Size;
    }
  }

  const query = input.query ?? null;
  const queryPattern = query ? `%${query}%` : null;

  return { size, query, queryPattern };
}

class Product {
  id: number;
  title: string;
  size: string;

  constructor(id: number, title: string, size: string) {
    this.id = id;
    this.title = title;
    this.size = size;
  }
}

// Setup sample database
const db = new Database(":memory:");

// Create products table
db.run(`
  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    size TEXT NOT NULL
  )
`);

// Inject 100 records with random size and title fields
const sizes: Size[] = ["small", "medium", "large"];
const adjectives = [
  "Amazing",
  "Fantastic",
  "Great",
  "Super",
  "Awesome",
  "Cool",
  "Nice",
  "Premium",
  "Deluxe",
  "Ultimate",
];
const nouns = [
  "Widget",
  "Gadget",
  "Tool",
  "Device",
  "Item",
  "Product",
  "Thing",
  "Gizmo",
  "Contraption",
  "Apparatus",
];

const insert = db.prepare("INSERT INTO products (title, size) VALUES (?, ?)");
const filter = db
  .query(
    "SELECT * FROM products WHERE (? IS NULL OR LOWER(title) LIKE LOWER(?)) AND size = ?",
  )
  .as(Product);

for (let i = 0; i < 100; i++) {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const title = `${adjective} ${noun} ${i + 1}`;
  const size = sizes[Math.floor(Math.random() * sizes.length)]!;
  insert.run(title, size);
}

const app = new Hono();

function Root(props: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        <title>Query Params Example</title>
        <script
          type="module"
          src="https://cdn.jsdelivr.net/gh/starfederation/datastar@1.0.0-RC.6/bundles/datastar.js"
        />
      </head>
      <body>{props.children}</body>
    </html>
  );
}

function FilterFields(props: { size: Size; query: string }) {
  return (
    <>
      <label>
        Size:
        <select name="size" data-bind="size">
          <option value="">All</option>
          <option value="small" selected={props.size === "small"}>
            Small
          </option>
          <option value="medium" selected={props.size === "medium"}>
            Medium
          </option>
          <option value="large" selected={props.size === "large"}>
            Large
          </option>
        </select>
      </label>
      <label>
        Search:
        <input
          type="text"
          name="query"
          value={props.query}
          placeholder="Search..."
          data-bind="query"
        />
      </label>
      <button type="submit">Search</button>
    </>
  );
}

function Products(props: { products: Product[] }) {
  return (
    <div>
      <h1>Products</h1>
      <ul>
        {props.products.map((product) => (
          <li key={product.id}>
            <a href={`/product/${product.id}`}>
              {product.title} | {product.size}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Index of all the example routes.
 */
app.get("/", (c) => {
  return c.html(
    <Root>
      <ul>
        <li>
          <a href="/search-mpa">Search Plain</a>
        </li>
        <li>
          <a href="/search-update-url-client-side">
            Search Update URL Client-Side
          </a>
        </li>
        <li>
          <a href="/search-server-patch">Search Server Patch</a>
        </li>
        <li>
          <a href="/search/sessions">Search Sessions</a>
        </li>
      </ul>
    </Root>,
  );
});

/**
 * How to implement filtering using Multi Page Application routing. This example still
 * leverages Datastar simply to wire up an event to submit the form on select change.
 *
 * 1. Initially server renders from with filters populating any fields based on present query params.
 * 2. User interacts with form.
 * 3. Use JS to handle input change (or not).
 * 4. Form submits to the same resource w/ method="get"
 * 5. Go back to 1.
 */
app.get("/search-mpa", (c) => {
  const { size, query, queryPattern } = parseFilterInput({
    size: c.req.query("size"),
    query: c.req.query("query"),
  });

  let filteredProducts = filter.all(queryPattern, queryPattern, size);

  return c.html(
    <Root>
      <form data-on:input="evt.target.type === 'select' ? evt.target.form.requestSubmit() : null">
        <FilterFields size={size} query={c.req.query("query") ?? ""} />
      </form>
      <Products products={filteredProducts} />
    </Root>,
  );
});

/**
 * You want all the benefits above, but don't like the whole page refreshing even with view transitions?
 * Coming from a Single Page App mindset?
 *
 * You're not alone. The instinct is to sync input values or client state to query params while getting
 * updated projection (html/json) from server based on the same input values or client state.
 *
 * ⚠️ You have state divergence now and filtering logic as leaked in to your front end code. You just created a SPA.
 * It's probably fine, but you're in charge of updating the browser history and making sure back/forward nav works.
 * Also your client code is coupled to your filtering/URL business logic and you're likely duplicating this on
 * the server. Ideally the server remains the source of truth of what a valid URL is and the client can just render
 * whatever the server provides.
 */
app.get("/search-update-url-client-side", (c) => {
  const { size, query, queryPattern } = parseFilterInput({
    size: c.req.query("size"),
    query: c.req.query("query"),
  });

  let filteredProducts = filter.all(queryPattern, queryPattern, size);

  let formEl = (
    <form
      data-signals:size={`'${size}'`}
      data-signals:query={`'${query ?? ""}'`}
      data-on:input={`evt.target.form.requestSubmit()`}
      data-on:submit={`evt.preventDefault && @get('/search-update-url-client-side?size='+$size+'&query='+$query) && window.history.replaceState({}, '', new URL(window.location.pathname+'?size='+$size+'&query='+$query, window.location.href).toString())`}
    >
      <FilterFields size={size} query={query ?? ""} />
    </form>
  );
  const isFragment = c.req.header("datastar-request") === "true";

  if (isFragment) {
    c.header("datastar-merge-mode", "morph_element");
    return c.html(
      <body>
        {formEl}
        <Products products={filteredProducts} />
      </body>,
    );
  }

  return c.html(
    <Root>
      {formEl}
      <Products products={filteredProducts} />
    </Root>,
  );
});

/**
 * You're on board with server being source of trugh, but still needing to avoid that full page refresh
 * even though it's probably chill with view transitions?
 * Want to avoid leaking business logic in to the client and tightly coupling your UI to query params?
 * Wanting to keep things stateless on the backend?
 *
 * This approach will take query params in as initial filter state that powers the rendering of
 * the form. Updating the form will send a get action and patch in the new UI based on form state
 * as well as a script for updating the URL with a value provided from the server.
 *
 * The server can also render things like links w/ query params so a user can right click that
 * to copy and share or bookmark. Maintaining the server as the source of truth for valid URLs.
 */
app.get("/search-server-patch", (c) => {
  return c.text("Search server patch no update url update!");
});

/**
 * You're really in to the idea of server authority and don't want to futz with updating
 * the the URL or thinking about browser history?
 * You're fine with moving more state to the backend?
 *
 * Instead of leveraging query params you can think of your resource as a search session.
 * By tokenizing the session you can maintain all filter state and pretty much anything you
 * want and associate with a given session.
 *
 * Users can revisit past searches. Share them. Bookmark them. You can even start to do
 * more advanced things like maintaining a db per page/session (materialized view of source data)
 * to make for really performant search operations. Lots of upsides to consider.
 *
 * You can even still use query params to jump start a search session and share those in some cases.
 */
app.get("/search/sessions", (c) => {
  return c.text("Search sessions!");
});

app.get("/search/sessions/:sessionId", (c) => {
  return c.text("Search sessions detail");
});

export default app;
