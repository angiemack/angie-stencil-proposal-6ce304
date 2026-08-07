import { Text, type StringKey } from "~stencil/strings";

const lines: StringKey[] = [
  "letter.offer.line1",
  "letter.offer.line2",
  "letter.offer.line3",
  "letter.offer.line4",
];

/**
 * The single offer, stated plainly. A white card ruled in charcoal with
 * sharp corners and no shadow — a printed enclosure tucked into the letter.
 */
export function OfferCard() {
  return (
    <div className="bg-card text-card-foreground border border-ink p-9 sm:p-14 md:p-[72px]">
      <Text
        id="letter.offer.label"
        as="div"
        className="font-sans font-normal text-[11px] uppercase tracking-[0.24em] opacity-55"
      />
      <Text
        id="letter.offer.heading"
        as="h2"
        className="font-display font-light text-[28px] sm:text-[32px] leading-[1.1] tracking-[-0.01em] mt-5"
      />
      <Text
        id="letter.offer.subhead"
        as="p"
        className="font-display italic font-normal text-[19px] sm:text-[21px] mt-2"
      />

      <div className="mt-8 border-t border-ink/15">
        {lines.map((id) => (
          <Text
            key={id}
            id={id}
            as="p"
            className="font-sans font-light text-[15px] sm:text-[16px] leading-[1.5] py-4 border-b border-ink/15"
          />
        ))}
      </div>

      <Text
        id="letter.offer.price"
        as="div"
        className="font-display font-light text-[32px] sm:text-[36px] tracking-[-0.01em] mt-9"
      />
      <Text
        id="letter.offer.closer"
        as="p"
        className="font-display italic font-normal text-[17px] sm:text-[18px] leading-[1.5] text-foreground-secondary mt-3"
      />
    </div>
  );
}
