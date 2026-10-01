// Resource route: `/gate` returns a plain static HTML document with its own
// password screen. It imports, renders and references NONE of the letter's
// copy or content — a visitor who never enters the password receives zero words
// of the letter in any response here.

import type { Route } from "./+types/gate";
import { redirect } from "react-router";
import {
  ROBOTS,
  isUnlocked,
  passwordMatches,
  unlockCookie,
} from "~/lib/gate.server";

function gateHtml(showError: boolean): string {
  const error = showError
    ? `<p class="error">That's not it. Try again.</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="robots" content="noindex, nofollow">
  <title>A Note for Martha</title>
  <link rel="icon" type="image/png" href="/am-favicon.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/am-favicon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@300;400;500&display=swap" rel="stylesheet">
  <style>
    @font-face {
      font-family: 'EditorsNote';
      src: url('/assets/fonts/EditorsNote-Regular.woff') format('woff');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }
    *, *::before, *::after { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      background: #3B3B3B;
      color: #FBF6F4;
      color-scheme: light;
      font-family: 'Public Sans', sans-serif;
      font-weight: 300;
      -webkit-font-smoothing: antialiased;
    }
    .gate {
      min-height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px 32px;
    }
    .gate-inner {
      width: 100%;
      max-width: 384px;
    }
    .label {
      font-size: 11px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      opacity: 0.6;
      margin: 0 0 32px 0;
    }
    .heading {
      font-family: 'EditorsNote', serif;
      font-weight: 300;
      font-size: 46px;
      line-height: 1.1;
      margin: 0 0 14px 0;
    }
    .sub {
      font-size: 16px;
      font-weight: 300;
      opacity: 0.72;
      margin: 0 0 44px 0;
    }
    .field-label {
      display: block;
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      opacity: 0.6;
      margin: 0 0 12px 0;
    }
    .field {
      width: 100%;
      background: transparent;
      border: none;
      border-bottom: 1px solid rgba(251, 246, 244, 0.4);
      border-radius: 0;
      color: #FBF6F4;
      font-family: 'Public Sans', sans-serif;
      font-size: 18px;
      font-weight: 300;
      padding: 10px 0;
      outline: none;
      transition: border-color 0.25s ease;
    }
    .field:focus { border-bottom-color: #F4B69A; }
    .error {
      font-size: 14px;
      font-weight: 400;
      color: #F4B69A;
      margin: 18px 0 0 0;
    }
    .submit {
      display: block;
      width: 100%;
      margin-top: 40px;
      background: #FBF6F4;
      color: #3B3B3B;
      border: none;
      border-radius: 0;
      font-family: 'Public Sans', sans-serif;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 17px 24px;
      cursor: pointer;
      transition: background 0.25s ease, color 0.25s ease;
    }
    .submit:hover { background: #F4B69A; color: #3B3B3B; }
    @media (max-width: 480px) {
      .heading { font-size: 38px; }
    }
  </style>
</head>
<body>
  <main class="gate">
    <div class="gate-inner">
      <p class="label">A Note for Martha</p>
      <h1 class="heading">This one's private.</h1>
      <p class="sub">Enter the password to continue.</p>
      <form method="post" action="/gate" autocomplete="off">
        <label class="field-label" for="password">Password</label>
        <input class="field" type="password" id="password" name="password" autocomplete="off" autofocus required>
        ${error}
        <button class="submit" type="submit">Continue</button>
      </form>
    </div>
  </main>
</body>
</html>`;
}

const htmlHeaders = {
  "content-type": "text/html; charset=utf-8",
  "x-robots-tag": ROBOTS,
};

export async function loader({ request }: Route.LoaderArgs) {
  // Already unlocked? Skip the gate and go to the letter.
  if (isUnlocked(request)) {
    return redirect("/", { headers: { "x-robots-tag": ROBOTS } });
  }
  return new Response(gateHtml(false), { headers: htmlHeaders });
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  if (passwordMatches(form.get("password"))) {
    return redirect("/", {
      headers: {
        "set-cookie": unlockCookie(),
        "x-robots-tag": ROBOTS,
      },
    });
  }
  // Mismatch: re-render the gate with a short message. No other explanation,
  // and the correct password is never sent to the browser.
  return new Response(gateHtml(true), { status: 401, headers: htmlHeaders });
}
