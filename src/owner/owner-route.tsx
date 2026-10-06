import { OwnerGate } from "./owner-gate";
import { OwnerLayout } from "./owner-layout";

export function OwnerRoute() {
  return <OwnerGate><OwnerLayout /></OwnerGate>;
}
