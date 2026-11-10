import type { ComponentProps } from "react";
// Next's router is outside this component host. Preserve real link destinations.
export default function Link(props: ComponentProps<"a">) { return <a {...props} />; }
