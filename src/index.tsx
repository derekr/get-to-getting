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
import { ServerSentEventGenerator as SSE } from "@starfederation/datastar-sdk/web";
import { Database } from "bun:sqlite";

/**
 * Database and shared setup.
 */
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

  return { size, query };
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
function getAllFilteredProducts(query: string | null, size: Size): Product[] {
  const formattedQuery = query ? `%${query}%` : null;

  return filter.all(formattedQuery, formattedQuery, size);
}

for (let i = 0; i < 100; i++) {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const title = `${adjective} ${noun} ${i + 1}`;
  const size = sizes[Math.floor(Math.random() * sizes.length)]!;
  insert.run(title, size);
}

/**
 * Helpers
 */
function buildFilterUrl(
  baseUrl: string,
  query: string | null,
  size: Size,
): string {
  const formattedQuery = query ? `&query=${encodeURIComponent(query)}` : "";
  return `${baseUrl}?size=${size}${formattedQuery}`;
}

/**
 * Components/partials
 */
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
 * Web server setup
 */
const app = new Hono();

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
 * leverages Datastar simply to wire up an event to submit the form on select change to
 * illustrate improved DX even with MPA approach.
 *
 * 1. Initially server renders from with filters populating any fields based on present query params.
 * 2. User interacts with form.
 * 3. Use JS to handle input change (or not).
 * 4. Form submits to the same resource w/ method="get"
 * 5. Go back to 1.
 *
 * Remember that query params likely modify the resource being requested so a full page load
 * or navigation is correct and the most simple to reason about.
 */
app.get("/search-mpa", (c) => {
  const { size, query } = parseFilterInput({
    size: c.req.query("size"),
    query: c.req.query("query"),
  });

  let filteredProducts = getAllFilteredProducts(query, size);

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
 * ⚠️ You have state divergence now and filtering logic is leaked in to your front end code. You just accidentally created a SPA.
 * It's probably fine, but you're in charge of updating the browser history and making sure back/forward nav works.
 * Also your filtering/URL is coupled to your fields and you're likely recreating logic for how a filter URL is generated, on server and client now.
 * Ideally the server remains the source of truth of what a valid URL is and the client can just render
 * whatever the server provides.
 */
app.get("/search-update-url-client-side", (c) => {
  const { size, query } = parseFilterInput({
    size: c.req.query("size"),
    query: c.req.query("query"),
  });

  let filteredProducts = getAllFilteredProducts(query, size);

  // ℹ️ We can't let the server drive the URL in this example. If you were to build the URL now and interpolate it in these expressions
  // they'd be operating on the original request state and not based on user interactions. You're forced to duplicate URL building to some degree.
  const updateQueryParams = `window.history.replaceState({}, '', new URL(window.location.pathname+'?size='+$size+'&query='+$query, window.location.href).toString())`;
  const getFilteredProducts = `@get('/search-update-url-client-side?size='+$size+'&query='+$query)`;

  let header = (
    <form
      data-signals:size={`'${size}'`}
      data-signals:query={`'${query ?? ""}'`}
      data-on:input={`evt.target.form.requestSubmit()`}
      data-on:submit={`evt.preventDefault && ${getFilteredProducts} && ${updateQueryParams}`}
    >
      <FilterFields size={size} query={query ?? ""} />
    </form>
  );
  const isFragment = c.req.header("datastar-request") === "true";

  if (isFragment) {
    return SSE.stream((stream) => {
      stream.patchElements(
        (
          <body>
            {header}
            <Products products={filteredProducts} />
          </body>
        ).toString(),
      );

      return;
    });
  }

  return c.html(
    <Root>
      {header}
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
 *
 * ℹ️ You could render the link in the previous example, but that illustrates the point about
 * duplicating URL logic. In this example the updated URL is centralized/owned by the server so it
 * will remain consistent whether rendering a link or a script that updates the URL when patched in.
 */
app.get("/search-server-patch", (c) => {
  const { size, query } = parseFilterInput({
    size: c.req.query("size"),
    query: c.req.query("query"),
  });

  let filteredProducts = getAllFilteredProducts(query, size);

  const filterUrl = buildFilterUrl(c.req.path, query, size);

  const getFilteredProducts = `@get('${c.req.path}?size='+$size+'&query='+$query)`;

  let header = (
    <>
      <form
        data-signals:size={`'${size}'`}
        data-signals:query={`'${query ?? ""}'`}
        data-on:input={`evt.target.form.requestSubmit()`}
        data-on:submit={`evt.preventDefault && ${getFilteredProducts}`}
      >
        <FilterFields size={size} query={query ?? ""} />
      </form>
      <a href={filterUrl} style={{ display: "block", paddingBottom: "20px" }}>
        Bookmark or share
      </a>
    </>
  );
  const isFragment = c.req.header("datastar-request") === "true";

  if (isFragment) {
    return SSE.stream((stream) => {
      stream.patchElements(
        (
          <body>
            {header}
            <Products products={filteredProducts} />
          </body>
        ).toString(),
      );

      // ℹ️ Here we are controlling the url that gets updated in the browser from the server. It's subtle especially when
      // it doesn't look or feel that different from updating on the client, but decoupling from the signals in the client
      // means we have a single source of truth for what the filter url is and how it is built.
      stream.executeScript(
        `window.history.replaceState({}, '', new URL('${filterUrl}', window.location.href).toString())`,
      );

      return;
    });
  }

  return c.html(
    <Root>
      {header}
      <Products products={filteredProducts} />
    </Root>,
  );
});

/**
 * TODO: Will get around to these later.
 *
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

// TODO: expand on sessions w/ per session/page projection/db of data for filter

export default app;
