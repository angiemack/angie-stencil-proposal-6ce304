import type { Route } from "./+types/home";
import { Text, type StringKey } from "~stencil/strings";
import { Reveal } from "~/components/letter/reveal";
import { EvidenceRow } from "~/components/letter/evidence-row";
import { NumberedList } from "~/components/letter/numbered-list";
import { OfferCard } from "~/components/letter/offer-card";

export const prerender = true;

export function meta(_: Route.MetaArgs) {
  return [
    { title: "For Martha — Angie McPherson" },
    {
      name: "description",
      content:
        "A working idea for Stencil: the gap it can own, and a simple way to start.",
    },
  ];
}

/* A body paragraph in the letter's reading serif-free voice. */
function Body({ id, className = "" }: { id: StringKey; className?: string }) {
  return (
    <Text
      id={id}
      as="p"
      className={`font-sans font-light text-[18px] sm:text-[19px] leading-[1.78] ${className}`}
    />
  );
}

/* An italic serif line that turns the letter to its next thought. */
function Transition({ id }: { id: StringKey }) {
  return (
    <Text
      id={id}
      as="p"
      className="font-display italic font-light text-[22px] sm:text-[24px] leading-[1.35]"
    />
  );
}

export default function Letter() {
  return (
    <main className="min-h-screen bg-background text-foreground selection:bg-rose/40">
      <noscript>
        <style>{`.reveal{opacity:1 !important;transform:none !important;}`}</style>
      </noscript>
      <article className="mx-auto w-full max-w-[680px] px-6 pt-[104px] pb-40 sm:pt-[140px]">
        {/* Kicker */}
        <Reveal>
          <Text
            id="letter.kicker"
            as="p"
            className="font-sans font-normal text-[11px] uppercase tracking-[0.22em] opacity-55"
          />
        </Reveal>

        {/* Headline */}
        <Reveal delay={80}>
          <h1 className="mt-8 font-display font-light leading-[1.03] tracking-[-0.02em] text-[46px] sm:text-[64px]">
            <Text id="letter.headline.line1" as="span" />
            <br />
            <Text
              id="letter.headline.line2"
              as="span"
              className="italic"
            />
          </h1>
        </Reveal>

        {/* Salutation */}
        <Reveal delay={140}>
          <Text
            id="letter.salutation"
            as="p"
            className="mt-14 font-display font-light text-[26px] sm:text-[27px]"
          />
        </Reveal>

        {/* Opening */}
        <Reveal>
          <div className="mt-8 space-y-6">
            <Body id="letter.intro.p1" />
            <Body id="letter.intro.p2" />
          </div>
        </Reveal>

        {/* Pull quote — the letter's one accent of colour */}
        <Reveal>
          <blockquote className="mt-16 border-l-2 border-rose pl-7 sm:pl-9">
            <Text
              id="letter.pullquote"
              as="p"
              className="font-display italic font-light text-[26px] sm:text-[30px] leading-[1.4]"
            />
          </blockquote>
        </Reveal>

        {/* Transition */}
        <Reveal>
          <div className="mt-24">
            <Transition id="letter.transition1" />
          </div>
        </Reveal>

        {/* The moment */}
        <Reveal>
          <div className="mt-8 space-y-6">
            <Body id="letter.moment.p1" />
            <Body id="letter.moment.p2" />
          </div>
        </Reveal>

        {/* Evidence */}
        <Reveal>
          <div className="mt-16">
            <EvidenceRow />
          </div>
        </Reveal>

        {/* Transition */}
        <Reveal>
          <div className="mt-24">
            <Transition id="letter.transition2" />
          </div>
        </Reveal>

        {/* Ninety days */}
        <Reveal>
          <div className="mt-8">
            <Body id="letter.ninetyDays" />
          </div>
        </Reveal>

        {/* Numbered plan */}
        <Reveal>
          <div className="mt-12">
            <NumberedList />
          </div>
        </Reveal>

        {/* Aside */}
        <Reveal>
          <div className="mt-14 border-l-2 border-sage pl-7 sm:pl-9">
            <Text
              id="letter.aside"
              as="p"
              className="font-sans font-light text-[15px] sm:text-[16px] leading-[1.7] text-foreground-secondary"
            />
          </div>
        </Reveal>

        {/* Transition */}
        <Reveal>
          <div className="mt-24">
            <Transition id="letter.transition3" />
          </div>
        </Reveal>

        {/* Second phase */}
        <Reveal>
          <div className="mt-8 space-y-6">
            <Body id="letter.future.p1" />
            <Body id="letter.future.p2" />
          </div>
        </Reveal>

        {/* Offer card */}
        <Reveal>
          <div className="mt-20">
            <OfferCard />
          </div>
        </Reveal>

        {/* Closing */}
        <Reveal>
          <div className="mt-20">
            <Body id="letter.closing" />
          </div>
        </Reveal>

        {/* Signature */}
        <Reveal>
          <Text
            id="letter.signature"
            as="p"
            className="mt-12 font-display italic font-light text-[30px] sm:text-[32px]"
          />
        </Reveal>

        {/* Link */}
        <Reveal>
          <p className="mt-8">
            <a
              href="mailto:angie@mcphersonphotos.com"
              className="inline-block font-sans font-light text-[15px] border-b border-rose pb-0.5 transition-opacity duration-normal ease-standard hover:opacity-60"
            >
              <Text id="letter.link" as="span" />
            </a>
          </p>
        </Reveal>
      </article>
    </main>
  );
}
