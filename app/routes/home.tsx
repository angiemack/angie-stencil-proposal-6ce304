// Resource route: `/` returns a plain static HTML document. No default
// component is exported, so React Router returns this Response directly and
// never renders the root React layout around it — no framework, no hydration.

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta property="og:image" content="/assets/og-preview.png">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1024">
  <meta property="og:image:height" content="1024">
  <meta property="twitter:image" content="/assets/og-preview.png">
  <meta property="twitter:card" content="summary_large_image">
  <title>A Note For Martha | Angie McPherson</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Public+Sans:wght@300;400&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      background: #FBF6F4;
      color: #3B3B3B;
      font-family: 'Public Sans', sans-serif;
      font-weight: 300;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      max-width: 680px;
      margin: 0 auto;
      padding: 140px 32px 120px 32px;
    }
    .body-p {
      font-family: 'Public Sans', sans-serif;
      font-size: 17px;
      font-weight: 300;
      line-height: 1.85;
      margin-bottom: 28px;
      color: #3B3B3B;
    }
    @media (max-width: 600px) {
      .wrapper { padding: 72px 24px 80px 24px; }
      .headline { font-size: 42px !important; }
      .offer-card { padding: 40px 28px !important; }
      .evidence-row { flex-direction: column !important; }
      .price-line { font-size: 26px !important; }
    }
  </style>
</head>
<body>
<div class="wrapper">

  <!-- Kicker -->
  <p style="font-family:'Public Sans',sans-serif;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.55;margin:0 0 48px 0;">AUGUST 2026</p>

  <!-- Salutation -->
  <p style="font-family:'Cormorant Garamond',serif;font-size:52px;font-weight:300;line-height:1.1;margin:0 0 56px 0;">Martha,</p>

  <!-- Body paragraphs -->
  <p class="body-p">I really enjoyed our conversations about Stencil last week. I had an idea afterward that I wanted to share with you.</p>

  <p class="body-p">For the past few months I've been teaching entrepreneurs how to build with AI. I've spent that time watching where they hesitate, where they get stuck, and what finally gives them the confidence to keep going. Along the way, I've introduced more than 150 entrepreneurs to the platform I currently teach.</p>

  <p class="body-p">It made me wonder whether that perspective could be useful as you continue shaping Stencil.</p>

  <p class="body-p">So I sketched out what that could look like.</p>

  <!-- Offer card -->
  <div class="offer-card" style="background:#FFFFFF;border:1px solid #3B3B3B;border-radius:0;padding:56px 64px 64px 64px;margin:48px 0 56px 0;">
    <p style="font-family:'Public Sans',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.55;margin:0 0 20px 0;">ONE SIMPLE WAY TO START</p>
    <h2 style="font-family:'Cormorant Garamond',serif;font-size:36px;font-weight:300;margin:0 0 10px 0;">Strategic Advisor</h2>
    <p style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:18px;font-weight:300;margin:0 0 36px 0;">A three-month engagement</p>
    <p class="body-p" style="margin-bottom:16px;">Build real tools in Stencil to see what works, where people get stuck, and what could be even better.</p>
    <p class="body-p" style="margin-bottom:16px;">Test new features through the lens of the entrepreneurs I teach.</p>
    <p class="body-p" style="margin-bottom:16px;">Bring what I'm seeing firsthand from teaching entrepreneurs into product conversations.</p>
    <p class="body-p" style="margin-bottom:48px;">Ongoing working sessions with you and the team throughout the engagement.</p>
    <p class="price-line" style="font-family:'Cormorant Garamond',serif;font-size:40px;font-weight:300;margin:0;white-space:nowrap;">$5,000/month · 3 months</p>
  </div>

  <!-- Closing paragraphs -->
  <p class="body-p">Longer term, I also see an opportunity to help more entrepreneurs discover Stencil through education, workshops, and practical examples of what's possible. I'd love to explore that with you when the timing feels right.</p>

  <p class="body-p">If this feels like the right direction, I'd love to continue the conversation.</p>

  <!-- Signature -->
  <p style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:36px;font-weight:300;margin:48px 0 40px 0;">XO, Angie</p>

  <!-- Mailto link -->
  <a href="mailto:angie@mcphersonphotos.com" style="font-family:'Public Sans',sans-serif;font-size:15px;font-weight:300;color:#3B3B3B;text-decoration:none;border-bottom:1px solid #F4B69A;padding-bottom:2px;display:inline-block;">Let's talk about it →</a>

</div>
<script>
  const els = document.querySelectorAll('.wrapper > *');
  els.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(14px)';
    el.style.transition = 'opacity 0.65s ease, transform 0.65s ease';
  });
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.08 });
  els.forEach(el => obs.observe(el));
</script>
</body>
</html>`;

export function loader() {
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
