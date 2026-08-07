import { redirect } from "react-router";
import type { Route } from "./+types/app";

// The letter is a single public page. Anything that lands on /app goes there.
export function loader(_: Route.LoaderArgs) {
  return redirect("/");
}
