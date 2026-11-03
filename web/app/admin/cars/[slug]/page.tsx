"use client";

import { use } from "react";
import { CarEditor } from "@/components/CarEditor";
import { AdminGate } from "../../gate";

export default function EditCar({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <AdminGate><CarEditor slug={slug} /></AdminGate>;
}
