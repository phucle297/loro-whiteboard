import { redirect } from "next/navigation";

export default function Home() {
  redirect(`/board/${crypto.randomUUID()}`);
}
