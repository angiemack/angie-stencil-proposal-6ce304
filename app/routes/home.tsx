// Resource route: `/` returns a plain static HTML document. No default
// component is exported, so React Router returns this Response directly and
// never renders the root React layout around it — no framework, no hydration.

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>The Gap Stencil Can Own</title>
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
    }
  </style>
</head>
<body>
<div class="wrapper">

  <!-- 1. Kicker -->
  <p style="font-family:'Public Sans',sans-serif;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.55;margin:0 0 32px 0;">A WORKING IDEA · AUGUST 2026</p>

  <!-- 2. Headline -->
  <h1 class="headline" style="font-family:'Cormorant Garamond',serif;font-weight:300;font-size:64px;line-height:1.1;margin:0 0 56px 0;">The Gap Stencil<br><em style="font-style:italic;">Can Own</em></h1>

  <!-- 3. Salutation -->
  <p style="font-family:'Cormorant Garamond',serif;font-size:27px;font-weight:300;margin:0 0 40px 0;">Martha,</p>

  <!-- 4. Body paragraphs -->
  <p class="body-p">There's a whole group of business owners who have incredible ideas but still don't see themselves as people who can build software. That's the group I keep thinking about.</p>
  <p class="body-p">The opportunity I see for Stencil isn't simply helping people build software. It's helping people realize they're capable of building software in the first place.</p>

  <!-- 5. Pull quote -->
  <blockquote style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:30px;font-weight:300;line-height:1.55;border-left:2px solid #F4B69A;padding-left:32px;margin:64px 0;color:#3B3B3B;">The companies that win this category won't be the ones with the best AI. They'll be the ones who make normal people feel capable.</blockquote>

  <!-- 6. Transition -->
  <p style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:24px;font-weight:300;margin:80px 0 40px 0;color:#3B3B3B;">I keep coming back to one moment from our call.</p>

  <!-- 7. Body paragraphs -->
  <p class="body-p">By the end of it, Dan and Haggai were already mapping out the connector. Moments like that remind me how valuable the everyday builder's perspective can be while a product is still being shaped.</p>
  <p class="body-p">I've spent months turning how I build into a teachable process. When I taught it recently, 17 women went from learning it to building calculators, dashboards, and working tools that same day. And through my products, workshops, and community, I've already introduced around 150 entrepreneurs to the platform I currently use.</p>

  <!-- 8. Evidence row -->
  <div class="evidence-row" style="display:flex;gap:32px;margin:64px 0;">
    <div style="flex:1;border-top:1px solid #3B3B3B;padding-top:20px;">
      <div style="font-family:'Cormorant Garamond',serif;font-size:52px;font-weight:300;line-height:1;margin-bottom:8px;">17</div>
      <div style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:18px;font-weight:300;margin-bottom:8px;">builders</div>
      <div style="font-family:'Public Sans',sans-serif;font-size:13px;font-weight:300;line-height:1.5;opacity:0.7;">built working tools in one 90-minute session</div>
    </div>
    <div style="flex:1;border-top:1px solid #3B3B3B;padding-top:20px;">
      <div style="font-family:'Cormorant Garamond',serif;font-size:52px;font-weight:300;line-height:1;margin-bottom:8px;">150+</div>
      <div style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:18px;font-weight:300;margin-bottom:8px;">entrepreneurs</div>
      <div style="font-family:'Public Sans',sans-serif;font-size:13px;font-weight:300;line-height:1.5;opacity:0.7;">followed me onto a platform</div>
    </div>
    <div style="flex:1;border-top:1px solid #3B3B3B;padding-top:20px;">
      <div style="font-family:'Cormorant Garamond',serif;font-size:52px;font-weight:300;line-height:1;margin-bottom:8px;">1</div>
      <div style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:18px;font-weight:300;margin-bottom:8px;">conversation</div>
      <div style="font-family:'Public Sans',sans-serif;font-size:13px;font-weight:300;line-height:1.5;opacity:0.7;">changed what was built next</div>
    </div>
  </div>

  <!-- 9. Transition -->
  <p style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:24px;font-weight:300;margin:80px 0 40px 0;color:#3B3B3B;">So here's what I keep imagining.</p>

  <!-- 10. Body paragraph -->
  <p class="body-p">Ninety days of helping shape Stencil into a platform that feels just as intuitive for the everyday entrepreneur as it does for someone who already thinks of themselves as a builder.</p>

  <!-- 11. Numbered list -->
  <div style="margin:48px 0;">
    <div style="display:flex;gap:32px;align-items:flex-start;padding:24px 0;">
      <span style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:22px;font-weight:300;opacity:0.5;min-width:32px;flex-shrink:0;padding-top:2px;">01</span>
      <span style="font-family:'Public Sans',sans-serif;font-size:17px;font-weight:300;line-height:1.8;">A standing working session — weekly time with you and the team while the product is still becoming itself.</span>
    </div>
    <div style="height:1px;background:#3B3B3B;opacity:0.15;"></div>
    <div style="display:flex;gap:32px;align-items:flex-start;padding:24px 0;">
      <span style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:22px;font-weight:300;opacity:0.5;min-width:32px;flex-shrink:0;padding-top:2px;">02</span>
      <span style="font-family:'Public Sans',sans-serif;font-size:17px;font-weight:300;line-height:1.8;">Ongoing platform testing — against the bar a non-technical creative actually needs: the Claude connection, HTML import, the first-five-minutes experience.</span>
    </div>
    <div style="height:1px;background:#3B3B3B;opacity:0.15;"></div>
    <div style="display:flex;gap:32px;align-items:flex-start;padding:24px 0;">
      <span style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:22px;font-weight:300;opacity:0.5;min-width:32px;flex-shrink:0;padding-top:2px;">03</span>
      <span style="font-family:'Public Sans',sans-serif;font-size:17px;font-weight:300;line-height:1.8;">Reference builds — stress-testing key workflows beyond CRMs: calculators, dashboards, directories, portals.</span>
    </div>
    <div style="height:1px;background:#3B3B3B;opacity:0.15;"></div>
    <div style="display:flex;gap:32px;align-items:flex-start;padding:24px 0;">
      <span style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:22px;font-weight:300;opacity:0.5;min-width:32px;flex-shrink:0;padding-top:2px;">04</span>
      <span style="font-family:'Public Sans',sans-serif;font-size:17px;font-weight:300;line-height:1.8;">Beginner experience recommendations — where new builders will get stuck, in what order, and what closes each gap.</span>
    </div>
  </div>

  <!-- 12. Aside -->
  <aside style="font-family:'Public Sans',sans-serif;font-size:15px;font-weight:300;line-height:1.8;border-left:2px solid #B9C8B1;padding-left:28px;margin:48px 0;color:#3B3B3B;opacity:0.85;">This isn't community management or support. It's focused product feedback from the perspective of the non-technical entrepreneur, with recommendations your team can turn into a stronger beginner experience.</aside>

  <!-- 13. Transition -->
  <p style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:24px;font-weight:300;margin:80px 0 40px 0;color:#3B3B3B;">And then, the fun part.</p>

  <!-- 14. Body paragraphs -->
  <p class="body-p">If, at the end of these 90 days, Stencil is a platform I feel confident teaching and recommending, I'd love to explore a second phase focused on education, workshops, curriculum, and bringing more service-based entrepreneurs into the platform.</p>
  <p class="body-p">I'm preparing to teach this much more publicly beginning next month, and I'm thinking carefully about the platform experience I want to put in front of that audience. It's part of why the timing of our conversations feels so right.</p>

  <!-- 15. Offer card -->
  <div class="offer-card" style="background:#FFFFFF;border:1px solid #3B3B3B;border-radius:0;padding:72px;margin:80px 0;">
    <p style="font-family:'Public Sans',sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.55;margin:0 0 24px 0;">ONE SIMPLE WAY TO START</p>
    <h2 style="font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:300;margin:0 0 12px 0;">Product &amp; Adoption Advisor</h2>
    <p style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:20px;font-weight:300;margin:0 0 36px 0;">A three-month strategic engagement</p>
    <ul style="font-family:'Public Sans',sans-serif;font-size:16px;font-weight:300;line-height:2;padding-left:20px;margin:0 0 40px 0;">
      <li>Weekly working sessions with you and the team.</li>
      <li>Hands-on testing as new features roll out.</li>
      <li>Reference builds that stress-test real entrepreneur use cases.</li>
      <li>Clear recommendations for making Stencil more intuitive and teachable.</li>
    </ul>
    <p style="font-family:'Cormorant Garamond',serif;font-size:36px;font-weight:300;margin:0 0 28px 0;">$6,000/month · 3 months</p>
    <p style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:19px;font-weight:300;margin:0;line-height:1.6;">If this feels like the right direction, I'd love to talk through what working together could look like.</p>
  </div>

  <!-- 16. Closing -->
  <p class="body-p" style="margin-top:80px;">Whether this turns into something formal or not, I'm so excited about what you're building. I just couldn't shake the feeling that I have something real to contribute.</p>

  <!-- 17. Signature -->
  <p style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:32px;font-weight:300;margin:48px 0 32px 0;">XO, Angie</p>

  <!-- 18. Mailto link -->
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
