import { Suspense } from "react";
import GoodbyeClient from "./GoodbyeClient";

export default function GoodbyePage() {
  return (
    <Suspense>
      <GoodbyeClient />
    </Suspense>
  );
}
