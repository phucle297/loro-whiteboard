import { Whiteboard } from "../../../domains/canvas/whiteboard";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BoardPage({ params }: PageProps) {
  const { id } = await params;
  return <Whiteboard roomId={id} />;
}
