import { useRef, useEffect } from "react";
import { Card } from "./ui/card";
import { Input } from "./ui/input";

interface NewNoteCardProps {
  onSave: (title: string) => void;
  onCancel: () => void;
}

export function NewNoteCard({ onSave, onCancel }: NewNoteCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onSave(e.currentTarget.value);
    }
    if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <Card className="border-border shadow-md min-w-[160px] max-w-[240px] p-3 bg-background border-dashed border-2">
      <Input
        ref={inputRef}
        type="text"
        placeholder="New note title..."
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        className="h-6 text-sm font-semibold text-center border-none focus-visible:ring-0 p-0"
      />
    </Card>
  );
}
