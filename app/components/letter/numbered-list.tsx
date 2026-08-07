import { Text, type StringKey } from "~stencil/strings";

const rows: { num: StringKey; item: StringKey }[] = [
  { num: "letter.list.n1", item: "letter.list.i1" },
  { num: "letter.list.n2", item: "letter.list.i2" },
  { num: "letter.list.n3", item: "letter.list.i3" },
  { num: "letter.list.n4", item: "letter.list.i4" },
];

/**
 * The 90-day plan, 01–04. Each line rides its own hairline divider, with
 * the numeral set large and soft in the display serif.
 */
export function NumberedList() {
  return (
    <ol className="list-none p-0 m-0">
      {rows.map(({ num, item }) => (
        <li
          key={num}
          className="grid grid-cols-[2.5rem_1fr] sm:grid-cols-[3.5rem_1fr] gap-x-5 sm:gap-x-8 items-baseline py-7 border-t border-ink/15 first:border-t-0"
        >
          <Text
            id={num}
            as="span"
            className="font-display italic font-light text-[26px] sm:text-[30px] leading-none opacity-55"
          />
          <Text
            id={item}
            as="p"
            className="font-sans font-light text-[16px] sm:text-[17px] leading-[1.65]"
          />
        </li>
      ))}
    </ol>
  );
}
