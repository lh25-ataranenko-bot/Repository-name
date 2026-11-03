"use client";

import { CarEditor } from "@/components/CarEditor";
import { AdminGate } from "../../gate";

export default function NewCar() {
  return <AdminGate><CarEditor /></AdminGate>;
}
