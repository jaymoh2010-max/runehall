import { useParams } from "react-router-dom";
import { CharacterSheetView } from "../components/sheet/CharacterSheetView";

export function PathbuilderSheetPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <CharacterSheetView characterId={id} mode="page" />;
}
