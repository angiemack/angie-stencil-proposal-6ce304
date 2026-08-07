import { Text } from "~stencil/strings";

const items = ["a", "b", "c"] as const;

/**
 * Three figures set side by side, each under a hairline charcoal rule —
 * the letter's one moment of quiet data.
 */
export function EvidenceRow() {
  return (
    <div className="grid grid-cols-3 gap-x-6 sm:gap-x-10">
      {items.map((key) => (
        <div key={key} className="border-t border-ink pt-5">
          <Text
            id={`letter.evidence.${key}.number`}
            as="div"
            className="font-display font-light leading-none text-[40px] sm:text-[52px] tracking-[-0.02em]"
          />
          <Text
            id={`letter.evidence.${key}.label`}
            as="div"
            className="font-display italic font-normal text-[18px] sm:text-[20px] mt-1"
          />
          <Text
            id={`letter.evidence.${key}.caption`}
            as="p"
            className="font-sans font-light text-[12px] sm:text-[13px] leading-[1.5] text-foreground-secondary mt-3"
          />
        </div>
      ))}
    </div>
  );
}
