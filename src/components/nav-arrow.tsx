import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowRight } from "@fortawesome/free-solid-svg-icons";

const icons = { left: faArrowLeft, right: faArrowRight };

/** The arrow beside a navigation link. Decorative: the link text already names the target, so it
 *  is hidden from assistive tech rather than announced as "arrow left". */
export function NavArrow({
  direction,
  className = "",
}: {
  direction: "left" | "right";
  className?: string;
}) {
  return (
    <FontAwesomeIcon
      icon={icons[direction]}
      aria-hidden
      // Inline style, not a utility class: Font Awesome's own stylesheet is unlayered, so it beats
      // Tailwind's layered utilities and pins the icon at 1em x 1.25em whatever we set here.
      style={{
        height: "0.72em",
        width: "0.72em",
        verticalAlign: "-0.04em",
        // The single JSX space beside the label collapses once the icon is inline-block.
        [direction === "left" ? "marginRight" : "marginLeft"]: "0.15em",
      }}
      className={`inline-block ${className}`}
    />
  );
}
