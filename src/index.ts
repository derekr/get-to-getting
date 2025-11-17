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

const app = new Hono();

/**
 * Index of all the example routes.
 */
app.get("/", (c) => {
  return c.text("Hello Hono!");
});

/**
 * How to implement filtering using Multi Page Application routing. This route uses
 * view transitions to mask the full page refresh.
 *
 * 1. Initially server renders from with filters populating any fields based on present query params.
 * 2. User interacts with form.
 * 3. Use JS to handle input change (or not).
 * 4. Form submits to the same resource w/ method="get"
 * 5. Go back to 1.
 */
app.get("/search-plain", (c) => {
  return c.text("Search plain!");
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
  return c.text("Search update url client-side!");
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
